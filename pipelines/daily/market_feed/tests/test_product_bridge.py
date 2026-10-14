# -*- coding: utf-8 -*-
"""product_bridge：worker 观测库 → 产品 V3 不可变行情代（离线、确定性）。"""
from __future__ import annotations

import json

import pytest

from pipelines.daily.market_feed import product_bridge as BR
from pipelines.daily.market_feed.clock import now
from pipelines.daily.market_feed.normalize import make_record
from pipelines.daily.market_feed.store import Store


def _seed_store(db_path):
    ts = now().replace(microsecond=0)
    day = ts.date().isoformat()
    store = Store(db_path)
    store.upsert(make_record(
        region_id="shenyang", source_id="SRC-SY-CLZ", source_name="沈阳市 · 菜篮子信息发布平台",
        source_url="https://www.lnsyjgjc.com/api/showList", market_id="shenyang_批发价格",
        product_raw="黄瓜", observation_date=day, collected_at=ts.isoformat(),
        original_price=1.9, original_unit="元/500g", price_level="wholesale",
        source_parser_version="shenyang_clz-1.0.0"))
    store.log_run("run-1", "shenyang", "SUCCESS", source_id="SRC-SY-CLZ", target_date=day,
                  fetched=1, inserted=1, latest_date=day,
                  started_at=ts.replace(hour=0, minute=0, second=0).isoformat())
    store.close()
    return day


def test_snapshot_is_checkpointed_and_receipted(tmp_path):
    db = tmp_path / "market_feed.sqlite"
    _seed_store(db)
    snapshot, provenance = BR.build_snapshot(db, tmp_path / "publication")
    assert snapshot.is_file() and provenance.is_file()
    assert not (snapshot.parent / (snapshot.name + "-wal")).exists()
    receipt = json.loads(provenance.read_text(encoding="utf-8"))
    import hashlib
    assert receipt["sha256"] == hashlib.sha256(snapshot.read_bytes()).hexdigest()


def test_verified_regions_are_derived_from_real_runs(tmp_path):
    db = tmp_path / "market_feed.sqlite"
    _seed_store(db)
    store = Store(db)
    try:
        assert BR.verified_regions(store) == ["shenyang"]
        store.log_run("run-2", "dalian", "SOURCE_FAILED", detail={"error": "timeout"})
        store.conn.commit()
        assert BR.verified_regions(store) == ["shenyang"]
    finally:
        store.close()


def test_bridge_publishes_strict_v3_generation(tmp_path):
    from pipelines.publishing.publish_market_display import publish as publish_display
    worker = tmp_path / "worker"
    db = worker / "market_feed.sqlite"
    _seed_store(db)
    snapshot, _ = BR.build_snapshot(db, worker / "publication")
    runtime = tmp_path / "runtime"
    runtime.mkdir()
    (runtime / "manifest.json").write_text(json.dumps({"assets": [], "generated_at": "frozen"}))
    result = publish_display(project_root=worker, runtime_root=runtime, feed_db=snapshot,
                             strict=True, write_frontend=False, configured_regions={"shenyang"})
    assert result["status"] == "PUBLISHED" and result["record_count"] == 1 and result["missing_count"] == 223
    payload = json.loads((runtime / result["generation"] / "display.json").read_text())
    assert payload["schema_version"] == "3" and payload["price_levels"] == ["wholesale", "supermarket", "retail_market", "market_average"]
    assert payload["published_at"] is None  # real time comes from the atomic manifest pointer
    assert payload["coverage"]["shenyang"]["collection_status"] == "configured"
    assert payload["coverage"]["jinzhou"]["collection_status"] == "not_configured"
    row = payload["records"][0]
    assert row["unit"] == "元/kg" and row["source"]["id"] == "SRC-SY-CLZ"


def test_bridge_refuses_unregistered_source_region(tmp_path):
    from pipelines.publishing.publish_market_display import publish as publish_display
    worker = tmp_path / "worker"
    db = worker / "market_feed.sqlite"
    ts = now().replace(microsecond=0)
    day = ts.date().isoformat()
    store = Store(db)
    # Same real source id but mislabelled region must be rejected, not silently adopted.
    store.upsert(make_record(
        region_id="dalian", source_id="SRC-SY-CLZ", source_name="沈阳菜篮子",
        source_url="https://www.lnsyjgjc.com/api/showList", market_id="dalian_x",
        product_raw="黄瓜", observation_date=day, collected_at=ts.isoformat(),
        original_price=1.9, original_unit="元/500g", price_level="wholesale",
        source_parser_version="shenyang_clz-1.0.0"))
    store.log_run("run-1", "dalian", "SUCCESS", source_id="SRC-SY-CLZ", target_date=day,
                  fetched=1, inserted=1, latest_date=day,
                  started_at=ts.replace(hour=0, minute=0, second=0).isoformat())
    store.close()
    snapshot, _ = BR.build_snapshot(db, worker / "publication")
    runtime = tmp_path / "runtime"
    runtime.mkdir()
    (runtime / "manifest.json").write_text(json.dumps({"assets": [], "generated_at": "frozen"}))
    result = publish_display(project_root=worker, runtime_root=runtime, feed_db=snapshot,
                             strict=True, write_frontend=False, configured_regions={"dalian"})
    assert result["record_count"] == 0 and result["missing_count"] == 224
