import os
import json
import uuid
import hashlib
import psycopg
from psycopg import sql
import pytest
from api import product_events as events

@pytest.fixture
def database():
    url=os.environ.get('TEST_DATABASE_URL')
    if not url: pytest.skip('TEST_DATABASE_URL required')
    schema='product_flow_test_'+uuid.uuid4().hex
    with psycopg.connect(url) as db:
        db.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
        db.execute(sql.SQL('SET LOCAL search_path TO {}').format(sql.Identifier(schema)))
        db.execute(events.SCHEMA)
        try: yield db
        finally:
            # This unique test schema is the only deletion target.
            db.rollback()
    # CREATE SCHEMA was rolled back with the test transaction.

def test_report_counts_real_dates_cohorts_payments_and_retries_without_identifiers(database,monkeypatch):
    monkeypatch.setenv('SYLLABLOOM_FOUNDER_IDS','["founder"]')
    monkeypatch.setenv('SYLLABLOOM_RESEARCH_IDS','["research"]')
    sid=str(uuid.uuid4());eid=str(uuid.uuid4())
    for _ in range(2): events.insert_event(database,'organic',eid,sid,'study_completed',{'cards':5,'referral':'med01'})
    events.insert_event(database,'organic',str(uuid.uuid4()),sid,'study_completed',{'cards':5})
    database.execute("UPDATE syllabloom_product_events SET created_at=now()-interval '2 days' WHERE event_id=%s",(eid,))
    events.insert_event(database,'founder',str(uuid.uuid4()),sid,'study_completed',{'cards':5})
    events.insert_event(database,'research',str(uuid.uuid4()),sid,'study_completed',{'cards':5})
    event={'id':'evt_test','type':'invoice.paid','data':{'object':{'amount_paid':1200,'currency':'usd'}}}
    events.record_payment_event(database,'organic',event,True)
    events.record_payment_event(database,'organic',event,True)
    report=events.report(database)
    json.dumps(report)  # PostgreSQL SUM(bigint) returns Decimal; API output must be JSON-safe.
    assert report['returning']=={'organic':1}
    assert report['referrals']==[{'code':'med01','studyingUsers':1}]
    assert report['grossRevenue']==[{'cohort':'organic','currency':'usd','amountMinor':1200}]
    organic=next(row for row in report['events'] if row['cohort']=='organic' and row['event']=='study_completed')
    assert organic['count']==2 and organic['users']==1
    assert hashlib.sha256(b'organic').hexdigest() not in str(report)
