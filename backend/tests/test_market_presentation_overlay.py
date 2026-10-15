"""Synthetic overlay fixtures never alter a runtime or depend on live crop identities."""
from copy import deepcopy
from datetime import datetime, timezone, timedelta

import pytest

from backend.app.services import market_display_service as observed
from backend.app.services import market_presentation_service as service
from pipelines.publishing.tests.test_market_presentation import payload, predict


def official(row, *, collected=None, source=None):
    return dict(region=row["region"], product=row["product"], price_level=row["price_level"],
        price=row["price"], observation_date=row["observed_at"],
        collectedAt=collected or row["collected_at"], history=deepcopy(row["history"]),
        change_percent=row["change_percent"], unit="元/kg", source=source or deepcopy(row["sources"][0]))


@pytest.mark.parametrize("change", ["collection", "source", "kind"])
def test_equal_price_preserves_fresh_collection_source_and_observation_identity(monkeypatch, change):
    base = payload()
    row = base["records"][0]
    point = official(row)
    if change == "collection": point["collectedAt"] = "2025-01-03T02:00:00Z"
    if change == "source": point["source"] = dict(id="corrected-fixture", name="Corrected source", url="https://example.test/corrected")
    if change == "kind": row["origin"]["kind"] = "observed"  # A previously current quote is now historical.
    monkeypatch.setattr(observed, "display", lambda: {"schema_version": "3", "records": [point]})
    before = deepcopy(base)
    result = service.overlay_observations(base)
    updated = result["records"][0]
    assert updated["price"] == before["records"][0]["price"]
    assert updated["collected_at"] == point["collectedAt"] and updated["sources"] == [point["source"]]
    assert updated["origin"]["kind"] == "historical"
    assert updated["origin"]["history_kind"] == "local_same_source_observations"
    assert updated["origin"]["adopted_observation"] == point
    assert result["input_hash"] != before["input_hash"] and result["records"][1:] == before["records"][1:]
    # The same evidence is stable even if an overlay is accidentally requested twice.
    checksum = result["input_hash"]
    assert service.overlay_observations(result)["input_hash"] == checksum


def test_older_collection_cannot_replace_newer_same_day_evidence_across_offsets(monkeypatch):
    base = payload()
    row = base["records"][0]
    row["collected_at"] = "2025-01-03T02:00:00Z"
    point = official(row, collected="2025-01-03T09:30:00+08:00")
    point["price"] += 1
    point["history"][-1]["price"] = point["price"]
    monkeypatch.setattr(observed, "display", lambda: {"schema_version": "3", "records": [point]})
    before = deepcopy(base)
    assert service.overlay_observations(base) == before


def test_same_price_source_update_keeps_independent_real_long_trend(monkeypatch):
    base = payload()
    row = base["records"][0]
    row["trend_history"] = [{"date": "2024-01-01", "price": 1.}, {"date": "2024-01-02", "price": 1.2}]
    row["trend_sources"] = deepcopy(row["sources"])
    row["origin"].update(trend_history_kind="local_same_source_observations",
        trend_series_identity=[row["region"], row["product"], row["price_level"], "test-history"])
    point = official(row, source=dict(id="fresh-fixture", name="Fresh source", url="https://example.test/fresh"))
    monkeypatch.setattr(observed, "display", lambda: {"schema_version": "3", "records": [point]})
    before = deepcopy(row)
    updated = service.overlay_observations(base)["records"][0]
    assert updated["trend_history"] == before["trend_history"] and updated["trend_sources"] == before["trend_sources"]
    assert updated["origin"]["trend_series_identity"] == before["origin"]["trend_series_identity"]
    assert updated["sources"] == [point["source"]]


def test_equal_price_today_observation_replaces_model_without_inventing_v2_collection_hour(monkeypatch):
    base = payload(model=predict)
    row = next(row for row in base["records"] if row["origin"]["kind"] == "model_estimate")
    today = datetime.now(timezone(timedelta(hours=8))).date().isoformat()
    point = dict(region=row["region"], product=row["product"], price_level=row["price_level"], price=row["price"],
        observation_date=today, collectedAt=today, change_percent=0., history=[dict(date=today, price=row["price"])])
    monkeypatch.setattr(observed, "display", lambda: {"schema_version": "2", "records": [point]})
    updated = service.overlay_observations(base)["records"][base["records"].index(row)]
    assert updated["origin"]["kind"] == "observed" and updated["origin"]["history_kind"] == "local_same_source_observations"
    assert updated["observed_at"] == today and updated["collected_at"] == today
    assert updated["sources"] == [] and updated["history"] == point["history"]
