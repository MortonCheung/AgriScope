# -*- coding: utf-8 -*-
"""核心逻辑测试：区域配置、单位/作物换算、记录幂等、存储修订、指标、发布契约。"""
from __future__ import annotations

import json

import pytest

from pipelines.daily.market_feed import config as C
from pipelines.daily.market_feed import metrics, normalize, publish
from pipelines.daily.market_feed.normalize import make_record, to_price_per_kg, validate
from pipelines.daily.market_feed.records import PriceRecord
from pipelines.daily.market_feed.store import Store


# ---------------------------------------------------------------- 区域配置
def test_seven_regions_complete():
    assert set(C.REGIONS) == {"shenyang", "tieling", "chaoyang", "jinzhou",
                              "dandong", "dalian", "liaoning"}
    assert set(C.REGION_ORDER) == set(C.REGIONS)
    assert C.REGIONS["liaoning"]["kind"] == "province"
    assert all(C.REGIONS[r]["kind"] == "city"
               for r in C.REGIONS if r != "liaoning")


# ---------------------------------------------------------------- 单位换算
@pytest.mark.parametrize("price,unit,expect", [
    (1.0, "元/500克", 2.0), (1.0, "元/500g", 2.0), (1.0, "元/斤", 2.0),
    (1.0, "元/公斤", 1.0), (1.0, "元/千克", 1.0), (1.0, "元/kg", 1.0),
    (1.0, "元/250g", 4.0),
])
def test_mass_unit_conversion(price, unit, expect):
    assert to_price_per_kg(price, unit) == expect


@pytest.mark.parametrize("unit", ["元/5升", "元/500ml", "元/升", "元/袋", "元/吨", "元/瓶"])
def test_non_mass_units_not_converted(unit):
    assert to_price_per_kg(10.0, unit) is None


def test_unknown_unit_not_converted():
    assert to_price_per_kg(3.0, "元/未知") is None


# ---------------------------------------------------------------- 作物映射
def test_potato_alias_maps_to_potato():
    assert normalize.standard_crop("马铃薯") == "土豆"
    assert normalize.standard_crop("洋芋") == "土豆"
    assert normalize.standard_crop("土豆") == "土豆"
    assert normalize.standard_crop("番茄") == "西红柿"


def test_piglet_and_hog_not_merged():
    assert normalize.standard_crop("仔猪") == "仔猪"
    assert normalize.standard_crop("生猪") == "生猪"
    assert normalize.standard_crop("仔猪") != normalize.standard_crop("生猪")


# ---------------------------------------------------------------- 记录与校验
def _rec(**kw):
    base = dict(region_id="liaoning", source_id="S", source_name="n", source_url="u",
                market_id="m", product_raw="土豆", observation_date="2026-10-13",
                collected_at="2026-10-13T20:30:00+08:00", original_price=1.5,
                original_unit="元/500克", price_level="market_average")
    base.update(kw)
    return make_record(**base)


def test_record_hash_idempotent_and_price_per_kg():
    r1, r2 = _rec(), _rec()
    assert r1.record_hash == r2.record_hash
    assert r1.price_per_kg == 3.0
    assert r1.product_standard == "土豆"


def test_validate_rejects_bad():
    assert validate(_rec(original_price=0))[0] is False
    assert validate(_rec(original_price=1, original_unit="元/5升"))[0] is True  # 允许入库，仅不换算
    bad = _rec(price_level="bogus")
    assert validate(bad) == (False, "BAD_PRICE_LEVEL")


# ---------------------------------------------------------------- 存储幂等 / 修订
def test_store_upsert_dedup_and_revision(tmp_path):
    st = Store(tmp_path / "x.sqlite")
    try:
        r = _rec()
        assert st.upsert(r) == "inserted"
        assert st.upsert(_rec()) == "unchanged"          # 幂等：重复采集不新增
        # 同日官方修订（价格变化）→ 留痕，不静默覆盖
        assert st.upsert(_rec(original_price=1.8)) == "updated"
        n = st.conn.execute("SELECT COUNT(*) FROM observations").fetchone()[0]
        assert n == 1
        revs = st.conn.execute("SELECT COUNT(*) FROM revisions").fetchone()[0]
        assert revs == 1
    finally:
        st.close()


def test_store_no_city_crosstalk(tmp_path):
    st = Store(tmp_path / "y.sqlite")
    try:
        st.upsert(_rec(region_id="tieling"))
        st.upsert(_rec(region_id="dandong"))
        assert st.counts("tieling")["records"] == 1
        assert st.counts("dandong")["records"] == 1
        assert st.region_rows("tieling")[0]["region_id"] == "tieling"
    finally:
        st.close()


# ---------------------------------------------------------------- 指标
def _row(date, price, crop="土豆", market="m", source="S", level="market_average"):
    return {"region_id": "liaoning", "region_name": "辽宁省", "source_id": source,
            "source_name": "n", "source_url": "u", "market_id": market,
            "product_raw": crop, "product_standard": crop, "product_specification": "",
            "observation_date": date, "price_per_kg": price, "price_level": level,
            "original_price": price / 2, "original_unit": "元/500克"}


def test_metrics_change_and_null_when_no_history():
    rows = [_row("2026-10-01", 2.0), _row("2026-10-11", 2.2), _row("2026-10-12", 3.3)]
    s = metrics.build_series(rows)[0]
    assert s["latestObservationDate"] == "2026-10-12"
    assert s["previousObservationDate"] == "2026-10-11"
    assert s["changePct"] == pytest.approx(50.0)
    assert s["previousIsYesterday"] is True
    # 7 日变化：相对 <= 10-05 的最近观测（10-01）
    assert s["change7dPct"] == pytest.approx(65.0)


def test_metrics_change_is_null_without_previous():
    s = metrics.build_series([_row("2026-10-12", 2.0)])[0]
    assert s["changePct"] is None
    assert s["change7dPct"] is None
    assert s["previousIsYesterday"] is False


def test_series_do_not_mix_levels():
    rows = [_row("2026-10-12", 2.0, level="wholesale"),
            _row("2026-10-12", 9.0, level="retail")]
    series = metrics.build_series(rows)
    assert len(series) == 2


# ---------------------------------------------------------------- 发布契约
def test_snapshot_contract_and_offline(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "SNAPSHOT_DIR", tmp_path / "snap")
    st = Store(tmp_path / "z.sqlite")
    try:
        st.upsert(_rec())
        snap = publish.build_region_snapshot(st, "liaoning", status=C.ST_SUCCESS)
        assert snap["schemaVersion"] == C.SCHEMA_VERSION
        assert snap["regionId"] == "liaoning"
        assert snap["unit"] == "元/kg"
        assert snap["dataVersion"]
        assert snap["series"] and set(["latestPricePerKg", "changePct", "history",
                                       "priceLevel", "freshness"]).issubset(snap["series"][0])
        idx = publish.build_index([snap], statuses={"liaoning": {"status": "SUCCESS"}})
        out = publish.publish([snap], idx)
        # 离线读取
        disk = json.loads((tmp_path / "snap" / "regions" / "liaoning.json").read_text("utf-8"))
        assert disk["dataVersion"] == snap["dataVersion"]
        index = json.loads((tmp_path / "snap" / "index.json").read_text("utf-8"))
        assert index["regionCount"] == 1
        assert index["regions"][0]["file"] == "regions/liaoning.json"
        assert out["index"].endswith("index.json")
    finally:
        st.close()
