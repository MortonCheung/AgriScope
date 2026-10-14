"""Liveness remains available; a missing frozen model cannot pass deployment readiness."""
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import app
from app.routes import health
from app import publication
from app.errors import ApiError, ErrorCode


@pytest.fixture
def assets(tmp_path, monkeypatch):
    snapshot = tmp_path / 'snapshot'
    (snapshot / 'datasets').mkdir(parents=True)
    (snapshot / 'datasets/decision_dataset_沈阳.parquet').write_bytes(b'isolated dataset')
    models = tmp_path / 'models'; models.mkdir()
    reports = tmp_path / 'reports'; (reports / 'tables').mkdir(parents=True)
    (reports / 'FINAL_RUN_META.json').write_text('{}')
    (reports / 'tables/price_model_selection.csv').write_text('isolated metadata')
    monkeypatch.setattr(health.RS, 'state', lambda: {'snapshot_dir': str(snapshot), 'runtime_data_status': 'fixture'})
    monkeypatch.setattr(health.C, 'FINAL_MODELS_DIR', models)
    monkeypatch.setattr(health.C, 'FINAL_REPORTS_DIR', reports)
    monkeypatch.setattr(health.C, 'FINAL_RUN_META', reports / 'FINAL_RUN_META.json')
    monkeypatch.setattr(health.DAILY, 'latest', lambda city: {'date': '2026-10-14', 'latest_data_date': '2026-10-13'})
    monkeypatch.setattr(publication, 'current', lambda: {})
    return models


def test_missing_model_is_not_ready_even_when_other_required_inputs_exist(assets):
    response = TestClient(app).get('/health/ready')
    assert response.status_code == 503
    assert response.json()['status'] == 'not_ready'
    assert response.json()['detail']['model_artifacts'] == {'ok': False, 'n': 0}


def test_model_presence_restores_readiness_with_valid_other_inputs(assets):
    (assets / 'fixture.pkl').write_bytes(b'presence fixture; never loaded')
    response = TestClient(app).get('/health/ready')
    assert response.status_code == 200
    assert response.json()['status'] == 'ready'


def test_publication_failure_affects_readiness_but_not_real_liveness(monkeypatch):
    def unavailable():
        raise ApiError(503, ErrorCode.DAILY_UNAVAILABLE, 'isolated publication failure')
    monkeypatch.setattr(publication, 'current', unavailable)
    client = TestClient(app)
    assert client.get('/health/ready').status_code == 503
    live = client.get('/health/live')
    assert live.status_code == 200
    assert live.json()['status'] == 'ok'
    assert live.headers['X-Request-ID'] == live.json()['request_id']
