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
from ..dependencies import short_to_slug, slug_to_short
from ..errors import ApiError, ErrorCode
from . import observation_service as O


def _feature(supported: bool, result_type: str, *, data_sources=None, required_inputs=None,
             validated_model=False, limitations=None, horizons=None, crop_ids=None) -> Dict[str, Any]:
    return {
        "supported": supported, "result_type": result_type if supported else "NOT_SUPPORTED",
        "data_sources": data_sources or [], "required_inputs": required_inputs or [],
        "validated_model": bool(validated_model and supported), "limitations": limitations or [],
        "horizons": horizons or [], "crop_ids": crop_ids or [],
    }


def _features(city_id: str, legacy: Dict[str, Any]) -> Dict[str, Any]:
    """功能能力独立分级；旧 supported 继续仅控制 Final 价格推理。"""
    slug = short_to_slug(slug_to_short(city_id))
    registered = slug in O.RESEARCH_CITIES
    observation = O.city_observation(slug) if registered else None
    production = observation["production"] if observation else {"available": False, "items": [], "source_paths": [], "limitations": ["该城市不在六城研究区内。"]}
    climate = observation["climate"] if observation else {"available": False, "source_paths": [], "limitations": ["该城市不在六城研究区内。"]}
    from . import long_horizon_service as LH
    long_cap = LH.capabilities(slug) if slug == "shenyang" else {"supported": False, "crops": []}
    formula_inputs = ["area_mu", "yield_kg_per_mu", "cost_per_mu", "assumed_sale_price_per_kg", "sale_fraction"]
    return {
        "short_term_price": _feature(
            bool(legacy["supported"]), "VERIFIED_MODEL", validated_model=True,
            data_sources=["models/reports/final/FINAL_MODEL_REGISTRY.csv", "models/reports/final/tables/price_model_selection.csv"],
            required_inputs=["crop", "horizon_days", "as_of"], horizons=[7, 14, 30] if legacy["supported"] else [],
            crop_ids=[crop["id"] for crop in legacy["crops"]],
            limitations=[legacy["limitation"]] if legacy["limitation"] else ["价格参考不等于收益保证；回测胜出的基线模型也属于正式参考路线。"],
        ),
        "long_horizon_scenario": _feature(
            bool(long_cap["supported"]), "EXPLORATORY_REFERENCE",
            data_sources=["LONG_HORIZON_V2_REGISTRY.csv"] if slug == "shenyang" else [],
            required_inputs=["crop", "horizon_days"],
            horizons=sorted({item["days"] for crop in long_cap["crops"] for item in crop["horizons"]}),
            crop_ids=[crop["id"] for crop in long_cap["crops"]],
            limitations=["仅沈阳有已发布长期市场情景；SCENARIO_ONLY 与 EXPLORATORY_SCENARIO_ONLY 均不是已验证未来预测。"]
            + ([long_cap["limitation"]] if long_cap.get("limitation") else []),
        ),
        "production_structure": _feature(
            production["available"], "OBSERVATIONAL_ANALYSIS", data_sources=production["source_paths"],
            limitations=production["limitations"], crop_ids=[item["crop"] for item in production["items"]],
        ),
        "historical_climate": _feature(
            climate["available"], "OBSERVATIONAL_ANALYSIS", data_sources=climate["source_paths"],
            limitations=climate["limitations"],
        ),
        "break_even": _feature(
            registered, "DETERMINISTIC_CALCULATION", required_inputs=formula_inputs,
            limitations=["基于用户设定的面积、亩产、成本、销售价格与销售比例进行公式核算；输入不代表本地实际行情。"],
        ),
        "user_scenario": _feature(
            registered, "USER_ASSUMPTION_SCENARIO", required_inputs=formula_inputs,
            limitations=["基于用户设定条件的情景结果；不提供未来亩产、灾害损失或收益保证。"],
        ),
    }


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
        raise ApiError(422, ErrorCode.UNSUPPORTED_CITY,
                       f"未登记城市：{city_id}（不做跨城 fallback）。", {"city_id": city_id})

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
    base["features"] = _features(city_id, base)
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
