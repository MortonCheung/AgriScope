"""双目标、用户上市定位、实际利润和失败隔离的 HTTP 契约验收。"""
from __future__ import annotations
import copy
import json
import sys
from datetime import date, timedelta
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import app
from app import config as C


def snapshot():
    entries = []
    for crop, point, current in [('土豆', 2.0, 2.0), ('西红柿', 4.0, 2.0)]:
        for h in (30, 60, 90, 120, 150, 180):
            for target in ('cycle_market_average', 'harvest_market_price'):
                price = point if target == 'harvest_market_price' else point * 5
                entries.append({'crop': crop, 'horizon': h, 'target_type': target,
                    'point_forecast': price, 'range_low': price * .8, 'range_high': price * 1.2,
                    'unit': 'CNY/kg', 'range_type': 'scenario_range', 'available': True,
                    'production_status': 'EXPLORATORY_SCENARIO_ONLY' if h >= 150 else 'SCENARIO_ONLY',
                    'confidence': 'low', 'method': 'b_last_value', 'actual_method': 'b_last_value',
                    'fallback_used': False, 'forecast_source': 'scenario_only', 'current_price': current,
                    'anchor_observation_date': '2026-10-06', 'effective_n': 8, 'final_effective_n': 0,
                    'model_disagreement_pct': 10, 'target_window': {'definition': target,
                    'start_offset': h - 6 if target == 'harvest_market_price' else 1,
                    'end_offset_exclusive': h + 8 if target == 'harvest_market_price' else h + 1}})
    return {'schema_version': 'lh_forecast_v2', 'as_of': '2026-10-06', 'latest_data_date': '2026-10-06',
            'horizons': [30,60,90,120,150,180], 'entries': entries, 'model_version': 'long_horizon_v2',
            'data_version': 'runtime-test', 'runtime_data_version': 'runtime-test', 'training_data_version': 'final_v1',
            'method_registry_version': 'registry-test', 'llm_model': None, 'prompt_version': None,
            'notes': [], 'snapshot_hash': 'test'}


def request(h=120, actual=None):
    return {'contract_version': '2', 'input_source': {'kind': 'structured'}, 'user_context': {
        'city_id': 'shenyang', 'area_mu': 10, 'budget_cny': 30000, 'risk_preference': 'balanced',
        'crop_preferences': ['土豆', '西红柿'], 'actual_inputs': actual or {},
        'market_context': {'expected_harvest_horizon_days': h}}}


@pytest.fixture
def assets(tmp_path, monkeypatch):
    lh, daily = tmp_path / 'lh.json', tmp_path / 'daily.json'
    lh.write_text(json.dumps(snapshot(), ensure_ascii=False))
    daily.write_text(json.dumps({'latest_data_date': '2026-10-06', 'data_freshness': 'DELAYED',
        'crops': [{'crop': c, 'data_date': '2026-10-06', 'latest_price': 2, 'hri': 20, 'market_risk': 30}
                  for c in ('土豆', '西红柿')]}))
    monkeypatch.setattr(C, 'LH_LATEST', lh); monkeypatch.setattr(C, 'DAILY_LATEST', daily)
    return lh, daily


@pytest.fixture
def client(assets):
    with TestClient(app) as c:
        yield c


def test_dual_target_default_is_harvest_and_cycle_is_distinct(client):
    body = {'contract_version': '1', 'crop': '土豆', 'horizon_days': 120}
    out = client.post('/api/forecast/long-horizon', json=body).json()
    assert out['target_type'] == 'harvest_market_price' and out['point_forecast'] == 2
    assert out['targets']['cycle_market_average']['point_forecast'] == 10
    assert out['llm_status'] == 'LLM_UNAVAILABLE' and out['fallback_used'] is False
    cycle = client.post('/api/forecast/long-horizon', json={**body, 'target_type': 'cycle_market_average'}).json()
    assert cycle['point_forecast'] == 10
    assert out['freshness']['daily_delayed'] is True


def test_capability_groups_targets_and_does_not_claim_retrospective_n_is_final(client):
    out = client.get('/api/forecast/capabilities').json()
    assert len(out['crops']) == 2
    assert len(out['crops'][0]['horizons']) == 6
    row = out['crops'][0]['horizons'][0]
    assert row['n_final_effective'] == 0 and row['n_nonoverlap'] == 0
    assert set(row['targets']) == {'cycle_market_average', 'harvest_market_price'}


def test_profit_uses_harvest_not_smoothed_cycle_and_user_inputs(client):
    body = request(actual={c: {'cost_per_mu': 1000, 'yield_kg_per_mu': 1000} for c in ['土豆', '西红柿']})
    out = client.post('/api/decision/long-horizon', json=body).json()
    assert out['request'] == body and out['basis'] == 'harvest_market_price'
    assert out['candidates'][0]['profit']['base'] == 10000
    assert out['candidates'][1]['profit']['base'] == 30000
    assert out['ranking_basis'] == 'profit_scenario'
    assert out['recommendation']['crop'] == '西红柿' and out['recommendation']['strength'] == 'weak'
    assert out['candidates'][0]['current_market_context']['semantics'] == 'current_market_environment_not_future_risk'


def test_missing_inputs_produces_no_fake_profit(client):
    out = client.post('/api/decision/long-horizon', json=request()).json()
    assert out['ranking_basis'] == 'harvest_relative_market_environment'
    assert all(c['profit']['available'] is False and c['profit']['base'] is None for c in out['candidates'])
    assert out['recommendation']['crop'] == '西红柿'


def test_budget_excludes_infeasible_candidate(client):
    body = request(actual={'土豆': {'cost_per_mu': 1000, 'yield_kg_per_mu': 1000},
                           '西红柿': {'cost_per_mu': 10000, 'yield_kg_per_mu': 10000}})
    out = client.post('/api/decision/long-horizon', json=body).json()
    assert out['candidates'][1]['budget_feasible'] is False
    assert [r['crop'] for r in out['ranking']] == ['土豆']


def test_conservative_profit_ranking_uses_downside(client):
    body = request(actual={c: {'cost_per_mu': 1000, 'yield_kg_per_mu': 1000} for c in ['土豆', '西红柿']})
    body['user_context']['risk_preference'] = 'conservative'
    out = client.post('/api/decision/long-horizon', json=body).json()
    assert out['ranking'][0]['score'] == 22000


@pytest.mark.parametrize('h', [30, 60, 90, 120, 150, 180])
def test_explicit_horizons_and_date_only_are_supported(client, h):
    body = request(h)
    out = client.post('/api/decision/long-horizon', json=body).json()
    assert out['horizon_days'] == h and out['status'] == 'SCENARIO_ONLY'
    body['user_context']['market_context'] = {'expected_harvest_date': str(date(2026,10,6) + timedelta(days=h))}
    mapped = client.post('/api/decision/long-horizon', json=body)
    assert mapped.status_code == 200 and mapped.json()['horizon_days'] == h


@pytest.mark.parametrize('market', [{}, {'expected_harvest_horizon_days': True},
    {'expected_harvest_horizon_days': 90.5}, {'expected_harvest_date': '2027-01-05'},
    {'expected_harvest_horizon_days': 120, 'expected_harvest_date': '2026-12-05'},
    {'as_of': '2026-09-14', 'expected_harvest_horizon_days': 120}])
def test_invalid_or_unmatched_harvest_time_never_gets_silently_changed(client, market):
    body = request(); body['user_context']['market_context'] = market
    out = client.post('/api/decision/long-horizon', json=body)
    assert out.status_code == 400 and out.json()['error_code'] == 'VALIDATION_ERROR'


def test_stale_and_per_crop_anchor_exposed(client, assets):
    lh, daily = assets
    d = json.loads(daily.read_text()); d['latest_data_date'] = '2026-10-07'; daily.write_text(json.dumps(d))
    out = client.post('/api/forecast/long-horizon', json={'crop':'土豆','horizon_days':120}).json()
    assert out['freshness']['status'] == 'LONG_HORIZON_STALE'
    d['latest_data_date'] = '2026-10-06'; daily.write_text(json.dumps(d))
    s = json.loads(lh.read_text()); s['entries'][0]['anchor_observation_date'] = '2026-10-05'; lh.write_text(json.dumps(s))
    out = client.post('/api/forecast/long-horizon', json={'crop':'土豆','horizon_days':120}).json()
    assert out['freshness']['status'] == 'LONG_HORIZON_STALE'


def test_missing_long_layer_does_not_break_daily_or_short_capability(client, assets):
    assets[0].unlink()
    assert client.post('/api/forecast/long-horizon', json={'crop':'土豆','horizon_days':120}).status_code == 503
    assert client.get('/api/daily/latest').status_code == 200
    assert client.get('/api/decision/capabilities', params={'city':'shenyang'}).status_code == 200


def test_malformed_snapshot_fails_closed(client, assets):
    s = snapshot(); s['entries'][0]['range_low'] = float('nan'); assets[0].write_text(json.dumps(s))
    out = client.post('/api/forecast/long-horizon', json={'crop':'土豆','horizon_days':120})
    assert out.status_code == 503


def test_unknown_city_is_not_borrowed(client):
    body = request(); body['user_context']['city_id'] = 'dalian'
    out = client.post('/api/decision/long-horizon', json=body)
    assert out.status_code == 422 and out.json()['error_code'] == 'UNSUPPORTED_CITY'


def test_climate_missing_and_risk_preference_usage_are_explicit(client):
    out = client.post('/api/decision/long-horizon', json=request()).json()
    climate = out['candidates'][0]['current_market_context']['climate_exposure']
    assert climate['available'] is False and climate['value'] is None
    assert climate['reason'] == 'NO_CUTOFF_SAFE_CLIMATE_SOURCE'
    assert out['risk_preference_usage']['ranking_rule'] == 'caution_context_only'
    assert out['risk_preference_usage']['future_risk_weighting'] is False


def test_finite_inputs_must_not_overflow_profit_output(client):
    body = request(actual={'土豆': {'cost_per_mu': 1000, 'yield_kg_per_mu': 1e308}})
    out = client.post('/api/decision/long-horizon', json=body)
    assert out.status_code == 400 and out.json()['error_code'] == 'VALIDATION_ERROR'
