# -*- coding: utf-8 -*-
"""运行器：编排七区域采集 → 校验 → 入库 → 发布快照。

- 单实例锁，防止 20:30 与 23:30 两次任务并发写库。
- 逐区域独立状态，单个数据源失败不影响其他区域。
- 主来源失败自动尝试备用来源；全部失败保留上一有效数据并记录。
- 只在通过校验后原子发布新快照；发布失败保留上一版本。
"""
from __future__ import annotations

import fcntl
import json
import traceback
from contextlib import contextmanager
from datetime import date
from typing import Optional

from . import config as C, publish as P
from .clock import now_str, today_str
from .normalize import validate
from .sources import adapters_for
from .store import Store


@contextmanager
def run_lock():
    C.ensure_dirs()
    fh = open(C.LOCK_PATH, "w")
    try:
        fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fh.write(now_str())
        fh.flush()
        yield
    except BlockingIOError:
        raise RuntimeError("另一个 market_feed 运行正在进行中（锁被占用）")
    finally:
        try:
            fcntl.flock(fh, fcntl.LOCK_UN)
        finally:
            fh.close()


def _upsert_all(store: Store, res) -> dict:
    inserted = updated = unchanged = rejected = 0
    samples = []
    for rec in res.records:
        ok, reason = validate(rec)
        if not ok:
            rejected += 1
            continue
        outcome = store.upsert(rec)
        if outcome == "inserted":
            inserted += 1
            if len(samples) < 3:
                samples.append({"product": rec.product_standard or rec.product_raw,
                                "price": rec.original_price, "unit": rec.original_unit,
                                "date": rec.observation_date})
        elif outcome == "updated":
            updated += 1
        else:
            unchanged += 1
    return {"inserted": inserted, "updated": updated, "unchanged": unchanged,
            "rejected": rejected, "samples": samples}


def _classify(res, counts: dict) -> str:
    if res.status == "FAILED":
        return C.ST_FAILED
    if not res.schema_ok:
        return C.ST_SOURCE_SCHEMA_CHANGED
    if res.records and counts["inserted"] == 0 and counts["updated"] == 0:
        return C.ST_NO_NEW_PUBLICATION
    if res.records and counts["rejected"]:
        return C.ST_PARTIAL
    if res.records:
        return C.ST_SUCCESS
    return C.ST_NO_NEW_PUBLICATION


def collect_region(store: Store, region_id: str, target_date: Optional[date],
                   run_id: str) -> dict:
    """采集单个区域（含主/备来源回退）。返回该区域状态字典。"""
    started = now_str()
    adapters = adapters_for(region_id)
    if not adapters:
        store.log_run(run_id, region_id, C.ST_FAILED, detail={"error": "无适配器"},
                      started_at=started)
        return {"region_id": region_id, "status": C.ST_FAILED,
                "blocked": True, "note": "无适配器", "counts": {}}

    last = None
    for i, adapter in enumerate(adapters):
        try:
            res = adapter.collect(target_date)
        except Exception as exc:  # noqa: BLE001
            res = None
            last = {"error": f"{type(exc).__name__}: {exc}",
                    "trace": traceback.format_exc()[-400:]}
        else:
            counts = _upsert_all(store, res)
            status = _classify(res, counts)
            if res.status == "FAILED" or status == C.ST_SOURCE_SCHEMA_CHANGED:
                # 主来源不可用 → 尝试备用
                last = {"source_id": res.source_id, "status": status, "error": res.error,
                        "schema_note": res.schema_note, "counts": counts}
                if i < len(adapters) - 1:
                    continue
            store.log_run(
                run_id, region_id, status, source_id=res.source_id,
                target_date=res.observation_date or today_str(),
                fetched=len(res.records), inserted=counts["inserted"],
                updated=counts["updated"], rejected=counts["rejected"],
                latest_date=store.latest_date(region_id),
                detail={"adapter": type(adapter).__name__, "frequency": adapter.frequency,
                        "raw_paths": res.raw_paths[:4], "samples": counts["samples"],
                        "detail": res.detail, "error": res.error, "schema_note": res.schema_note},
                started_at=started)
            return {"region_id": region_id, "status": status,
                    "source_id": res.source_id, "blocked": False,
                    "note": res.schema_note or res.error or "",
                    "counts": counts, "frequency": adapter.frequency,
                    "observation_date": res.observation_date,
                    "used_fallback": i > 0}

    store.log_run(run_id, region_id, C.ST_FAILED, detail={"last": last or {}},
                  started_at=started)
    return {"region_id": region_id, "status": C.ST_FAILED, "blocked": True,
            "note": (last or {}).get("schema_note") or (last or {}).get("error") or "全部来源失败",
            "counts": {}}


def run(regions: Optional[list[str]] = None, target_date: Optional[date] = None,
        publish_output: bool = True, progress=lambda *a: None) -> dict:
    """主入口。返回运行摘要，并（可选）发布快照。"""
    C.ensure_dirs()
    regions = regions or list(C.REGION_ORDER)
    run_id = f"{now_str()}#{today_str()}"
    results, statuses = [], {}
    with run_lock():
        store = Store()
        try:
            for rid in regions:
                progress("region_start", rid)
                r = collect_region(store, rid, target_date, run_id)
                results.append(r)
                statuses[rid] = r
                progress("region_done", rid, r.get("status"))
            snapshots = []
            for rid in regions:
                st = statuses[rid]
                snap = P.build_region_snapshot(
                    store, rid, status=st["status"],
                    ref_date=target_date,
                    notes=_region_notes(st))
                snapshots.append(snap)
            index = P.build_index(snapshots, statuses=statuses)
            published = None
            if publish_output:
                published = P.publish(snapshots, index)
                progress("published", published["index"])
        finally:
            store.close()

    summary = {
        "runId": run_id,
        "generatedAt": now_str(),
        "regions": results,
        "overallStatus": _overall(results),
        "published": published,
    }
    C.LOG_DIR.mkdir(parents=True, exist_ok=True)
    (C.LOG_DIR / f"run_{run_id.replace(':', '').replace('#', '_')}.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    return summary


def _region_notes(st: dict) -> list:
    notes = []
    if st.get("used_fallback"):
        notes.append(f"主来源不可用，已回退备用来源：{st.get('source_id')}")
    if st.get("note"):
        notes.append(st["note"])
    freq = st.get("frequency")
    if freq and freq != "daily":
        notes.append(f"该来源更新频率为 {freq}，非每日；无新发布属正常。")
    return notes


def _overall(results: list) -> str:
    stats = [r["status"] for r in results]
    if all(s in (C.ST_SUCCESS, C.ST_NO_NEW_PUBLICATION) for s in stats):
        return C.ST_SUCCESS
    if any(s == C.ST_FAILED for s in stats):
        return C.ST_PARTIAL
    return C.ST_PARTIAL
