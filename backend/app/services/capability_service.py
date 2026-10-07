# -*- coding: utf-8 -*-
"""能力服务：把 Final capabilities 转成前端 DecisionCapability 契约。

前端 parseCapability 要求：
  { city_id, tier, supported, crops:[{id,label,horizons:[{days,mode}]}],
    market_as_of(支持时非空), model_version, data_version, code_fingerprint, limitation }
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from .. import runtime_snapshot as RS
from ..dependencies import slug_to_short


def _cap():
    from decision_engine.final import capabilities as CAP  # noqa: PLC0415
    return CAP


@lru_cache(maxsize=32)
def market_as_of(city_short: str) -> Optional[str]:
    """绑定快照中该城市价格数据的最新日期（真实的运行时数据基准）。"""
    snap = RS.state().get("snapshot_dir")
    if not snap:
        return None
    p = Path(snap) / "datasets" / f"decision_dataset_{city_short}.parquet"
    if not p.exists():
        return None
    try:
        import pandas as pd  # noqa: PLC0415
        d = pd.read_parquet(p, columns=["date"])
        if not len(d):
            return None
        return str(pd.to_datetime(d["date"]).max().date())
    except Exception:  # noqa: BLE001
        return None


def _horizons(cap_city: Dict[str, Any], available: List[int]) -> List[Dict[str, Any]]:
    model_h = [int(h) for h in (cap_city.get("model_horizons") or [])]
    scen_h = [int(h) for h in (cap_city.get("scenario_horizons") or [])]
    out: List[Dict[str, Any]] = []
    for h in sorted(set(available) | set(model_h)):
        out.append({"days": h, "mode": "model" if h in model_h else "scenario_only"})
    for h in sorted(set(scen_h) - set(available) - set(model_h)):
        out.append({"days": h, "mode": "scenario_only"})
    return out


def capability(city_id: str) -> Dict[str, Any]:
    CAP = _cap()
    versions = RS.read_final_versions()
    city_short = slug_to_short(city_id)
    base = {
        "city_id": city_id,
        "tier": "UNKNOWN",
        "supported": False,
        "crops": [],
        "market_as_of": None,
        "model_version": versions["model_version"],
        "data_version": versions["data_version"],
        "code_fingerprint": versions["code_fingerprint"],
        "limitation": None,
    }
    if city_short is None:
        base["limitation"] = f"未登记城市：{city_id}（不做跨城 fallback）。"
        return base

    cap = CAP.city_capability(city_short)
    base["tier"] = str(cap.get("tier") or "UNKNOWN")
    base["limitation"] = cap.get("limitation")

    crops: List[Dict[str, Any]] = []
    for crop in (cap.get("crops") or []):
        cc = CAP.crop_capability(city_short, crop)
        if cc.get("status") != "OK":
            continue
        available = [int(h) for h in (cc.get("available_horizons") or [])]
        crops.append({"id": crop, "label": crop,
                      "horizons": _horizons(cap, available)})

    base["crops"] = crops
    base["supported"] = bool(cap.get("has_price_model")) and len(crops) > 0
    if base["supported"]:
        base["market_as_of"] = market_as_of(city_short)
        if base["market_as_of"] is None:
            base["supported"] = False
            base["limitation"] = base["limitation"] or "运行时快照缺该城市价格数据。"
    return base


def capability_all() -> Dict[str, Any]:
    """全部登记城市的能力摘要（供 /api/meta 使用）。"""
    CAP = _cap()
    out = {}
    for city_short in CAP.CITY_CAPABILITY.keys():
        from ..dependencies import short_to_slug
        slug = short_to_slug(city_short) or city_short
        out[city_short] = capability(slug)
    return out