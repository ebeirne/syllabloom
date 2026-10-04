import base64
import io
import json
import sqlite3
import zipfile
import pytest
from api.study_sheets import validate_sheet, cards_from_sheet, compact_image, create_sheet, _run
from api.card_formats import occlusion_html
from server import build_anki_package

PASSAGE = 'Osteoblasts build bone matrix. Osteoclasts resorb bone matrix during bone remodeling.'


def sheet():
    return validate_sheet({'title':'Bone remodeling','overview':'Bone is continuously remodeled.', 'facts':[
        {'title':'Bone formation','sentence':'Osteoblasts are the cells that build bone matrix.','answer':'Osteoblasts','locator':'Page 1','quote':'Osteoblasts build bone matrix.'},
        {'title':'Bone resorption','sentence':'Osteoclasts resorb bone matrix during bone remodeling.','answer':'Osteoclasts','locator':'Page 1','quote':'Osteoclasts resorb bone matrix'}]}, {'Page 1':PASSAGE})


def test_cards_are_cloze_deletions_of_verified_summary_sentences():
    cards = cards_from_sheet(sheet(),'bone.pdf')
    assert len(cards)==2
    assert cards[0]['clozeText']=='{{c1::Osteoblasts}} are the cells that build bone matrix.'
    assert cards[0]['sourceQuote'] in PASSAGE
    assert cards[0]['sourceLocation']=='Page 1'


def test_rejects_invented_quote_or_answer():
    with pytest.raises(ValueError):
        validate_sheet({'facts':[{'sentence':'Invented cells form a bone matrix.','answer':'Invented','locator':'Page 1','quote':'Osteoblasts build bone matrix.'}]*2},{'Page 1':PASSAGE})


def test_same_source_reuses_private_job_and_does_not_start_paid_work_twice(monkeypatch,tmp_path):
    monkeypatch.setenv('SYLLABLOOM_UPLOAD_DIR',str(tmp_path))
    monkeypatch.setattr('api.study_sheets.resume_sheet',lambda *a:None)
    first=create_sheet('user_one','bone.pdf',PASSAGE,{'pageTexts':[PASSAGE]})
    again=create_sheet('user_one','bone.pdf',PASSAGE,{'pageTexts':[PASSAGE]})
    other=create_sheet('user_two','bone.pdf',PASSAGE,{'pageTexts':[PASSAGE]})
    assert first['id']==again['id'] and first['id']!=other['id']
    assert 'passages' not in first and 'owner' not in first


def test_uncertain_paid_call_is_not_replayed(monkeypatch,tmp_path):
    monkeypatch.setenv('SYLLABLOOM_UPLOAD_DIR',str(tmp_path))
    monkeypatch.setattr('api.study_sheets.resume_sheet',lambda *a:None)
    job=create_sheet('user_one','bone.pdf',PASSAGE,{})
    from api.lecture_storage import read_job,write_job
    saved=read_job('user_one',job['id']);saved['providerPending']=True;write_job(saved)
    monkeypatch.setattr('api.lecture_cloud._exchange',lambda *a:pytest.fail('Paid call repeated'))
    _run('user_one',job['id'])
    assert read_job('user_one',job['id'])['status']=='failed'
    assert 'not automatically retried' in read_job('user_one',job['id'])['error']


def test_paid_steps_run_in_order_and_failed_image_preserves_text_without_cards(monkeypatch,tmp_path):
    monkeypatch.setenv('SYLLABLOOM_UPLOAD_DIR',str(tmp_path))
    monkeypatch.setattr('api.study_sheets.resume_sheet',lambda *a:None)
    monkeypatch.setattr('api.ai_usage.reserve_ai_usage',lambda *a:None)
    verified = sheet()
    parsed = {'title':verified['title'],'overview':verified['overview'],'facts':verified['facts']}
    calls=[]
    def exchange(url,data,content_type):
        body=json.loads(data);calls.append(body['model'])
        if 'images' in url:raise RuntimeError('Image result lost')
        return {'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':json.dumps(parsed)}]}]}
    monkeypatch.setattr('api.lecture_cloud._exchange',exchange)
    job=create_sheet('user_one','bone.pdf',PASSAGE,{'pageTexts':[PASSAGE]})
    _run('user_one',job['id'])
    from api.lecture_storage import read_job
    saved=read_job('user_one',job['id'])
    assert calls==['gpt-5.5','gpt-image-2.5-flare']
    assert saved['sheet']['facts'] and saved['status']=='failed' and 'result' not in saved
    _run('user_one',job['id'])
    assert len(calls)==2


def test_mixed_cloze_and_occlusion_package_embeds_media_and_reveals_only_target(tmp_path):
    from PIL import Image
    buf=io.BytesIO();Image.new('RGB',(40,40),'white').save(buf,format='PNG')
    image=compact_image(base64.b64encode(buf.getvalue()).decode())
    masks=[{'id':'a','x':10,'y':10,'w':20,'h':20},{'id':'b','x':50,'y':50,'w':20,'h':20}]
    o={'target':'a','masks':masks,'imageRef':'one'}
    cards=cards_from_sheet(sheet(),'bone.pdf')+[{'front':'Identify region','back':'Osteoblast','noteType':'ImageOcclusion','occlusion':o}]
    package,_=build_anki_package(cards,{'deck':'QA'},{'one':image})
    with zipfile.ZipFile(io.BytesIO(package)) as archive:
        assert len(json.loads(archive.read('media')))==1
        path=tmp_path/'collection.db';path.write_bytes(archive.read('collection.anki2'))
    with sqlite3.connect(path) as db:
        assert db.execute('select count(*) from cards').fetchone()[0]==3
        assert len(json.loads(db.execute('select models from col').fetchone()[0]))==2
    assert occlusion_html(o,'test.jpg').count('<span')==2
    assert occlusion_html(o,'test.jpg',True).count('<span')==1
    with pytest.raises(ValueError):occlusion_html({**o,'masks':[{'id':'a','x':95,'y':0,'w':20,'h':20}]},'test.jpg')
