# -*- coding: utf-8 -*-
"""运行器测试：区域隔离、状态分类、失败回退、并发锁。"""
from __future__ import annotations

import pytest

from pipelines.daily.market_feed import config as C
from pipelines.daily.market_feed import runner
from pipelines.daily.market_feed.normalize import make_record
from pipelines.daily.market_feed.sources.base import Adapter, FetchResult
from pipelines.daily.market_feed.store import Store


def _mk(region_id, price=2.0):
    return make_record(
        region_id=region_id, source_id="S", source_name="n", source_url="u",
        market_id="m", product_raw="土豆", observation_date="2026-10-13",
        collected_at="2026-10-13T20:30:00+08:00", original_price=price,
        original_unit="元/500克", price_level="market_average")


class _Fake(Adapter):
    def __init__(self, region_id, records=None, status=C.ST_SUCCESS, schema_ok=True,
                 fail=False):
        self.region_id = region_id
        self.source_id = "FAKE"
        self.source_name = "fake"
        self.frequency = "daily"
        self._records = records if records is not None else [_mk(region_id)]
        self._status = status
        self._schema_ok = schema_ok
        self._fail = fail

    def collect(self, target_date=None):
        if self._fail:
            raise RuntimeError("boom")
        r = FetchResult(region_id=self.region_id, source_id=self.source_id,
                        source_name=self.source_name, records=self._records,
                        status=self._status, schema_ok=self._schema_ok,
                        observation_date="2026-10-13")
        return r


def test_status_classification(tmp_path, monkeypatch):
    st = Store(tmp_path / "r.sqlite")
    try:
        # 首次插入 → SUCCESS
        monkeypatch.setattr(runner, "adapters_for", lambda rid: [_Fake(rid)])
        r = runner.collect_region(st, "shenyang", None, "run1")
        assert r["status"] == C.ST_SUCCESS and r["counts"]["inserted"] == 1
        # 重复运行，同数据 → NO_NEW_PUBLICATION（不产生新记录）
        r2 = runner.collect_region(st, "shenyang", None, "run2")
        assert r2["status"] == C.ST_NO_NEW_PUBLICATION
        assert st.counts("shenyang")["records"] == 1
    finally:
        st.close()


def test_failed_primary_falls_back(tmp_path, monkeypatch):
    st = Store(tmp_path / "f.sqlite")
    try:
        monkeypatch.setattr(runner, "adapters_for",
                            lambda rid: [_Fake(rid, fail=True),
                                         _Fake(rid, records=[_mk(rid, price=3.0)])])
        r = runner.collect_region(st, "chaoyang", None, "run")
        assert r["status"] == C.ST_SUCCESS and r["used_fallback"] is True
    finally:
        st.close()


def test_all_failed_keeps_previous(tmp_path, monkeypatch):
    st = Store(tmp_path / "g.sqlite")
    try:
        monkeypatch.setattr(runner, "adapters_for", lambda rid: [_Fake(rid)])
        runner.collect_region(st, "tieling", None, "run1")
        monkeypatch.setattr(runner, "adapters_for", lambda rid: [_Fake(rid, fail=True)])
        r = runner.collect_region(st, "tieling", None, "run2")
        assert r["status"] == C.ST_FAILED
        assert st.counts("tieling")["records"] == 1  # 上一有效数据保留
    finally:
        st.close()


def test_schema_changed_classified(tmp_path, monkeypatch):
    st = Store(tmp_path / "c.sqlite")
    try:
        monkeypatch.setattr(runner, "adapters_for",
                            lambda rid: [_Fake(rid, records=[], schema_ok=False,
                                               status=C.ST_SUCCESS)])
        r = runner.collect_region(st, "dalian", None, "run")
        assert r["status"] == C.ST_SOURCE_SCHEMA_CHANGED
    finally:
        st.close()


def test_run_lock_reentrant_guard():
    with runner.run_lock():
        with pytest.raises(RuntimeError):
            with runner.run_lock():
                pass
