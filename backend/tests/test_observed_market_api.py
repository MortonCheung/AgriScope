"""API availability and restart coverage with real saved market observations in isolated generations."""
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


@pytest.mark.parametrize('policy',['observed',None])
def test_observed_policy_never_serves_the_legacy_cross_city_fill(tmp_path,monkeypatch,policy):
    runtime=tmp_path/'runtime';runtime.mkdir();(runtime/'manifest.json').write_text('{"assets":[]}')
    market=runtime/'data/market';market.mkdir(parents=True)
    (market/'display.json').write_bytes((ROOT/'runtime/data/market/display.json').read_bytes())
    monkeypatch.setattr(C,'RUNTIME_DIR',runtime)
    if policy is None:monkeypatch.delenv('AGRISCOPE_MARKET_POLICY',raising=False)
    else:monkeypatch.setenv('AGRISCOPE_MARKET_POLICY',policy)
    with TestClient(app) as client:
        body=client.get('/api/market/display').json()
        assert body['schema_version']=='2' and body['records']==[] and len(body['missing'])==168
        city=client.get('/api/market/display?region=tieling&price_level=wholesale').json()
        assert city['records']==[] and len(city['missing'])==8
        assert city['coverage']['tieling']['collection_status']=='not_configured'


def test_atomic_publish_api_rebind_restart_and_verified_rollback(tmp_path,monkeypatch):
    runtime=tmp_path/'runtime';runtime.mkdir();(runtime/'manifest.json').write_text('{"assets":[]}')
    monkeypatch.setattr(C,'RUNTIME_DIR',runtime);monkeypatch.setenv('AGRISCOPE_MARKET_POLICY','observed')
    blank=M.empty_observed();first=publish_generation(runtime,blank,{'records':[]})
    actual=json.loads((ROOT/'runtime/data/market/display.json').read_text())['records'][0]
    evidence=json.loads((ROOT/'runtime/data/market/lineage.json').read_text())['records'][0]
    assert actual['region']=='shenyang' and evidence['tier']==1
    body=M.empty_observed();body['records']=[actual]
    body['missing']=[r for r in body['missing'] if (r['region'],r['product'],r['price_level'])!=(actual['region'],actual['product'],actual['price_level'])]
    body['coverage']['shenyang'].update(available_records=1,latest_observation_date=actual['observation_date'])
    with TestClient(app) as client:
        assert not client.get('/api/market/display').json()['records']
        publish_generation(runtime,body,{'records':[evidence]})
        response=client.get('/api/market/display').json();assert response['records']==[actual]
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
