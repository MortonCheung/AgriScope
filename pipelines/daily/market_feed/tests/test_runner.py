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


def test_failed_or_unvalidated_source_never_writes_returned_rows(tmp_path, monkeypatch):
    st = Store(tmp_path / 'unchecked.sqlite')
    try:
        for status, schema in [(C.ST_FAILED, True), (C.ST_SUCCESS, False)]:
            monkeypatch.setattr(runner, 'adapters_for', lambda rid: [_Fake(rid, status=status, schema_ok=schema)])
            result = runner.collect_region(st, 'shenyang', None, status)
            assert result['blocked'] is True
            assert st.counts('shenyang')['records'] == 0
    finally:
        st.close()


def test_all_rejected_records_are_not_classified_as_no_new_publication(tmp_path, monkeypatch):
    st = Store(tmp_path / 'reject.sqlite')
    monkeypatch.setattr(runner, 'adapters_for', lambda rid: [_Fake(rid)])
    monkeypatch.setattr(runner, 'validate', lambda rec: (False, 'invalid price'))
    try:
        result = runner.collect_region(st, 'shenyang', None, 'rejected')
        assert result['status'] == C.ST_SOURCE_SCHEMA_CHANGED and result['blocked'] is True
        assert st.counts('shenyang')['records'] == 0
    finally:
        st.close()


@pytest.mark.parametrize('statuses,expected', [
    ([], C.ST_FAILED),
    ([C.ST_FAILED, C.ST_FAILED], C.ST_FAILED),
    ([C.ST_SOURCE_SCHEMA_CHANGED, C.ST_FAILED], C.ST_FAILED),
    ([C.ST_NO_NEW_PUBLICATION, C.ST_NO_NEW_PUBLICATION], C.ST_NO_NEW_PUBLICATION),
    ([C.ST_SUCCESS, C.ST_NO_NEW_PUBLICATION], C.ST_SUCCESS),
    ([C.ST_SUCCESS, C.ST_FAILED], C.ST_PARTIAL),
    ([C.ST_PARTIAL, C.ST_FAILED], C.ST_PARTIAL),
])
def test_overall_separates_failures_no_new_and_partial(statuses, expected):
    assert runner._overall([{'status': status} for status in statuses]) == expected


def test_real_cli_reports_total_failure_and_keeps_successful_process_distinct(monkeypatch, capsys):
    from pipelines.daily.market_feed import cli
    from types import SimpleNamespace
    args = SimpleNamespace(regions=None, date=None, no_publish=False)
    summary = {'overallStatus': C.ST_FAILED, 'regions': [{'region_id': 'shenyang', 'status': C.ST_FAILED, 'note': 'timeout', 'counts': {}}], 'published': None}
    monkeypatch.setattr(cli, 'run', lambda **kw: summary)
    assert cli.cmd_run(args) == 1
    assert 'FEED ' in capsys.readouterr().out
    summary['overallStatus'] = C.ST_NO_NEW_PUBLICATION
    summary['regions'][0]['status'] = C.ST_NO_NEW_PUBLICATION
    assert cli.cmd_run(args) == 0


@pytest.mark.parametrize('entry', ['daily', 'run'])
def test_public_collection_cli_to_chain_contract_with_real_store_and_snapshots(tmp_path, monkeypatch, capsys, entry):
    """Exercise the actual production subcommand, not hand-built process stdout."""
    import json
    from pipelines.daily.market_feed import cli
    from scripts import run_daily_chain as chain
    for key, suffix in [('HOME', ''), ('RAW_DIR', 'raw'), ('SNAPSHOT_DIR', 'snapshots'),
                        ('LOG_DIR', 'logs'), ('LOCK_PATH', '.run.lock'), ('REPORT_DIR', 'reports')]:
        monkeypatch.setattr(C, key, tmp_path / suffix)
    db = tmp_path / 'market_feed.sqlite'
    monkeypatch.setattr(runner, 'Store', lambda: Store(db))
    monkeypatch.setattr(cli, 'Store', lambda: Store(db))
    monkeypatch.setattr(runner, 'adapters_for', lambda rid: [_Fake(rid)])

    assert cli.main([entry]) == 0
    first = chain._feed_outcome(capsys.readouterr().out)
    assert first['overallStatus'] == C.ST_SUCCESS
    assert {row['region_id'] for row in first['regions']} == set(C.REGION_ORDER)
    assert sum(row['counts']['inserted'] for row in first['regions']) == 7
    assert (C.SNAPSHOT_DIR / 'index.json').is_file()
    if entry == 'daily':
        assert list(C.REPORT_DIR.glob('*-sevenday.json'))

    assert cli.main([entry]) == 0
    repeated = chain._feed_outcome(capsys.readouterr().out)
    assert repeated['overallStatus'] == C.ST_NO_NEW_PUBLICATION
    assert sum(row['counts']['inserted'] + row['counts']['updated'] for row in repeated['regions']) == 0
    assert sum(row['counts']['unchanged'] for row in repeated['regions']) == 7

    monkeypatch.setattr(runner, 'adapters_for', lambda rid: [_Fake(rid, fail=True)])
    assert cli.main([entry]) == 1
    failed = chain._feed_outcome(capsys.readouterr().out)
    assert failed['overallStatus'] == C.ST_FAILED
    assert all(row['status'] == C.ST_FAILED for row in failed['regions'])
    # Real failed collection retained the successful database and snapshot data.
    with_db = Store(db)
    try:
        assert sum(with_db.counts(rid)['records'] for rid in C.REGION_ORDER) == 7
    finally:
        with_db.close()
    index = json.loads((C.SNAPSHOT_DIR / 'index.json').read_text())
    assert sum(row['recordCount'] for row in index['regions']) == 7
