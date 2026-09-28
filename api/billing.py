"""Server-owned lifetime grants and Stripe subscriptions. Never trust browser plans."""
from __future__ import annotations

import json
import os
import time
from http import HTTPStatus
from urllib.request import Request, urlopen
from urllib.parse import urlsplit

import psycopg
from psycopg.rows import dict_row

from api.user_data import _database_url, authenticated_user
from api._common import JsonHandler


class BillingUnavailable(RuntimeError):
    pass


def enabled():
    return os.environ.get("SYLLABLOOM_BILLING_ENABLED") == "true"


def connection():
    if not _database_url():
        raise BillingUnavailable("Billing storage is unavailable.")
    return psycopg.connect(_database_url(), connect_timeout=5, row_factory=dict_row)


def ensure_schema(db):
    # Serialize first-time DDL as well as slot allocation across cold starts.
    db.execute("SELECT pg_advisory_xact_lock(741938201)")
    db.execute("""CREATE TABLE IF NOT EXISTS syllabloom_access (
        user_id TEXT PRIMARY KEY, grant_kind TEXT,
        free_slot INTEGER UNIQUE CHECK (free_slot BETWEEN 1 AND 10),
        customer_id TEXT UNIQUE, checkout_id TEXT, checkout_cadence TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (grant_kind IS NULL OR grant_kind IN ('founder', 'early')),
        CHECK ((grant_kind = 'early' AND free_slot IS NOT NULL)
            OR (grant_kind IS DISTINCT FROM 'early' AND free_slot IS NULL)))""")
    db.execute("""CREATE TABLE IF NOT EXISTS syllabloom_stripe_events (
        event_id TEXT PRIMARY KEY, received_at TIMESTAMPTZ NOT NULL DEFAULT NOW())""")
    db.execute("""CREATE TABLE IF NOT EXISTS syllabloom_subscription_status (
        customer_id TEXT PRIMARY KEY, has_access BOOLEAN NOT NULL,
        verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW())""")


def founders():
    try:
        value = json.loads(os.environ.get("SYLLABLOOM_FOUNDER_IDS", ""))
        if not isinstance(value, list) or not value or any(not isinstance(x, str) or not x.startswith('user_') for x in value):
            raise ValueError()
        return set(value)
    except (ValueError, TypeError):
        raise BillingUnavailable("The founder snapshot has not been configured.")


def first_new_users(excluded):
    """Read signup order from Clerk, not arrival order at the billing endpoint."""
    key = os.environ.get("CLERK_SECRET_KEY", "")
    if not key:
        raise BillingUnavailable("Account verification is not configured.")
    result = []
    offset = 0
    while len(result) < 10:
        req = Request(f"https://api.clerk.com/v1/users?limit=100&offset={offset}&order_by=%2Bcreated_at",
                      headers={"Authorization": f"Bearer {key}", "User-Agent": "Syllabloom/1.0", "Accept": "application/json"})
        with urlopen(req, timeout=8) as response:
            users = json.load(response)
        if not isinstance(users, list):
            raise BillingUnavailable("Account verification is unavailable.")
        for user in users:
            if user['id'] not in excluded:
                result.append(user['id'])
                if len(result) == 10:
                    return result
        if len(users) < 100:
            break
        offset += 100
    return result


def access_record(user_id):
    existing = founders()
    with connection() as db:
        ensure_schema(db)
        # One transaction serializes claims across every serverless instance.
        db.execute("SELECT pg_advisory_xact_lock(741938201)")
        for uid in existing:
            db.execute("INSERT INTO syllabloom_access (user_id, grant_kind) VALUES (%s, 'founder') ON CONFLICT (user_id) DO NOTHING", (uid,))
        grants = db.execute("SELECT user_id, free_slot FROM syllabloom_access WHERE grant_kind='early' ORDER BY free_slot").fetchall()
        if len(grants) < 10:
            claimed = {r['user_id'] for r in grants}
            # Keep deleted users' allocated slots forever; never recycle them.
            candidates = first_new_users(existing | claimed)
            next_slot = max((r['free_slot'] for r in grants), default=0) + 1
            for uid in candidates[:10 - len(grants)]:
                db.execute("""INSERT INTO syllabloom_access(user_id, grant_kind, free_slot)
                    VALUES (%s, 'early', %s) ON CONFLICT (user_id) DO UPDATE
                    SET grant_kind='early', free_slot=EXCLUDED.free_slot
                    WHERE syllabloom_access.grant_kind IS NULL""", (uid, next_slot))
                next_slot += 1
        db.execute("INSERT INTO syllabloom_access (user_id) VALUES (%s) ON CONFLICT DO NOTHING", (user_id,))
        return db.execute("SELECT * FROM syllabloom_access WHERE user_id=%s", (user_id,)).fetchone()


def stripe_client():
    import stripe
    key = os.environ.get('STRIPE_SECRET_KEY', '')
    mode = os.environ.get('STRIPE_MODE', 'test')
    expected = ('sk_live_', 'rk_live_') if mode == 'live' else ('sk_test_', 'rk_test_')
    if not key.startswith(expected):
        raise BillingUnavailable('The payment environment is not configured correctly.')
    if os.environ.get('VERCEL_ENV') == 'preview' and mode == 'live':
        raise BillingUnavailable('Preview cannot use live payments.')
    return stripe.StripeClient(key, stripe_version='2026-08-26.dahlia', max_network_retries=2)


def prices():
    result = {k: os.environ.get(f'STRIPE_PRICE_{k.upper()}', '') for k in ('monthly', 'yearly')}
    if not all(v.startswith('price_') for v in result.values()):
        raise BillingUnavailable('Subscription prices are not configured.')
    return result


def subscription_access(sub, allowed_prices, now=None):
    sub = sub if isinstance(sub, dict) else sub.to_dict()
    now = time.time() if now is None else now
    if sub.get('status') not in {'active', 'trialing'}:
        return None
    for item in sub.get('items', {}).get('data', []):
        price = item.get('price', {})
        if price.get('id') in allowed_prices.values() and item.get('current_period_end', sub.get('current_period_end', 0)) > now:
            return {'cadence': next(k for k, v in allowed_prices.items() if v == price['id']),
                    'cancelAtPeriodEnd': bool(sub.get('cancel_at_period_end')),
                    'currentPeriodEnd': item.get('current_period_end', sub.get('current_period_end'))}
    return None


def active_subscription(client, record):
    if not record.get('customer_id'):
        return None
    for sub in client.v1.subscriptions.list({'customer': record['customer_id'], 'status': 'all', 'limit': 100}).auto_paging_iter():
        access = subscription_access(sub, prices())
        if access:
            return access
    return None


def status_for(user_id):
    record = access_record(user_id)
    if record['grant_kind']:
        return {'access': True, 'plan': record['grant_kind'], 'freeSlot': record['free_slot'], 'lifetime': True}
    paid = active_subscription(stripe_client(), record)
    return {'access': bool(paid), 'plan': 'student' if paid else 'unpaid', 'lifetime': False,
            'canManage': bool(record['customer_id']), **(paid or {})}


def require_access(request):
    if not enabled():
        return True
    user = authenticated_user(request.headers)
    if not user:
        request.send_json({'error': 'Sign in to use your study tools.'}, HTTPStatus.UNAUTHORIZED)
        return False
    try:
        status = status_for(user)
    except Exception:
        request.send_json({'error': 'We could not verify your access. Please try again.'}, HTTPStatus.SERVICE_UNAVAILABLE)
        return False
    if not status['access']:
        request.send_json({'error': 'Choose a plan to turn your class material into study tools.', 'code': 'subscription_required'}, HTTPStatus.PAYMENT_REQUIRED)
        return False
    return True


def app_url():
    value = os.environ.get('SYLLABLOOM_APP_URL', '').rstrip('/')
    parsed = urlsplit(value)
    if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password
        or parsed.path or parsed.query or parsed.fragment):
        raise BillingUnavailable('The checkout return URL is not configured.')
    return value


def checkout(user_id, cadence):
    if cadence not in {'monthly', 'yearly'}:
        raise ValueError('Choose monthly or yearly billing.')
    record = access_record(user_id)
    if record['grant_kind']:
        return {'alreadyIncluded': True}
    if not os.environ.get('STRIPE_WEBHOOK_SECRET') or not os.environ.get('STRIPE_PORTAL_CONFIGURATION', '').startswith('bpc_'):
        raise BillingUnavailable('Payment verification and subscription management must be configured first.')
    client = stripe_client()
    price = client.v1.prices.retrieve(prices()[cadence])
    price = price if isinstance(price, dict) else price.to_dict()
    expected = 1200 if cadence == 'monthly' else 10800
    if (price.get('unit_amount') != expected or price.get('currency') != 'usd'
        or price.get('recurring', {}).get('interval') != ('month' if cadence == 'monthly' else 'year')
        or price.get('recurring', {}).get('interval_count') != 1 or not price.get('active')
        or bool(price.get('livemode')) != (os.environ.get('STRIPE_MODE') == 'live')):
        raise BillingUnavailable('The configured price does not match the displayed offer.')
    # Customer creation and Checkout are serialized per account to avoid duplicates.
    with connection() as db:
        record = db.execute('SELECT * FROM syllabloom_access WHERE user_id=%s FOR UPDATE', (user_id,)).fetchone()
        if not record['customer_id']:
            customer = client.v1.customers.create({'metadata': {'syllabloom_user_id': user_id}},
                                                options={'idempotency_key': f'syllabloom-customer-{user_id}'})
            record['customer_id'] = customer.id
            db.execute('UPDATE syllabloom_access SET customer_id=%s WHERE user_id=%s', (customer.id, user_id))
        if active_subscription(client, record):
            return {'alreadyIncluded': True}
        if record['checkout_id']:
            old = client.v1.checkout.sessions.retrieve(record['checkout_id']).to_dict()
            if old['status'] == 'open':
                if record['checkout_cadence'] == cadence:
                    return {'url': old['url']}
                client.v1.checkout.sessions.expire(old['id'])
            elif old['status'] == 'complete':
                # Do not open a second subscription while an async payment settles.
                if old['payment_status'] == 'unpaid':
                    previous_sub = client.v1.subscriptions.retrieve(old['subscription']) if old.get('subscription') else None
                    if previous_sub and not isinstance(previous_sub, dict):
                        previous_sub = previous_sub.to_dict()
                    if not previous_sub or previous_sub.get('status') not in {'canceled', 'incomplete_expired'}:
                        raise BillingUnavailable('Your payment is processing. Please wait before trying again.')
        session = client.v1.checkout.sessions.create({
            'mode': 'subscription', 'customer': record['customer_id'],
            'client_reference_id': user_id,
            'line_items': [{'price': price['id'], 'quantity': 1}],
            'subscription_data': {'metadata': {'syllabloom_user_id': user_id}},
            'metadata': {'syllabloom_user_id': user_id},
            'success_url': app_url() + '/?checkout=success#billing',
            'cancel_url': app_url() + '/?checkout=canceled#billing',
            'integration_identifier': 'syllabloom-web-qnrtvzpk',
        }, options={'idempotency_key': f"syllabloom-checkout-{user_id}-{cadence}-{record['checkout_id'] or 'initial'}"})
        db.execute('UPDATE syllabloom_access SET checkout_id=%s, checkout_cadence=%s WHERE user_id=%s', (session.id, cadence, user_id))
        return {'url': session.url}


def portal(user_id):
    record = access_record(user_id)
    if not record['customer_id']:
        raise ValueError('No paid subscription to manage.')
    config = os.environ.get('STRIPE_PORTAL_CONFIGURATION', '')
    if not config.startswith('bpc_'):
        raise BillingUnavailable('Subscription management is not configured.')
    result = stripe_client().v1.billing_portal.sessions.create({
        'customer': record['customer_id'], 'configuration': config, 'return_url': app_url() + '/#billing'})
    return {'url': result.url}


def handle_api(request, method):
    if not enabled():
        request.send_json({'enabled': False, 'access': True, 'plan': 'beta'})
        return
    user = authenticated_user(request.headers)
    if not user:
        request.send_json({'error': 'Sign in to check your plan.'}, HTTPStatus.UNAUTHORIZED)
        return
    try:
        if method == 'GET':
            result = {'enabled': True, **status_for(user)}
        else:
            body = JsonHandler.read_json(request, 4096)
            if not isinstance(body, dict):
                raise ValueError('Invalid billing request.')
            if body.get('action') == 'checkout':
                result = checkout(user, body.get('cadence'))
            elif body.get('action') == 'portal':
                result = portal(user)
            else:
                raise ValueError('Unknown billing action.')
        request.send_json(result)
    except ValueError as exc:
        request.send_json({'error': str(exc)}, HTTPStatus.BAD_REQUEST)
    except Exception:
        request.send_json({'error': 'Billing is temporarily unavailable. Your account has not been charged by this request.'}, HTTPStatus.SERVICE_UNAVAILABLE)


def handle_webhook(request):
    import stripe
    secret = os.environ.get('STRIPE_WEBHOOK_SECRET', '')
    if not secret:
        request.send_json({'error': 'Webhook not configured.'}, HTTPStatus.SERVICE_UNAVAILABLE)
        return
    try:
        size = int(request.headers.get('Content-Length', '0'))
        if not 0 < size <= 1024 * 1024:
            raise ValueError('Invalid body size')
        event = stripe.Webhook.construct_event(request.rfile.read(size), request.headers.get('Stripe-Signature', ''), secret).to_dict()
    except (ValueError, stripe.SignatureVerificationError):
        request.send_json({'error': 'Invalid webhook.'}, HTTPStatus.BAD_REQUEST)
        return
    if bool(event.get('livemode')) != (os.environ.get('STRIPE_MODE') == 'live'):
        request.send_json({'error': 'Wrong payment environment.'}, HTTPStatus.BAD_REQUEST)
        return
    try:
        with connection() as db:
            ensure_schema(db)
            # Reconcile the current provider state; never replay stale event state.
            if event['type'] in {'checkout.session.completed', 'checkout.session.async_payment_succeeded',
                              'checkout.session.expired',
                              'checkout.session.async_payment_failed', 'customer.subscription.created',
                              'customer.subscription.updated', 'customer.subscription.deleted',
                              'invoice.paid', 'invoice.payment_failed'}:
                inserted = db.execute('INSERT INTO syllabloom_stripe_events(event_id) VALUES (%s) ON CONFLICT DO NOTHING RETURNING event_id', (event['id'],)).fetchone()
                if inserted:
                    obj = event['data']['object']
                    customer = obj.get('customer')
                    record = db.execute('SELECT * FROM syllabloom_access WHERE customer_id=%s FOR UPDATE', (customer,)).fetchone()
                    if record:
                        paid = active_subscription(stripe_client(), record)
                        if event['type'].startswith('checkout.session.') and obj.get('payment_status') not in {'paid', 'no_payment_required'}:
                            paid = None
                        db.execute('''INSERT INTO syllabloom_subscription_status(customer_id, has_access)
                            VALUES (%s,%s) ON CONFLICT(customer_id) DO UPDATE
                            SET has_access=EXCLUDED.has_access, verified_at=NOW()''', (customer, bool(paid)))
        request.send_json({'received': True})
    except Exception:
        request.send_json({'error': 'Please retry delivery.'}, HTTPStatus.SERVICE_UNAVAILABLE)
