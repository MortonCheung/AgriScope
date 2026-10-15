from pathlib import Path
import json
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from app.main import app
from app.services import market_presentation_service as service
from pipelines.publishing.tests.test_market_presentation import payload, predict


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(service.C, "RUNTIME_DIR", tmp_path)
    path = tmp_path / service.RELATIVE_PATH; path.parent.mkdir(parents=True)
    path.write_text(json.dumps(payload(), ensure_ascii=False))
    return TestClient(app), path


def test_complete_api_uses_independent_contract_without_relabeling_observation(client):
    api, path = client
    result = api.get("/api/market/presentation")
    assert result.status_code == 200 and result.json()["schema_version"] == "presentation-1"
    assert len(result.json()["records"]) == 224
    assert result.json()["records"][0]["origin"]["kind"] == "historical"
    assert path.read_text().find("presentation-1") >= 0


@pytest.mark.parametrize("query,count", [({"region": "tieling"}, 32), ({"price_level": "market_average"}, 56), ({"region": "liaoning", "product": "黄瓜", "price_level": "wholesale"}, 1)])
def test_exact_filters(client, query, count):
    api, _path = client; result = api.get("/api/market/presentation", params=query)
    assert result.status_code == 200 and len(result.json()["records"]) == count


def test_bad_filter_and_corrupt_release_never_emit_partial_data(client):
    api, path = client
    assert api.get("/api/market/presentation?region=../../data").status_code == 422
    path.write_text('{"schema_version":"presentation-1","records":[]}')
    assert api.get("/api/market/presentation").status_code == 503


def test_new_official_quote_overlays_atomically_without_erasing_other_regions(client, monkeypatch):
    from app.services import market_display_service as observed
    api, path = client
    point = dict(region="shenyang", product="黄瓜", price_level="wholesale", price=4., observation_date="2025-01-03",
                 collectedAt="2025-01-03T09:30:00+08:00", change_percent=0., history=[{"date": "2025-01-03", "price": 4.}])
    monkeypatch.setattr(observed, "display", lambda: {"schema_version": "2", "records": [point]})
    first = api.get("/api/market/presentation").json()
    assert first["records"][0]["price"] == 4. and first["records"][0]["observed_at"] == "2025-01-03"
    assert first["records"][0]["sources"] == []  # V2 has no source evidence.
    assert len(first["records"]) == 224
    assert api.get("/api/market/presentation").json()["input_hash"] == first["input_hash"]
    assert json.loads(path.read_text())["records"][0]["price"] == 2.  # API is read-only.


def test_explicit_development_override_does_not_change_default_runtime(client, monkeypatch):
    api, path = client
    monkeypatch.setattr(service.C, "RUNTIME_DIR", path.parent / "unrelated-runtime")
    monkeypatch.setenv("AGRISCOPE_MARKET_PRESENTATION_PATH", str(path))
    assert api.get("/api/market/presentation").status_code == 200


def test_old_official_observation_cannot_replace_current_model_but_today_quote_can(client, monkeypatch):
    from datetime import datetime, timezone, timedelta
    from app.services import market_display_service as observed
    api, path = client
    path.write_text(json.dumps(payload(model=predict)))
    point = dict(region="shenyang", product="黄瓜", price_level="wholesale", price=11., observation_date="2025-01-03",
                 collectedAt="2025-01-03T09:30:00+08:00", change_percent=0., history=[{"date": "2025-01-03", "price": 11.}])
    monkeypatch.setattr(observed, "display", lambda: {"schema_version": "2", "records": [point]})
    row = api.get("/api/market/presentation").json()["records"][0]
    assert row["origin"]["kind"] == "model_estimate" and row["price"] == 3.
    today = datetime.now(timezone(timedelta(hours=8))).date().isoformat()
    point.update(observation_date=today, collectedAt=today, history=[{"date": today, "price": 11.}])
    row = api.get("/api/market/presentation").json()["records"][0]
    assert row["origin"]["kind"] == "observed" and row["price"] == 11. and row["observed_at"] == today
