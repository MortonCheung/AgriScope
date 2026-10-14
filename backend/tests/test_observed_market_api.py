"""API availability and restart coverage with verified V3 observations in isolated generations."""
import json
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app import config as C
from backend.app.services import market_display_service as M
from pipelines.publishing.publish_market_display import publish_generation
from agriscope_market_publication import resolve
from scripts.rollback_publication import rollback
ROOT=Path(__file__).resolve().parents[2]

DAY='2026-01-05'
COLLECTED='2026-01-05T20:30:05+08:00'


def v3_record():
    return {"region":"shenyang","product":"黄瓜","price_level":"wholesale","price":3.8,
            "observation_date":DAY,"collectedAt":COLLECTED,"change_percent":0.0,
            "history":[{"date":DAY,"price":3.8}],"unit":"元/kg",
            "source":{"id":"SRC-SY-CLZ","name":"沈阳市发展和改革委员会 · 沈阳菜篮子信息发布平台",
                      "url":"https://www.lnsyjgjc.com/api/showList"}}


def v3_evidence():
    row=v3_record()
    return {"region":row['region'],"product":row['product'],"price_level":row['price_level'],"tier":1,
            "adoption":"same_source_series",
            "adopted":dict(region=row['region'],product=row['product'],price_level=row['price_level'],
                           observation_date=DAY,collectedAt=COLLECTED,price_per_kg=row['price'],
                           source_id=row['source']['id']),
            "history":[]}


def legacy_v1_fill():
    """A legacy cross-city competition payload the 'observed' policy must never serve."""
    levels=("wholesale","supermarket","retail_market")
    return {"schema_version":"1","products":list(M.PRODUCTS),"price_levels":list(levels),
            "records":[{"region":r,"product":p,"price_level":l,"price":1.0,"observation_date":DAY,
                        "collectedAt":COLLECTED,"change_percent":0.0,
                        "history":[{"date":DAY,"price":1.0}]}
                       for r in M.REGIONS for p in M.PRODUCTS for l in levels]}


@pytest.mark.parametrize('policy',['observed',None])
def test_observed_policy_never_serves_the_legacy_cross_city_fill(tmp_path,monkeypatch,policy):
    runtime=tmp_path/'runtime';runtime.mkdir();(runtime/'manifest.json').write_text('{"assets":[]}')
    market=runtime/'data/market';market.mkdir(parents=True)
    (market/'display.json').write_text(json.dumps(legacy_v1_fill(),ensure_ascii=False))
    monkeypatch.setattr(C,'RUNTIME_DIR',runtime)
    if policy is None:monkeypatch.delenv('AGRISCOPE_MARKET_POLICY',raising=False)
    else:monkeypatch.setenv('AGRISCOPE_MARKET_POLICY',policy)
    with TestClient(app) as client:
        body=client.get('/api/market/display').json()
        # No verified worker publication yet: a legal V3 empty grid, never the legacy fill.
        assert body['schema_version']=='3' and body['records']==[] and len(body['missing'])==224
        assert body['published_at'] is None
        city=client.get('/api/market/display?region=tieling&price_level=wholesale').json()
        assert city['records']==[] and len(city['missing'])==8
        assert city['coverage']['tieling']['collection_status']=='not_configured'


def test_atomic_publish_api_rebind_restart_and_verified_rollback(tmp_path,monkeypatch):
    runtime=tmp_path/'runtime';runtime.mkdir();(runtime/'manifest.json').write_text('{"assets":[]}')
    monkeypatch.setattr(C,'RUNTIME_DIR',runtime);monkeypatch.setenv('AGRISCOPE_MARKET_POLICY','observed')
    blank=M.empty_observed();first=publish_generation(runtime,blank,{'records':[]})
    actual=v3_record();evidence=v3_evidence()
    body=M.empty_observed();body['records']=[actual]
    body['missing']=[r for r in body['missing'] if (r['region'],r['product'],r['price_level'])!=(actual['region'],actual['product'],actual['price_level'])]
    body['coverage']['shenyang'].update(available_records=1,latest_observation_date=actual['observation_date'],
                                        latest_collected_at=actual['collectedAt'])
    with TestClient(app) as client:
        assert not client.get('/api/market/display').json()['records']
        publish_generation(runtime,body,{'records':[evidence]})
        response=client.get('/api/market/display').json();assert response['records']==[actual]
        assert response['published_at'] is not None
        assert client.get('/api/market/display?region=tieling').json()['records']==[]
        # Returned data cannot mutate the immutable file/cache.
        response['records'][0]['price']=0
        assert client.get('/api/market/display').json()['records'][0]['price']==actual['price']
    M.reset_cache()
    with TestClient(app) as restarted:
        assert restarted.get('/api/market/display').json()['records']==[actual]
        rollback(runtime,'market',Path(first['generation']).name)
        assert restarted.get('/api/market/display').json()['records']==[]
        assert restarted.get('/health/live').status_code==200
    assert resolve(runtime)['generation']==first['generation']
