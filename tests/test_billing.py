import copy
import io
import hmac
import hashlib
import importlib.util
from pathlib import Path
import json
import time
import unittest
from unittest.mock import MagicMock, patch

from api import billing


class Request:
    def __init__(self, body=b'{}', headers=None):
        self.headers = {'Content-Length': str(len(body)), **(headers or {})}
        self.rfile = io.BytesIO(body)
        self.result = None
    def send_json(self, body, status=200):
        self.result = (int(status), body)


class BillingTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(billing.os.environ, {
            'SYLLABLOOM_BILLING_ENABLED':'true', 'STRIPE_MODE':'test',
            'STRIPE_SECRET_KEY':'sk_test_placeholder', 'STRIPE_PRICE_MONTHLY':'price_month',
            'STRIPE_PRICE_YEARLY':'price_year', 'SYLLABLOOM_FOUNDER_IDS':'["user_founder"]',
            'STRIPE_WEBHOOK_SECRET':'whsec_test', 'STRIPE_PORTAL_CONFIGURATION':'bpc_test',
            'SYLLABLOOM_APP_URL':'https://syllabloom-beta.vercel.app'}, clear=True)
        self.env.start(); self.addCleanup(self.env.stop)
        self.sub = {'status':'active', 'items':{'data':[{'price':{'id':'price_month'},'current_period_end':2000}]}}

    def test_paid_plan_requires_current_period_and_allowed_price(self):
        self.assertEqual(billing.subscription_access(self.sub,billing.prices(),1000)['cadence'],'monthly')
        for status in ['canceled','past_due','unpaid','incomplete','incomplete_expired','paused']:
            sub=copy.deepcopy(self.sub);sub['status']=status
            self.assertIsNone(billing.subscription_access(sub,billing.prices(),1000))
        self.assertIsNone(billing.subscription_access(self.sub,billing.prices(),2001))
        self.sub['items']['data'][0]['price']['id']='price_other_product'
        self.assertIsNone(billing.subscription_access(self.sub,billing.prices(),1000))

    def test_cancel_at_period_end_keeps_paid_period(self):
        self.sub['cancel_at_period_end']=True
        self.assertTrue(billing.subscription_access(self.sub,billing.prices(),1000)['cancelAtPeriodEnd'])

    def test_lifetime_accounts_never_need_stripe_or_checkout(self):
        for kind in ['founder','early']:
            with patch.object(billing,'access_record',return_value={'grant_kind':kind,'free_slot':1}), patch.object(billing,'stripe_client') as provider:
                self.assertTrue(billing.status_for('user_x')['lifetime'])
                self.assertEqual(billing.checkout('user_x','yearly'),{'alreadyIncluded':True})
                provider.assert_not_called()

    def test_paid_access_fails_closed_on_provider_failure(self):
        req=Request()
        with patch.object(billing,'authenticated_user',return_value='user_x'), patch.object(billing,'status_for',side_effect=RuntimeError()):
            self.assertFalse(billing.require_access(req));self.assertEqual(req.result[0],503)

    def test_anonymous_and_unpaid_are_not_entitled(self):
        for user,status,code in [(None,{},401),('user_x',{'access':False},402)]:
            req=Request()
            with patch.object(billing,'authenticated_user',return_value=user),patch.object(billing,'status_for',return_value=status):
                self.assertFalse(billing.require_access(req));self.assertEqual(req.result[0],code)

    def test_wrong_price_rejected_before_customer_or_session_creation(self):
        client=MagicMock();client.v1.prices.retrieve.return_value={'unit_amount':900,'currency':'usd','active':True,'livemode':False,'recurring':{'interval':'year','interval_count':1}}
        with patch.object(billing,'access_record',return_value={'grant_kind':None}),patch.object(billing,'stripe_client',return_value=client):
            with self.assertRaises(billing.BillingUnavailable):billing.checkout('user_x','yearly')
        client.v1.checkout.sessions.create.assert_not_called()
        client.v1.customers.create.assert_not_called()

    def test_preview_never_uses_live_secret(self):
        with patch.dict(billing.os.environ,{'VERCEL_ENV':'preview','STRIPE_MODE':'live','STRIPE_SECRET_KEY':'sk_live_placeholder'}):
            with self.assertRaises(billing.BillingUnavailable):billing.stripe_client()

    def test_invalid_webhook_signature_is_rejected(self):
        req=Request(b'{"id":"evt_forged"}',{'Stripe-Signature':'bad'})
        with patch.dict(billing.os.environ,{'STRIPE_WEBHOOK_SECRET':'whsec_test'}),patch.object(billing,'connection') as db:
            billing.handle_webhook(req)
            self.assertEqual(req.result[0],400);db.assert_not_called()

    def test_user_order_comes_from_clerk_and_excludes_founders(self):
        records=[{'id':'user_founder'}]+[{'id':f'user_{i}'} for i in range(15)]
        response=MagicMock();response.__enter__.return_value=io.BytesIO(json.dumps(records).encode())
        with patch.dict(billing.os.environ,{'CLERK_SECRET_KEY':'sk_test_placeholder'}),patch.object(billing,'urlopen',return_value=response) as call:
            self.assertEqual(billing.first_new_users({'user_founder'}),[f'user_{i}' for i in range(10)])
            self.assertIn('order_by=%2Bcreated_at',call.call_args.args[0].full_url)

    def test_missing_snapshot_does_not_accidentally_consume_slots(self):
        with patch.dict(billing.os.environ,{'SYLLABLOOM_FOUNDER_IDS':''}):
            with self.assertRaises(billing.BillingUnavailable):billing.founders()

    def checkout_fixture(self, cadence='monthly', old=None):
        import stripe
        client = MagicMock()
        client.v1.prices.retrieve.return_value = stripe.StripeObject.construct_from({
            'id': 'price_month' if cadence == 'monthly' else 'price_year',
            'unit_amount': 1200 if cadence == 'monthly' else 10800, 'currency':'usd',
            'active':True, 'livemode':False,
            'recurring':{'interval':'month' if cadence == 'monthly' else 'year','interval_count':1}},None)
        record = {'grant_kind':None,'customer_id':'cus_ours','checkout_id':old and old['id'],'checkout_cadence':'monthly'}
        db = MagicMock()
        db.execute.return_value.fetchone.return_value = record
        manager = MagicMock(); manager.__enter__.return_value = db
        for name, value in [('access_record',record),('stripe_client',client),('connection',manager),('active_subscription',None)]:
            patcher = patch.object(billing,name,return_value=value); patcher.start(); self.addCleanup(patcher.stop)
        if old: client.v1.checkout.sessions.retrieve.return_value = stripe.StripeObject.construct_from(old,None)
        client.v1.checkout.sessions.create.return_value = stripe.StripeObject.construct_from({'id':'cs_new','url':'https://checkout.stripe.com/new'},None)
        return client,db

    def test_existing_open_checkout_is_reused(self):
        client,_ = self.checkout_fixture(old={'id':'cs_old','status':'open','url':'https://checkout.stripe.com/old'})
        self.assertEqual(billing.checkout('user_x','monthly')['url'],'https://checkout.stripe.com/old')
        client.v1.checkout.sessions.create.assert_not_called()

    def test_yearly_checkout_expires_old_monthly_session_and_uses_fixed_price(self):
        client,_ = self.checkout_fixture('yearly',{'id':'cs_old','status':'open','url':'https://checkout.stripe.com/old'})
        billing.checkout('user_x','yearly')
        client.v1.checkout.sessions.expire.assert_called_once_with('cs_old')
        params = client.v1.checkout.sessions.create.call_args.args[0]
        self.assertEqual(params['line_items'],[{'price':'price_year','quantity':1}])
        self.assertEqual(params['customer'],'cus_ours')
        self.assertEqual(params['success_url'],'https://syllabloom-beta.vercel.app/?checkout=success#billing')

    def test_async_payment_cannot_create_second_subscription(self):
        client,_ = self.checkout_fixture(old={'id':'cs_old','status':'complete','payment_status':'unpaid','subscription':'sub_old'})
        client.v1.subscriptions.retrieve.return_value = {'status':'incomplete'}
        with self.assertRaises(billing.BillingUnavailable): billing.checkout('user_x','monthly')
        client.v1.checkout.sessions.create.assert_not_called()

    def test_terminal_failed_payment_can_retry(self):
        client,_ = self.checkout_fixture(old={'id':'cs_old','status':'complete','payment_status':'unpaid','subscription':'sub_old'})
        client.v1.subscriptions.retrieve.return_value = {'status':'incomplete_expired'}
        self.assertIn('url',billing.checkout('user_x','monthly'))

    def test_webhook_valid_signature_rejects_wrong_mode(self):
        body = json.dumps({'id':'evt_test','type':'invoice.paid','livemode':True,'data':{'object':{}}}).encode()
        timestamp = str(int(time.time()))
        signature = hmac.new(b'whsec_test',timestamp.encode()+b'.'+body,hashlib.sha256).hexdigest()
        req = Request(body,{'Stripe-Signature':f't={timestamp},v1={signature}'})
        with patch.object(billing,'connection') as db:
            billing.handle_webhook(req)
            self.assertEqual(req.result[0],400); db.assert_not_called()

    def test_disabled_billing_cannot_start_checkout(self):
        req = Request(b'{"action":"checkout","cadence":"monthly"}')
        with patch.dict(billing.os.environ,{'SYLLABLOOM_BILLING_ENABLED':'false'}),patch.object(billing,'checkout') as create:
            billing.handle_api(req,'POST'); create.assert_not_called()
            self.assertFalse(req.result[1]['enabled'])

    def test_hosted_rewrite_routes_keep_webhook_and_access_separate(self):
        spec = importlib.util.spec_from_file_location('billing_hosted_router',Path(__file__).parents[1]/'api'/'user-data.py')
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        for path,method,target in [
            ('/api/billing-access','GET','handle_api'),
            ('/api/user-data?billing_route=billing-access','POST','handle_api'),
            ('/api/stripe-webhook','POST','handle_webhook'),
            ('/api/user-data?billing_route=stripe-webhook','POST','handle_webhook')]:
            with self.subTest(path=path,method=method):
                req=object.__new__(module.handler);req.path=path
                with patch.object(billing,target) as callback,patch.object(module,'handle_request') as workspace:
                    getattr(req,'do_'+method)()
                    callback.assert_called_once();workspace.assert_not_called()


if __name__ == '__main__':
    unittest.main()
