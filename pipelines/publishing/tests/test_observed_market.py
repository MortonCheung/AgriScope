"""Deployment tests use existing real published observations and isolated runtime directories."""
import copy
import json
from pathlib import Path
import pytest
from backend.app.services.market_display_service import empty_observed, validate_display
from pipelines.publishing.publish_market_display import publish_generation, build, Reader
from agriscope_market_publication import resolve
from scripts.rollback_publication import rollback
ROOT=Path(__file__).resolve().parents[3]


def actual_record():
    payload=json.loads((ROOT/'runtime/data/market/display.json').read_text())
    lineage=json.loads((ROOT/'runtime/data/market/lineage.json').read_text())
    local=next(row for row in lineage['records'] if row['region']=='shenyang' and row['product']=='黄瓜' and row['price_level']=='wholesale')
    assert local['tier']==1 and local['adopted']['region']=='shenyang' and local['adopted']['price_level']=='wholesale'
    row=next(row for row in payload['records'] if (row['region'],row['product'],row['price_level'])==('shenyang','黄瓜','wholesale'))
    return row,local


def observed(sample=True):
    body=empty_observed()
    if sample:
        row,_=actual_record();body['records']=[row]
        body['missing']=[r for r in body['missing'] if (r['region'],r['product'],r['price_level'])!=('shenyang','黄瓜','wholesale')]
        body['coverage']['shenyang'].update(available_records=1,latest_observation_date=row['observation_date'])
    return validate_display(body)


@pytest.fixture
def runtime(tmp_path):
    root=tmp_path/'runtime';root.mkdir()
    (root/'manifest.json').write_text(json.dumps({'assets':[{'destination':'runtime/frozen','status':'OK'}],'generated_at':'frozen'}))
    (root/'frozen').write_bytes(b'immutable-sentinel')
    return root


def audit(body):
    return {'records':[actual_record()[1]] if body['records'] else [],'generated_at':'excluded-clock','policy':'local_same_price_level'}


def test_strict_grid_does_not_borrow_city_price_level_or_province(tmp_path, monkeypatch):
    # Build with a saved, real Shenyang row as the only available source, not a made-up price.
    row,_=actual_record()
    from pipelines.publishing.publish_market_display import Observation
    point=Observation(row['region'],row['product'],row['price_level'],row['observation_date'],row['price'],row['collectedAt'],row['price'],'元/kg','黄瓜','SRC-SY-CLZ','沈阳菜篮子','https://www.lnsyjgjc.com/api/showList','沈阳批发','A','daily','saved-real-record','raw_metadata_crawl_time',())
    monkeypatch.setattr(Reader,'rows',lambda self,family:[point] if family=='daily' else [])
    for relative in ['data/processed/market/price_observation.parquet','data/processed/market/province_price_reference.parquet','data/processed/daily/daily_market_price.parquet']:
        p=tmp_path/relative;p.parent.mkdir(parents=True,exist_ok=True);p.touch()
    body,evidence=build(tmp_path,strict=True)
    assert len(body['records'])==1 and body['records'][0]['region']=='shenyang'
    assert len(body['missing'])==167 and all(r['price_level']=='wholesale' for r in body['records'])
    assert evidence['tier_counts']=={'1':1}
    assert body['coverage']['tieling']['collection_status']=='not_configured'


def test_idempotent_publication_failure_rollback_and_republish(runtime, monkeypatch):
    empty=observed(False);good=observed()
    one=publish_generation(runtime,empty,audit(empty));original=(runtime/'manifest.json').read_bytes()
    assert publish_generation(runtime,empty,{**audit(empty),'generated_at':'different-clock'})['status']=='UNCHANGED'
    two=publish_generation(runtime,good,audit(good));assert one['generation']!=two['generation']
    current=(runtime/'manifest.json').read_bytes()
    broken=copy.deepcopy(good);broken['records'][0]['price']=0
    with pytest.raises(ValueError):publish_generation(runtime,broken,audit(good))
    assert (runtime/'manifest.json').read_bytes()==current
    assert rollback(runtime,'market',Path(one['generation']).name)['status']=='ROLLED_BACK'
    assert resolve(runtime)['generation']==one['generation']
    assert publish_generation(runtime,good,audit(good))['status']=='PUBLISHED'
    assert resolve(runtime)['generation']==two['generation']
    receipt=runtime/'publication_history/market_publication'/ (Path(two['generation']).name+'.json')
    assert json.loads(receipt.read_text())==json.loads((runtime/'manifest.json').read_text())['market_publication']
    assert (runtime/'frozen').read_bytes()==b'immutable-sentinel'
    assert not list((runtime/'data/market/publications').glob('.stage-*'))


def test_corrupt_generation_refuses_rollback_and_does_not_change_pointer(runtime):
    empty=observed(False);one=publish_generation(runtime,empty,audit(empty))
    good=observed();publish_generation(runtime,good,audit(good));before=(runtime/'manifest.json').read_bytes()
    path=runtime/one['generation']/'display.json';path.chmod(0o600);path.write_bytes(b'corrupt')
    with pytest.raises(ValueError):rollback(runtime,'market',Path(one['generation']).name)
    assert (runtime/'manifest.json').read_bytes()==before


def test_manifest_lock_prevents_interleaved_publish_and_preserves_base(runtime):
    from agriscope_publication import publication_lock
    body=observed();before=(runtime/'manifest.json').read_bytes()
    with publication_lock(runtime):
        with pytest.raises(BlockingIOError):publish_generation(runtime,body,audit(body))
    assert (runtime/'manifest.json').read_bytes()==before


def test_mid_commit_disk_failure_preserves_last_generation(runtime, monkeypatch):
    import agriscope_publication as publication
    empty=observed(False);publish_generation(runtime,empty,audit(empty));before=(runtime/'manifest.json').read_bytes()
    original=publication.atomic_bytes
    def broken(path,data,*args,**kwargs):
        if path.name=='manifest.json':raise OSError('isolated disk failure')
        return original(path,data,*args,**kwargs)
    monkeypatch.setattr(publication,'atomic_bytes',broken)
    body=observed()
    with pytest.raises(OSError):publish_generation(runtime,body,audit(body))
    assert (runtime/'manifest.json').read_bytes()==before
    assert resolve(runtime) is not None


def test_loss_of_previous_valid_observation_keeps_current_generation(runtime):
    good=observed();publish_generation(runtime,good,audit(good));before=(runtime/'manifest.json').read_bytes()
    empty=observed(False)
    with pytest.raises(ValueError):publish_generation(runtime,empty,audit(empty))
    assert (runtime/'manifest.json').read_bytes()==before


def test_wrong_scope_lineage_cannot_be_published(runtime):
    body=observed();proof=copy.deepcopy(audit(body));proof['records'][0]['adopted']['region']='tieling'
    before=(runtime/'manifest.json').read_bytes()
    with pytest.raises(ValueError):publish_generation(runtime,body,proof)
    assert (runtime/'manifest.json').read_bytes()==before
