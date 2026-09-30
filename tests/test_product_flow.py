import hashlib
import uuid
from unittest.mock import MagicMock, patch
import pytest
from api.source import _prepare_sections
from api.source_coverage import study_sections
from api.ai_card_generation import _source_chunks, SourceTextLimitError
from api import product_events as events


def test_blank_pdf_pages_remain_visible_and_selected_pages_keep_original_numbers():
    sections = study_sections('First\nThird', {'pageTexts':['First','','Third']})
    assert [row['label'] for row in sections] == ['Page 1','Page 2','Page 3']
    assert sections[1]['text'] == '' and sections[1]['lowText']
    prepared = _prepare_sections({'filename':'lecture.pdf','sections':[{'label':'Page 3','text':'Third'}]})
    assert _source_chunks(prepared['extractedText'], 'lecture.pdf', prepared['extractedUnits'])[0]['locators'] == ['Page 3']
    assert prepared['fingerprint'] == hashlib.sha256(b'Third').hexdigest()


def test_unreadable_slides_and_image_warnings_are_not_omitted():
    rows=study_sections('Slide 1\nBone forms.\nSlide 3\nBone resorbs.',{'unitCount':3,'slidesWithUnlabeledImages':[2]})
    assert [row['label'] for row in rows]==['Slide 1','Slide 2','Slide 3']
    assert rows[1]['imageWarning'] and not rows[1]['text']


def test_plain_text_coverage_matches_generation_boundaries():
    text='Bone development. ' * 1000
    sections=study_sections(text,{})
    chunks=_source_chunks(text,'lecture.txt',{})
    assert set(row['label'] for row in sections)==set(label for chunk in chunks for label in chunk['locators'])


@pytest.mark.parametrize('sections',[[],[{'label':'Page 0','text':'bone'}],[{'label':'Page 1','text':''}],[{'label':'Page 1','text':3}]])
def test_invalid_selected_sections_rejected(sections):
    with pytest.raises(ValueError): _prepare_sections({'sections':sections})


def test_selected_sections_obey_budget_and_text_identity():
    with pytest.raises(SourceTextLimitError): _prepare_sections({'sections':[{'label':'Page 1','text':'a'*192001}]})
    with pytest.raises(ValueError): _source_chunks('changed','lecture.pdf',{'selectedSections':[{'label':'Page 3','text':'original'}]})


def test_client_cannot_submit_payment_or_private_content():
    value={'id':str(uuid.uuid4()),'sessionId':str(uuid.uuid4()),'name':'study_completed','properties':{'cards':5,'filename':'private.pdf','answer':'secret','email':'private@example.com','referral':'med01'}}
    assert events.clean_event(value)[3]=={'cards':5,'referral':'med01'}
    value['name']='payment_succeeded'
    with pytest.raises(ValueError): events.clean_event(value)


def test_cohorts_separate_founders_research_and_organic(monkeypatch):
    monkeypatch.setenv('SYLLABLOOM_FOUNDER_IDS','["test"]');monkeypatch.setenv('SYLLABLOOM_RESEARCH_IDS','["research"]')
    assert [events.cohort(user) for user in ['test','research','real']]==['founder','research','organic']


def test_report_requires_founder_auth_before_database():
    request=MagicMock()
    with patch.object(events,'authenticated_user',return_value='ordinary'),patch.object(events,'configured_ids',return_value=set()),patch.object(events.psycopg,'connect') as connect:
        events.handle(request,'GET');connect.assert_not_called()
    assert request.send_json.call_args.args[1]==403


def test_payment_metrics_do_not_break_billing_when_storage_fails():
    db=MagicMock();db.transaction.side_effect=RuntimeError('offline')
    events.record_payment_event(db,'user',{'id':'evt1','type':'invoice.paid','data':{'object':{'amount_paid':1200,'currency':'usd'}}},True)


def test_payment_metrics_use_stable_event_id_and_ignore_zero_invoices():
    db=MagicMock()
    event={'id':'evt1','type':'invoice.paid','data':{'object':{'amount_paid':1200,'currency':'usd'}}}
    with patch.object(events,'insert_event') as insert:
        events.record_payment_event(db,'user',event,True)
        first=insert.call_args.args
        events.record_payment_event(db,'user',event,True)
        assert first==insert.call_args.args
        assert first[-1]=={'amountMinor':1200,'currency':'usd'}
        event['data']['object']['amount_paid']=0
        events.record_payment_event(db,'user',event,True)
        assert insert.call_count==2

def test_payment_config_check_requires_founder_before_stripe():
    import io
    from api import billing
    request=MagicMock();request.headers={'Content-Length':'26'};request.rfile=io.BytesIO(b'{"action":"verify-config"}')
    request.headers['Content-Length']=str(len(request.rfile.getvalue()))
    with patch.object(billing,'enabled',return_value=True),patch.object(billing,'authenticated_user',return_value='ordinary'),patch.object(billing,'founders',return_value={'founder'}),patch.object(billing,'configuration_health') as check:
        billing.handle_api(request,'POST');check.assert_not_called()
    assert request.send_json.call_args.args[1]==403


def test_payment_config_check_reads_prices_without_starting_checkout(monkeypatch):
    from api import billing
    monkeypatch.setenv('STRIPE_MODE','live');monkeypatch.setenv('STRIPE_WEBHOOK_SECRET','configured');monkeypatch.setenv('STRIPE_PORTAL_CONFIGURATION','bpc_configured');monkeypatch.setenv('SYLLABLOOM_APP_URL','https://syllabloom-beta.vercel.app')
    client=MagicMock();client.v1.prices.retrieve.side_effect=[{'active':True,'currency':'usd','unit_amount':1200,'recurring':{'interval':'month','interval_count':1},'livemode':True},{'active':True,'currency':'usd','unit_amount':10800,'recurring':{'interval':'year','interval_count':1},'livemode':True}]
    with patch.object(billing,'stripe_client',return_value=client),patch.object(billing,'prices',return_value={'monthly':'price_a','yearly':'price_b'}):
        result=billing.configuration_health()
    assert result['pricesVerified']=={'monthly':True,'yearly':True}
    client.v1.checkout.sessions.create.assert_not_called()
