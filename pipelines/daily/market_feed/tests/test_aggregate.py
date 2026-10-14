# -*- coding: utf-8 -*-
"""汇总层测试：算术平均、样本数、单位换算、缺失与涨跌、报表契约。"""
from __future__ import annotations

import json

from pipelines.daily.market_feed import aggregate as A
from pipelines.daily.market_feed import config as C
from pipelines.daily.market_feed.normalize import make_record
from pipelines.daily.market_feed.store import Store


def _ins(store, *, region, product, date, price, unit="元/500克", market="m1",
         source="S1", spec=""):
    rec = make_record(
        region_id=region, source_id=source, source_name=source, source_url="u",
        market_id=market, product_raw=product, observation_date=date,
        collected_at=f"{date}T20:30:00+08:00", original_price=price,
        original_unit=unit, price_level="market_average", product_specification=spec)
    return store.upsert(rec)


def test_average_and_sample_count(tmp_path):
    st = Store(tmp_path / "a.sqlite")
    try:
        # 同城同品种同日，两个来源 → 算术平均
        _ins(st, region="shenyang", product="土豆", date="2026-10-12", price=1.5,
             market="m1", source="S1")
        _ins(st, region="shenyang", product="土豆", date="2026-10-12", price=2.0,
             market="m2", source="S2")
        rep = A.build_report(st, generated_at="2026-10-12T20:30:00+08:00", version="test")
        it = [i for i in rep["items"] if i["region"] == "shenyang" and i["product"] == "土豆"][0]
        # 1.5元/500克→3.0；2.0元/500克→4.0；均值 3.5
        assert it["avg_price"] == 3.5
        assert it["sample_count"] == 2
        assert it["source_count"] == 2
        assert it["unit"] == "元/kg"
        assert it["date"] == "2026-10-12"
    finally:
        st.close()


def test_unit_conversion_in_average(tmp_path):
    st = Store(tmp_path / "b.sqlite")
    try:
        # 13.1 元/斤 → 26.2 元/kg；1.5 元/500克 → 3.0；均值 (26.2+3.0)/2 = 14.6
        _ins(st, region="jinzhou", product="猪肉", date="2026-09-27", price=13.1,
             unit="元/斤", market="m1")
        _ins(st, region="jinzhou", product="猪肉", date="2026-09-27", price=1.5,
             unit="元/500克", market="m2")
        rep = A.build_report(st, version="test")
        it = [i for i in rep["items"] if i["product"] == "猪肉"][0]
        assert it["avg_price"] == 14.6
        assert it["sample_count"] == 2
    finally:
        st.close()


def test_price_change_and_null_without_previous(tmp_path):
    st = Store(tmp_path / "c.sqlite")
    try:
        _ins(st, region="liaoning", product="黄瓜", date="2026-10-10", price=3.0)  # 6.0/kg
        _ins(st, region="liaoning", product="黄瓜", date="2026-10-13", price=3.3)  # 6.6/kg
        rep = A.build_report(st, version="test")
        it = [i for i in rep["items"] if i["product"] == "黄瓜"][0]
        assert it["date"] == "2026-10-13"
        assert it["avg_price"] == 6.6
        assert it["price_change"] == 10.0  # (6.6-6.0)/6.0*100

        # 无历史的品种 → price_change 为 null（不是 0）
        _ins(st, region="liaoning", product="萝卜", date="2026-10-13", price=1.0)
        rep2 = A.build_report(st, version="test")
        it2 = [i for i in rep2["items"] if i["product"] == "萝卜"][0]
        assert it2["price_change"] is None
    finally:
        st.close()


def test_non_convertible_unit_excluded(tmp_path):
    st = Store(tmp_path / "d.sqlite")
    try:
        # 元/5升 不可换算 → 不参与平均、不生成条目
        _ins(st, region="liaoning", product="豆油", date="2026-10-13", price=64.19,
             unit="元/5升")
        rep = A.build_report(st, version="test")
        assert all(i["product"] != "豆油" for i in rep["items"])
    finally:
        st.close()


def test_report_contract(tmp_path):
    st = Store(tmp_path / "e.sqlite")
    try:
        _ins(st, region="tieling", product="土豆", date="2026-10-05", price=1.5)
        rep = A.build_report(st, version="74d1696")
        assert rep["schemaVersion"] == A.REPORT_SCHEMA_VERSION
        assert rep["reportType"] == A.REPORT_TYPE
        assert rep["timezone"] == "Asia/Shanghai"
        assert rep["version"] == "74d1696"
        assert rep["versionHash"]
        assert rep["itemCount"] == len(rep["items"]) >= 1
        item = rep["items"][0]
        for k in ("date", "region", "product", "unit", "avg_price", "sample_count",
                  "updated_at", "source_count", "price_change"):
            assert k in item, k
        # 可序列化（jq / json.tool 可校验）
        json.loads(json.dumps(rep, ensure_ascii=False))
        # 写盘 + 文件名契约
        path = A.write_report(rep, tmp_path / "out")
        assert path.endswith(f"{rep['date']}-sevenday.json")
        disk = json.loads(open(path, encoding="utf-8").read())
        assert disk["versionHash"] == rep["versionHash"]
    finally:
        st.close()


def test_contract_fields_present(tmp_path):
    st = Store(tmp_path / "lvl.sqlite")
    try:
        _ins(st, region="shenyang", product="土豆", date="2026-10-13", price=1.0,
             market="m1", source="S1")  # market_average
        st.conn.execute("UPDATE observations SET price_level='wholesale' "
                        "WHERE market_id='m1'")
        st.conn.commit()
        rep = A.build_report(st, version="test")
        for i in rep["items"]:
            for k in ("price_level", "price_level_cn"):
                assert k in i
    finally:
        st.close()


def test_different_levels_not_merged(tmp_path):
    st = Store(tmp_path / "lvl2.sqlite")
    try:
        _ins(st, region="shenyang", product="土豆", date="2026-10-13", price=1.0,
             market="m1", source="S1")  # market_average
        _ins(st, region="shenyang", product="土豆", date="2026-10-13", price=2.0,
             market="m2", source="S2")
        st.conn.execute("UPDATE observations SET price_level='wholesale' WHERE market_id='m2'")
        st.conn.commit()
        rep = A.build_report(st, version="test")
        items = [i for i in rep["items"] if i["product"] == "土豆"]
        assert len(items) == 2                                   # 两个口径 → 两条，不合并
        assert {i["price_level"] for i in items} == {"market_average", "wholesale"}
        assert all(i["sample_count"] == 1 for i in items)
    finally:
        st.close()


def test_missing_region_emits_nothing(tmp_path):
    st = Store(tmp_path / "f.sqlite")
    try:
        _ins(st, region="shenyang", product="土豆", date="2026-10-12", price=1.5)
        rep = A.build_report(st, version="test")
        regions = {i["region"] for i in rep["items"]}
        assert regions == {"shenyang"}          # 无数据的区域不补造条目
        assert C.REGIONS["dalian"]["name"] not in json.dumps(rep)
    finally:
        st.close()


def _set_level(st, market, level):
    st.conn.execute("UPDATE observations SET price_level=? WHERE market_id=?", (level, market))
    st.conn.commit()


def test_by_region_nested_and_null_for_missing_level(tmp_path):
    st = Store(tmp_path / "n.sqlite")
    try:
        # 沈阳：批发 + 超市有数据，集市缺失 → 集市应为 price=null（不填 0，不报错）
        _ins(st, region="shenyang", product="土豆", date="2026-10-13", price=1.0,
             market="m_ws", source="S1")
        _set_level(st, "m_ws", "wholesale")
        _ins(st, region="shenyang", product="土豆", date="2026-10-13", price=1.2,
             market="m_sm", source="S2")
        _set_level(st, "m_sm", "supermarket")
        rep = A.build_report(st, version="test")
        by = {r["region"]: r for r in rep["byRegion"]}
        sy = by["shenyang"]
        assert [l["price_level"] for l in sy["supportedPriceLevels"]] == \
            ["wholesale", "supermarket", "retail_market"]
        prices = sy["products"][0]["prices"]
        lv = {p["price_level"]: p for p in prices}
        assert lv["wholesale"]["price"] == 2.0 and lv["supermarket"]["price"] == 2.4
        assert lv["retail_market"]["price"] is None          # 缺失口径 = null，且不报错
        assert set(lv) == {"wholesale", "supermarket", "retail_market"}
    finally:
        st.close()


def test_supported_levels_per_region(tmp_path):
    st = Store(tmp_path / "n2.sqlite")
    try:
        _ins(st, region="tieling", product="土豆", date="2026-10-05", price=1.5)
        rep = A.build_report(st, version="test")
        by = {r["region"]: r for r in rep["byRegion"]}
        assert [l["price_level"] for l in by["tieling"]["supportedPriceLevels"]] == ["market_average"]
        # 只有实际存在的区域才出现在 byRegion
        assert "shenyang" not in by
    finally:
        st.close()
