# -*- coding: utf-8 -*-
"""Long-Horizon 服务：只读预生成快照（`data/processed/long_horizon/snapshots/latest.json`）。

约束（§12.1）：
  - **不改** `/api/decision` 语义；本服务只服务新增的 `/api/forecast/*`；
  - 只读：不触发抓取、不训练、不改冻结产物；
  - 失败隔离：快照缺失 → `LLM_UNAVAILABLE` 之外的显式错误（`FORECAST_UNAVAILABLE`），
    Decision / Daily 不受影响；
  - 诚实性：`production_status != PRODUCTION_POINT` 时必须原样透出，且带 `fallback_used`。
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from .. import config as C
from ..dependencies import slug_to_short
from ..errors import ApiError, ErrorCode


def _load_latest() -> Optional[Dict[str, Any]]:
    try:
        return json.loads(C.LH_LATEST.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return None


def _registry_rows() -> List[Dict[str, Any]]:
    try:
        import csv  # noqa: PLC0415
        with open(C.LH_REGISTRY, "r", encoding="utf-8-sig") as f:
            return list(csv.DictReader(f))
    except Exception:  # noqa: BLE001
        return []


def capabilities(city_id: str) -> Dict[str, Any]:
    """长期能力：crop × horizon × method × production_status（来自 Registry）。"""
    city_short = slug_to_short(city_id)
    snap = _load_latest()
    base: Dict[str, Any] = {
        "city_id": city_id, "supported": False, "crops": [],
        "as_of": (snap or {}).get("as_of"), "horizons": (snap or {}).get("horizons", []),
        "model_version": (snap or {}).get("model_version", "long_horizon_v1"),
        "data_version": (snap or {}).get("data_version", "UNKNOWN"),
        "limitation": None,
    }
    if city_short != "沈阳":
        base["limitation"] = f"长期预测当前仅支持沈阳；{city_id} 无同口径长期数据。"
        return base
    rows = _registry_rows()
    if not rows or snap is None:
        base["limitation"] = "Long-Horizon 快照/Registry 缺失（请先运行 Long-Horizon Forecast Job）。"
        return base

    by_crop: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        try:
            h = int(r["horizon"])
        except Exception:  # noqa: BLE001
            continue
        by_crop.setdefault(r["crop"], []).append({
            "days": h, "method": r.get("method"), "confidence": r.get("confidence"),
            "range_type": r.get("range_type"),
            "production_status": r.get("production_status"),
            "n_nonoverlap": int(float(r.get("n_nonoverlap") or 0)),
        })
    base["crops"] = [{"id": c, "label": c,
                      "horizons": sorted(v, key=lambda x: x["days"])}
                     for c, v in sorted(by_crop.items())]
    base["supported"] = len(base["crops"]) > 0
    base["generated_at"] = snap.get("generated_at")
    base["snapshot_hash"] = snap.get("snapshot_hash")
    return base


_REQ_KEYS = {"contract_version", "city_id", "crop", "horizon_days"}


def forecast(payload: Any) -> Dict[str, Any]:
    """长期预测主契约：返回该 (crop, horizon) 的预生成结果（只读快照）。"""
    if not isinstance(payload, dict) or set(payload) - _REQ_KEYS \
            or not {"crop", "horizon_days"} <= set(payload):
        raise ApiError(400, ErrorCode.VALIDATION_ERROR,
                       "请求需包含 crop 与 horizon_days（可选 contract_version/city_id）。")
    if payload.get("contract_version") not in (None, "1"):
        raise ApiError(400, ErrorCode.VALIDATION_ERROR, "仅支持 contract_version='1'。")
    city_id = payload.get("city_id") or "shenyang"
    if slug_to_short(city_id) != "沈阳":
        raise ApiError(422, ErrorCode.UNSUPPORTED_CITY, f"长期预测暂不支持：{city_id}。")
    try:
        h = int(payload["horizon_days"])
    except Exception:  # noqa: BLE001
        raise ApiError(400, ErrorCode.VALIDATION_ERROR, "horizon_days 必须是整数。")
    crop = str(payload["crop"])

    snap = _load_latest()
    if snap is None:
        raise ApiError(503, ErrorCode.FORECAST_UNAVAILABLE,
                       "Long-Horizon 快照不可用（未运行预测 Job）。",
                       {"hint": "python3 -m data.long_horizon.run_long_horizon_job"})
    if h not in (snap.get("horizons") or []):
        raise ApiError(400, ErrorCode.VALIDATION_ERROR,
                       f"horizon_days 需为 {snap.get('horizons')} 之一。", {"horizon_days": h})

    entry = next((e for e in snap.get("entries", [])
                  if e.get("crop") == crop and int(e.get("horizon", -1)) == h), None)
    if entry is None:
        raise ApiError(404, ErrorCode.NOT_FOUND,
                       f"无 {crop} × {h}d 的长期预测条目。", {"crop": crop, "horizon_days": h})

    out = dict(entry)
    out.update({
        "city_id": city_id,
        "as_of": snap.get("as_of"),
        "market_as_of": snap.get("market_as_of"),
        "model_version": snap.get("model_version"),
        "data_version": snap.get("data_version"),
        "snapshot_hash": snap.get("snapshot_hash"),
        "forecast": {
            "source": entry.get("forecast_source"),
            "method": entry.get("method"),
            "horizon": h,
            "unit": entry.get("unit", "CNY/kg"),
            "range_type": entry.get("range_type"),
            "production_status": entry.get("production_status"),
            "fallback_used": bool(entry.get("fallback_used", False)),
            "model_disagreement": entry.get("model_disagreement_pct"),
        },
        "notes": snap.get("notes", []),
    })
    return out


__all__ = ["capabilities", "forecast"]