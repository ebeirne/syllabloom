"""Small first-party activation funnel. No document content or contact details."""
import hashlib
import json
import os
import re
import uuid
from http import HTTPStatus

import psycopg
from psycopg.types.json import Jsonb
from api.user_data import authenticated_user, _database_url

CLIENT_EVENTS = {'session_started', 'onboarding_started', 'upload_started', 'extraction_succeeded',
                 'generation_succeeded', 'import_failed', 'study_started', 'study_completed',
                 'anki_exported', 'checkout_started', 'coverage_requested', 'card_issue_reported'}
SCHEMA = '''CREATE TABLE IF NOT EXISTS syllabloom_product_events (
    owner TEXT NOT NULL, event_id UUID NOT NULL, session_id UUID,
    event_name TEXT NOT NULL, cohort TEXT NOT NULL, properties JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(owner,event_id))'''


def configured_ids(name):
    try:
        value = json.loads(os.environ.get(name, '[]'))
        return set(value) if isinstance(value, list) and all(isinstance(v, str) for v in value) else set()
    except (ValueError, TypeError):
        return set()


def cohort(user):
    if user in configured_ids('SYLLABLOOM_FOUNDER_IDS'):
        return 'founder'
    return 'research' if user in configured_ids('SYLLABLOOM_RESEARCH_IDS') else 'organic'


def clean_event(value):
    if not isinstance(value, dict) or value.get('name') not in CLIENT_EVENTS:
        raise ValueError('Unsupported product event.')
    event_id = str(uuid.UUID(str(value.get('id', ''))))
    session_id = str(uuid.UUID(str(value.get('sessionId', ''))))
    raw = value.get('properties', {})
    if not isinstance(raw, dict):
        raise ValueError('Invalid event properties.')
    props = {}
    for key in ('cards', 'sections', 'files'):
        if type(raw.get(key)) is int and 0 <= raw[key] <= 10000:
            props[key] = raw[key]
    choices = {'fileType': {'pdf', 'ppt', 'pptw', 'pptx', 'docx', 'txt'},
               'reason': {'network', 'unreadable', 'access', 'unknown', 'incorrect', 'unclear', 'missing_context'},
               'cadence': {'monthly', 'yearly'}}
    for key, allowed in choices.items():
        if isinstance(raw.get(key), str) and raw[key] in allowed:
            props[key] = raw[key]
    if isinstance(raw.get('referral'), str) and re.fullmatch(r'[a-z0-9_-]{1,40}', raw['referral']):
        props['referral'] = raw['referral']
    return event_id, session_id, value['name'], props


def insert_event(db, user, event_id, session_id, name, properties):
    owner = hashlib.sha256(user.encode()).hexdigest()
    db.execute('''INSERT INTO syllabloom_product_events(owner,event_id,session_id,event_name,cohort,properties)
        VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING''',
        (owner, event_id, session_id, name, cohort(user), Jsonb(properties)))


def record_payment_event(db, user, stripe_event, paid):
    """A savepoint keeps analytics failure from changing billing reconciliation."""
    try:
        with db.transaction():
            db.execute(SCHEMA)
            obj = stripe_event['data']['object']
            kind = stripe_event['type']
            if kind == 'invoice.paid' and int(obj.get('amount_paid') or 0) > 0:
                name = 'payment_succeeded'
                props = {'amountMinor': int(obj['amount_paid']), 'currency': str(obj.get('currency', '')).lower()[:3]}
            elif kind == 'customer.subscription.deleted':
                name, props = 'subscription_ended', {}
            elif kind == 'customer.subscription.updated' and obj.get('cancel_at_period_end'):
                name, props = 'cancellation_scheduled', {}
            else:
                return
            insert_event(db, user, str(uuid.uuid5(uuid.NAMESPACE_URL, stripe_event['id'])), None, name, props)
    except Exception as exc:
        print(f'Product payment metric unavailable: {type(exc).__name__}', flush=True)


def report(db):
    rows = db.execute('''SELECT cohort,event_name,count(*),count(DISTINCT owner)
        FROM syllabloom_product_events WHERE created_at > now()-interval '30 days'
        GROUP BY cohort,event_name ORDER BY cohort,event_name''').fetchall()
    returns = db.execute('''SELECT cohort,count(*) FROM (
        SELECT cohort,owner FROM syllabloom_product_events WHERE event_name='study_completed'
        AND created_at > now()-interval '30 days' GROUP BY cohort,owner
        HAVING count(DISTINCT (created_at AT TIME ZONE 'UTC')::date)>1) returning_users GROUP BY cohort''').fetchall()
    referrals = db.execute('''SELECT properties->>'referral',count(DISTINCT owner)
        FROM syllabloom_product_events WHERE created_at > now()-interval '30 days'
        AND event_name='study_completed' AND properties ? 'referral' AND cohort='organic'
        GROUP BY properties->>'referral' ''').fetchall()
    revenue = db.execute('''SELECT cohort,properties->>'currency',sum((properties->>'amountMinor')::bigint)
        FROM syllabloom_product_events WHERE event_name='payment_succeeded'
        AND created_at > now()-interval '30 days' GROUP BY cohort,properties->>'currency' ''').fetchall()
    return {'days': 30, 'events': [{'cohort': c, 'event': e, 'count': n, 'users': u} for c,e,n,u in rows],
            'returning': dict(returns), 'referrals': [{'code': r, 'studyingUsers': n} for r,n in referrals],
            'grossRevenue': [{'cohort': c, 'currency': cur, 'amountMinor': amount} for c,cur,amount in revenue]}


def handle(request, method):
    user = authenticated_user(request.headers)
    if not user:
        request.send_json({'error': 'Sign in first.'}, HTTPStatus.UNAUTHORIZED); return
    if method == 'GET' and user not in configured_ids('SYLLABLOOM_FOUNDER_IDS'):
        request.send_json({'error': 'This report is for the product team.'}, HTTPStatus.FORBIDDEN); return
    if method not in {'GET', 'POST'}:
        request.send_json({'error': 'Method not allowed.'}, HTTPStatus.METHOD_NOT_ALLOWED); return
    try:
        events = []
        if method == 'POST':
            payload = request.read_json(maximum_bytes=16384)
            if not isinstance(payload, dict) or not isinstance(payload.get('events'), list) or not 1 <= len(payload['events']) <= 20:
                raise ValueError('Send one to twenty events.')
            events = [clean_event(value) for value in payload['events']]
        if not _database_url():
            raise RuntimeError('Storage unavailable')
        with psycopg.connect(_database_url(), connect_timeout=5) as db:
            db.execute(SCHEMA)
            if method == 'GET':
                result = report(db)
            else:
                owner = hashlib.sha256(user.encode()).hexdigest()
                db.execute('SELECT pg_advisory_xact_lock(hashtext(%s))', ('metrics:' + owner,))
                count = db.execute("SELECT count(*) FROM syllabloom_product_events WHERE owner=%s AND created_at>now()-interval '1 day'", (owner,)).fetchone()[0]
                if count + len(events) > 1000:
                    request.send_json({'error': 'Usage event limit reached.'}, HTTPStatus.TOO_MANY_REQUESTS); return
                for event in events:
                    insert_event(db, user, *event)
                result = {'accepted': len(events)}
        request.send_json(result)
    except ValueError as exc:
        request.send_json({'error': str(exc)}, HTTPStatus.BAD_REQUEST)
    except Exception as exc:
        print(f'Product events unavailable: {type(exc).__name__}', flush=True)
        request.send_json({'error': 'Usage reporting is temporarily unavailable.'}, HTTPStatus.SERVICE_UNAVAILABLE)
