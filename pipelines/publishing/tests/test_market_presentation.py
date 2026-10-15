"""Synthetic test inputs stay outside all production publication paths."""
from copy import deepcopy
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
import json
import math
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from pipelines.publishing.publish_market_display import Observation, Series
from pipelines.publishing.publish_market_presentation import build_from_series, publish, compact_history, FrozenForecaster, public_snapshot
from backend.app.services.market_presentation_service import validate, REGIONS, PRODUCTS, LEVELS, RELATIVE_PATH


def observation(region, product, level, price, day="2025-01-02"):
    return Observation(region, product, level, day, price, "2025-01-03T09:30:00+08:00",
                       price, "元/kg", product, "fixture-source", "Test-only input", "https://example.test/prices",
                       "fixture-market", "A", "market", "test-fixture.parquet", "test_only")


def inputs():
    factors = dict(wholesale=1., supermarket=2., retail_market=1.6, market_average=1.4)
    return [Series([observation(region, product, level, (i + 2.) * factors[level] * (1 + j * .1))])
            for j, region in enumerate(REGIONS) for i, product in enumerate(PRODUCTS) for level in LEVELS]


def predict(region, product):
    return {"source_city": region, "model_as_of": "2025-01-02", "horizon_days": 7, "price_per_kg": 3.,
            "price_level": "wholesale", "method": "test_only_inference", "model_id": "fixture-model",
            "target_type": "next_window_market_average"}


def payload(series=None, model=lambda _c, _p: None):
    return build_from_series(inputs() if series is None else series, {"test-fixture.parquet": "0" * 64}, model, "2025-01-03")


def test_history_is_preserved_and_all_224_cells_are_available():
    data = payload()
    assert len(data["records"]) == 224
    assert all(r["origin"]["kind"] == "historical" for r in data["records"])
    assert all(r["display_date"] == "2025-01-02" and r["collected_at"] == "2025-01-03T09:30:00+08:00" for r in data["records"])
    assert data["provenance"]["separate_from_official_observation_release"] is True


def test_latest_valid_observation_wins_without_cross_source_history_splice():
    series = inputs()
    target = series[0].latest
    newer = observation(target.region, target.product, target.level, 8., "2025-01-03")
    newer = replace(newer, source_id="another-fixture-source")
    series.append(Series([newer]))
    row = payload(series)["records"][0]
    assert row["price"] == 8. and row["history"] == [{"date": "2025-01-03", "price": 8.}]
    assert row["origin"]["kind"] == "observed"


def test_missing_local_product_uses_real_model_and_common_local_price_evidence():
    series = [s for s in inputs() if not (s.latest.region == "tieling" and s.latest.product == "甘蓝")]
    calls = []
    def model(region, product):
        calls.append((region, product)); return predict(region, product)
    row = next(r for r in payload(series, model)["records"] if (r["region"], r["product"], r["price_level"]) == ("tieling", "甘蓝", "supermarket"))
    assert row["price"] == pytest.approx(3 * 2 * 1.1)
    assert row["origin"]["model"]["target_type"] == "next_window_market_average"
    assert len(row["origin"]["calibration"]["samples"]) == 7
    assert row["observed_at"] is None and row["collected_at"] is None
    assert row["history"] == [{"date": "2025-01-03", "price": row["price"]}]
    assert calls.count(("shenyang", "甘蓝")) == 1


def test_missing_channel_without_model_uses_paired_price_surface_not_fixed_markup():
    series = [s for s in inputs() if not (s.latest.region == "shenyang" and s.latest.product == "大白菜" and s.latest.level == "wholesale")]
    row = next(r for r in payload(series, lambda _c, _p: None)["records"] if (r["region"], r["product"], r["price_level"]) == ("shenyang", "大白菜", "wholesale"))
    assert row["price"] == pytest.approx(9.)
    assert row["origin"]["kind"] == "calibrated_history" and row["origin"]["model"] is None


def test_no_local_calibration_or_model_is_an_explicit_error():
    series = [s for s in inputs() if s.latest.region != "tieling"]
    with pytest.raises(ValueError, match="No actual common-product"):
        payload(series, predict)
    with pytest.raises(ValueError, match="No registered model"):
        payload([s for s in inputs() if not (s.latest.region == "tieling" and s.latest.product == "甘蓝")], lambda _c, _p: None)
    with pytest.raises(ValueError, match="Empty inputs"):
        payload([])


def test_missing_link_and_date_only_collection_are_preserved_without_fabrication():
    series = inputs(); series[0] = Series([replace(series[0].latest, source_url="", collected="2025-01-03")])
    row = payload(series)["records"][0]
    assert row["sources"] == [] and row["collected_at"] == "2025-01-03"


def test_source_series_and_source_links_select_actual_latest_instant_across_offsets():
    from pipelines.publishing.publish_market_presentation import select_cells, sources
    early = replace(inputs()[0].latest, collected="2025-01-03T09:00:00+08:00", source_url="https://example.test/early")
    late = replace(early, collected="2025-01-03T02:00:00Z", source_url="https://example.test/late")
    assert select_cells([Series([early]), Series([late])])[(early.region, early.product, early.level)].latest == late
    assert sources([early, late])[0]["url"] == "https://example.test/late"
    # Different calendar dates in the source's offset still represent the same instant.
    previous_date = replace(late, collected="2025-01-02T23:30:00-03:00", source_url="https://example.test/latest")
    assert select_cells([Series([late]), Series([previous_date])])[(early.region, early.product, early.level)].latest == previous_date


@pytest.mark.parametrize("value", [0, -1, float("nan"), float("inf"), True])
def test_bad_prices_are_rejected(value):
    data = payload(); data["records"][0]["price"] = value
    with pytest.raises(ValueError): validate(data)


@pytest.mark.parametrize("defect", ["duplicate", "missing", "fake_date", "wrong_change", "fake_url", "fake_history"])
def test_bad_release_cannot_replace_valid_data(tmp_path, defect):
    data = payload(); publish(data, tmp_path); path = tmp_path / RELATIVE_PATH; before = path.read_bytes()
    bad = deepcopy(data)
    if defect == "duplicate": bad["records"][-1] = bad["records"][0]
    if defect == "missing": bad["records"].pop()
    if defect == "fake_date": bad["records"][0]["observed_at"] = "2025-02-30"
    if defect == "wrong_change": bad["records"][0]["change_percent"] = 2
    if defect == "fake_url": bad["records"][0]["sources"][0]["url"] = "javascript:alert(1)"
    if defect == "fake_history": bad["records"][0]["history"][0]["price"] = 99
    with pytest.raises(ValueError): publish(bad, tmp_path)
    assert path.read_bytes() == before


def test_same_inputs_preserve_publication_time_and_previous_generation_rolls_back(tmp_path):
    first = payload(); publish(first, tmp_path); path = tmp_path / RELATIVE_PATH; before = path.read_bytes()
    again = deepcopy(first); again["published_at"] = "2025-01-04T09:00:00Z"
    assert publish(again, tmp_path)["status"] == "UNCHANGED" and path.read_bytes() == before
    changed = deepcopy(first); changed["input_hash"] = "a" * 64
    publish(changed, tmp_path)
    assert json.loads((path.parent / "releases" / (first["input_hash"] + ".json")).read_text()) == first


def test_compaction_keeps_actual_endpoints_and_unique_real_points():
    from datetime import date, timedelta
    points = [observation("shenyang", "黄瓜", "wholesale", 2 + i / 1000, (date(2020, 1, 1) + timedelta(days=i)).isoformat()) for i in range(2000)]
    history = compact_history(points)
    assert len(history) == 128 and history[0]["date"] == points[0].day and history[-1]["date"] == points[-1].day
    assert all({"date": p.day, "price": p.price} in history for p in (points[0], points[-1]))


def test_new_feed_does_not_hide_an_older_real_long_series():
    series = inputs()
    old = observation("shenyang", "黄瓜", "wholesale", 1., "2024-01-01")
    second = replace(old, day="2024-01-02", price=1.2)
    series.append(Series([old, second]))
    row = payload(series)["records"][0]
    assert row["display_date"] == "2025-01-02" and len(row["history"]) == 1
    assert row["trend_history"] == [{"date": "2024-01-01", "price": 1.}, {"date": "2024-01-02", "price": 1.2}]
    assert row["origin"]["trend_time_range"] == ["2024-01-01", "2024-01-02"]


def test_partial_feed_keeps_previous_native_observation_and_long_trend(tmp_path):
    first = payload(); publish(first, tmp_path)
    reduced = [s for s in inputs() if not (s.latest.region == "tieling" and s.latest.product == "甘蓝" and s.latest.level == "wholesale")]
    changed = payload(reduced)
    publish(changed, tmp_path)
    saved = json.loads((tmp_path / RELATIVE_PATH).read_text())
    rows = [r for r in saved["records"] if r["region"] == "tieling" and r["product"] == "甘蓝"]
    assert all(r["origin"]["kind"] == "historical" and r["observed_at"] == "2025-01-02" for r in rows)
    before = (tmp_path / RELATIVE_PATH).read_bytes()
    assert publish(payload(reduced), tmp_path)["status"] == "UNCHANGED"
    assert (tmp_path / RELATIVE_PATH).read_bytes() == before


def test_old_observation_uses_frozen_model_but_today_real_quote_still_wins():
    series = inputs()
    data = payload(series, predict)
    assert all(row["origin"]["kind"] == "model_estimate" for row in data["records"])
    series.append(Series([observation("shenyang", "黄瓜", "wholesale", 12., "2025-01-03")]))
    row = payload(series, predict)["records"][0]
    assert row["origin"]["kind"] == "observed" and row["price"] == 12.


def test_public_bootstrap_preserves_contract_without_private_paths():
    private = payload(inputs(), predict)
    public = public_snapshot(private)
    assert "provenance" not in public
    assert "test-fixture.parquet" not in json.dumps(public)
    assert len(public["records"]) == 224
    assert public["records"][0]["origin"]["model"]["model_id"] == "fixture-model"
    assert len(public["records"][0]["origin"]["price_type_surface_id"]) == 64


def test_selected_anchor_asset_keeps_latest_quote_and_separate_real_long_series():
    from pipelines.publishing.publish_market_presentation import anchor_asset, restore_anchors
    from pipelines.publishing.publish_market_display import _series
    series = inputs()
    point = replace(series[0].latest, source_id='older-fixture-source', day='2024-01-01')
    series.append(Series([point, replace(point, day='2024-01-02', price=3.)]))
    restored, _ = _series(restore_anchors(anchor_asset(series, {})))
    row = payload(restored)['records'][0]
    assert row['display_date'] == '2025-01-02'
    assert row['trend_history'] == [{'date': '2024-01-01', 'price': 2.}, {'date': '2024-01-02', 'price': 3.}]


def test_forecaster_calls_registered_local_inference_and_caches(monkeypatch):
    from backend.app import runtime_snapshot
    monkeypatch.setattr(runtime_snapshot, "bind", lambda: {})
    from backend.app.services import product_decision_service as model
    calls = []
    def infer(request, crop, horizon, local_only):
        calls.append((request.city_id, request.as_of, crop, horizon, local_only)); return predict(request.city_id, crop)
    monkeypatch.setattr(model, "_short_forecast", infer)
    forecaster = FrozenForecaster()
    assert forecaster("shenyang", "黄瓜") == forecaster("shenyang", "黄瓜")
    assert calls == [("shenyang", None, "黄瓜", 7, True)]
