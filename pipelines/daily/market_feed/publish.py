# -*- coding: utf-8 -*-
"""发布：把某区域的最新指标写成版本化 JSON 快照，并生成轻量索引。

- 只在校验通过后原子发布；发布失败保留上一可用版本（不删旧文件）。
- 每区域独立文件 + 一个索引文件，前端可按需读取，也可离线读取最后快照。
"""
from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path

from . import config as C
from .clock import now_str
from .metrics import build_series, region_freshness
from .store import Store


def _data_version(payload: dict) -> str:
    core = {k: v for k, v in payload.items() if k not in ("generatedAt", "dataVersion")}
    return hashlib.sha256(json.dumps(core, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]


def build_region_snapshot(store: Store, region_id: str, *, status: str,
                          ref_date: date | None = None, notes: list | None = None) -> dict:
    region = C.REGIONS[region_id]
    rows = store.region_rows(region_id)
    series = build_series(rows, ref_date)
    latest = max((s["latestObservationDate"] for s in series), default=None)
    counts = store.counts(region_id)
    sources = sorted({(s["sourceId"], s["sourceName"], s["sourceUrl"], s["priceLevel"])
                      for s in series})
    payload = {
        "schemaVersion": C.SCHEMA_VERSION,
        "frameworkVersion": C.FRAMEWORK_VERSION,
        "generatedAt": now_str(),
        "regionId": region_id,
        "regionName": region["name"],
        "regionKind": region["kind"],
        "isProvince": region["kind"] == "province",
        "status": status,
        "unit": "元/kg",
        "freshness": region_freshness(latest, ref_date),
        "quality": {"records": counts["records"], "firstDate": counts["first_date"],
                    "lastDate": counts["last_date"], "seriesCount": len(series)},
        "sources": [{"sourceId": s[0], "sourceName": s[1], "sourceUrl": s[2], "priceLevel": s[3]}
                    for s in sources],
        "notes": list(notes or []),
        "series": series,
    }
    payload["dataVersion"] = _data_version(payload)
    return payload


def build_index(snapshots: list[dict], *, statuses: dict | None = None) -> dict:
    regions = []
    for snap in snapshots:
        region_id = snap["regionId"]
        st = (statuses or {}).get(region_id, {})
        regions.append({
            "regionId": region_id,
            "regionName": snap["regionName"],
            "regionKind": snap["regionKind"],
            "status": st.get("status", snap.get("status")),
            "blocked": bool(st.get("blocked", False)),
            "latestObservationDate": snap["freshness"]["latestObservationDate"],
            "freshness": snap["freshness"]["freshness"],
            "ageDays": snap["freshness"]["ageDays"],
            "seriesCount": snap["quality"]["seriesCount"],
            "recordCount": snap["quality"]["records"],
            "file": f"regions/{region_id}.json",
            "dataVersion": snap["dataVersion"],
            "note": st.get("note", ""),
        })
    order = {rid: i for i, rid in enumerate(C.REGION_ORDER)}
    regions.sort(key=lambda r: order.get(r["regionId"], 99))
    return {
        "schemaVersion": C.SCHEMA_VERSION,
        "frameworkVersion": C.FRAMEWORK_VERSION,
        "generatedAt": now_str(),
        "regionCount": len(regions),
        "regions": regions,
    }


def publish(snapshots: list[dict], index: dict) -> dict:
    """原子发布各区域快照与索引。返回写入的文件列表。"""
    C.ensure_dirs()
    regions_dir = C.SNAPSHOT_DIR / "regions"
    regions_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for snap in snapshots:
        path = regions_dir / f"{snap['regionId']}.json"
        _atomic_json(path, snap)
        written.append(str(path))
    idx_path = C.SNAPSHOT_DIR / "index.json"
    _atomic_json(idx_path, index)
    written.append(str(idx_path))
    return {"written": written, "index": str(idx_path)}


def _atomic_json(path: Path, obj) -> None:
    import os
    import tempfile
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".tmp-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
