# -*- coding: utf-8 -*-
"""只读长期双目标快照；不训练，不触发采集，不改变短期 Decision v1。"""
from __future__ import annotations
import json
import math
from datetime import date, timedelta
from typing import Any, Dict, Optional
from .. import config as C
from ..dependencies import slug_to_short
from ..errors import ApiError, ErrorCode

TARGETS = ("harvest_market_price", "cycle_market_average")
STATUSES = {"PRODUCTION_POINT", "PRODUCTION_SCENARIO", "SCENARIO_ONLY", "EXPLORATORY_SCENARIO_ONLY", "RESEARCH_ONLY"}
HORIZONS = (30, 60, 90, 120, 150, 180)


def _read(path) -> Optional[Dict[str, Any]]:
    try:
        obj = json.loads(path.read_text(encoding="utf-8"))
        return obj if isinstance(obj, dict) else None
    except (OSError, ValueError, UnicodeError):
        return None


def _load_latest():
    return _read(C.LH_LATEST)


def _finite(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _valid_entry(e):
    if not isinstance(e, dict) or e.get("target_type") not in TARGETS:
        return False
    if e.get("production_status") not in STATUSES or e.get("unit") != "CNY/kg":
        return False
    if e.get("range_type") not in ("scenario_range", "prediction_interval"):
        return False
    if not isinstance(e.get("crop"), str) or not e["crop"] or type(e.get("horizon")) is not int or e["horizon"] not in HORIZONS:
        return False
    if not isinstance(e.get("fallback_used"), bool) or not isinstance(e.get("actual_method", e.get("method")), str):
        return False
    window = e.get("target_window")
    if not isinstance(window, dict) or not isinstance(window.get("definition"), str) or not all(
            type(window.get(k)) is int for k in ("start_offset", "end_offset_exclusive")) or window["start_offset"] >= window["end_offset_exclusive"]:
        return False
    try:
        date.fromisoformat(e["anchor_observation_date"])
    except (KeyError, TypeError, ValueError):
        return False
    pt, lo, hi = (e.get(k) for k in ("point_forecast", "range_low", "range_high"))
    if not all(v is None or (_finite(v) and v > 0) for v in (pt, lo, hi)):
        return False
    if e.get("available") is not (pt is not None):
        return False
    if pt is None:
        return lo is None and hi is None
    return not ((lo is not None and lo > pt) or (hi is not None and hi < pt) or (lo is not None and hi is not None and lo > hi))


def _freshness(snap, crop=None):
    daily = _read(C.DAILY_LATEST)
    latest = (daily or {}).get("latest_data_date")
    lh_date = snap.get("latest_data_date") or snap.get("as_of")
    entries = [e for e in snap.get("entries", []) if not crop or e.get("crop") == crop]
    anchors = [e.get("anchor_observation_date") for e in entries]
    stale = bool(latest and (not lh_date or str(lh_date) < str(latest) or any(not a or str(a) < str(latest) for a in anchors)))
    return {"status": "LONG_HORIZON_STALE" if stale else "CURRENT" if latest else "DAILY_UNAVAILABLE",
            "daily_latest_data_date": latest, "long_horizon_as_of": snap.get("as_of"),
            "long_horizon_latest_data_date": lh_date,
            "daily_status": (daily or {}).get("data_freshness", "UNAVAILABLE"),
            "daily_delayed": (daily or {}).get("data_freshness") in ("DELAYED", "STALE", "FAILED"),
            "anchor_observation_date": min((a for a in anchors if a), default=None)}


def _snapshot():
    snap = _load_latest()
    if not snap or snap.get("schema_version") != "lh_forecast_v2":
        raise ApiError(503, ErrorCode.FORECAST_UNAVAILABLE, "双目标长期快照不可用，请先完成长期预测任务。")
    if not isinstance(snap.get("entries"), list) or not all(_valid_entry(e) for e in snap["entries"]):
        raise ApiError(503, ErrorCode.FORECAST_UNAVAILABLE, "长期快照契约校验失败。")
    keys = [(e.get("crop"), e.get("horizon"), e.get("target_type")) for e in snap["entries"]]
    if len(keys) != len(set(keys)):
        raise ApiError(503, ErrorCode.FORECAST_UNAVAILABLE, "长期快照包含重复目标。")
    try:
        date.fromisoformat(snap["as_of"])
    except (KeyError, TypeError, ValueError):
        raise ApiError(503, ErrorCode.FORECAST_UNAVAILABLE, "长期快照缺少有效数据基准日。")
    return snap


def capabilities(city_id):
    snap = _load_latest() or {}
    base = {"city_id": city_id, "supported": False, "crops": [], "as_of": snap.get("as_of"),
            "horizons": snap.get("horizons", []), "model_version": snap.get("model_version", "long_horizon_v2"),
            "data_version": snap.get("runtime_data_version", snap.get("data_version", "UNKNOWN")),
            "target_types": list(TARGETS), "limitation": None}
    if slug_to_short(city_id) != "沈阳":
        base["limitation"] = "长期预测当前仅支持沈阳，其他城市没有同口径数据。"
        return base
    try:
        snap = _snapshot()
    except ApiError as exc:
        base["limitation"] = exc.message
        return base
    by_crop = {}
    for e in snap["entries"]:
        h = e["horizon"]
        row = by_crop.setdefault(e["crop"], {}).setdefault(h, {"days": h, "targets": {}})
        row["targets"][e["target_type"]] = {k: e.get(k) for k in ("method", "actual_method", "confidence", "range_type", "production_status", "fallback_used", "target_window")}
        if e["target_type"] == "harvest_market_price":
            row.update({k: e.get(k) for k in ("method", "confidence", "range_type", "production_status")})
            row["n_nonoverlap"] = int(e.get("final_effective_n") or 0)
            row["n_final_effective"] = int(e.get("final_effective_n") or 0)
    base["crops"] = [{"id": c, "label": c, "horizons": [r for _, r in sorted(rows.items()) if set(r["targets"]) == set(TARGETS)]} for c, rows in sorted(by_crop.items())]
    base["supported"] = bool(base["crops"]) and all(c["horizons"] for c in base["crops"])
    base.update({"freshness": _freshness(snap), "generated_at": snap.get("generated_at"), "snapshot_hash": snap.get("snapshot_hash"), "method_registry_version": snap.get("method_registry_version")})
    return base


def _forecast(snap, crop, h, city_id, target):
    entries = {e["target_type"]: dict(e) for e in snap["entries"] if e.get("crop") == crop and e.get("horizon") == h}
    if target not in entries:
        raise ApiError(404, ErrorCode.NOT_FOUND, f"无 {crop} × {h} 天的 {target} 条目。")
    if set(entries) != set(TARGETS):
        raise ApiError(503, ErrorCode.FORECAST_UNAVAILABLE, "长期双目标快照不完整。")
    entry = entries[target]
    out = dict(entry)
    out.update({k: snap.get(k) for k in ("schema_version", "as_of", "latest_data_date", "model_version", "training_data_version", "runtime_data_version", "data_version", "snapshot_hash", "method_registry_version", "llm_model", "prompt_version", "generated_at")})
    out.update({"city_id": city_id, "market_as_of": snap.get("as_of"), "targets": entries,
                "freshness": _freshness(snap, crop), "llm_status": "LLM_UNAVAILABLE" if not snap.get("llm_model") else "AVAILABLE",
                "forecast": {"source": entry.get("forecast_source", "scenario_only"), "method": entry.get("method"), "actual_method": entry.get("actual_method", entry.get("method")), "horizon": h, "unit": "CNY/kg", "target_type": target, "range_type": entry["range_type"], "production_status": entry["production_status"], "fallback_used": bool(entry.get("fallback_used")), "model_disagreement": entry.get("model_disagreement_pct"), "model_disagreement_details": entry.get("model_disagreement")},
                "notes": snap.get("notes", [])})
    return out


def forecast(payload):
    allowed = {"contract_version", "city_id", "crop", "horizon_days", "target_type"}
    if not isinstance(payload, dict) or set(payload) - allowed or not {"crop", "horizon_days"} <= set(payload):
        raise ApiError(400, ErrorCode.VALIDATION_ERROR, "请提供 crop 与 horizon_days。")
    if payload.get("contract_version") not in (None, "1", "2"):
        raise ApiError(400, ErrorCode.VALIDATION_ERROR, "不支持的长期预测契约版本。")
    city_id = payload.get("city_id") or "shenyang"
    if slug_to_short(city_id) != "沈阳":
        raise ApiError(422, ErrorCode.UNSUPPORTED_CITY, "长期预测当前仅支持沈阳。")
    h, target = payload["horizon_days"], payload.get("target_type", "harvest_market_price")
    if type(h) is not int or h not in HORIZONS or target not in TARGETS or not isinstance(payload["crop"], str):
        raise ApiError(400, ErrorCode.VALIDATION_ERROR, "长期跨度或目标类型不支持。")
    return _forecast(_snapshot(), payload["crop"], h, city_id, target)


def _day(v):
    try:
        if not isinstance(v, str) or len(v) != 10:
            raise ValueError
        return date.fromisoformat(v)
    except (TypeError, ValueError):
        raise ApiError(400, ErrorCode.VALIDATION_ERROR, "日期必须是有效的 YYYY-MM-DD。")


def decision(payload):
    """利润只接受完整实际投入；缺失时比较相对当前价格环境。"""
    def invalid(message):
        raise ApiError(400, ErrorCode.VALIDATION_ERROR, message)
    if not isinstance(payload, dict) or set(payload) != {"contract_version", "user_context", "input_source"} or payload["contract_version"] != "2":
        invalid("长期决策需使用 contract_version='2' 与结构化输入。")
    ctx = payload["user_context"]
    required = {"city_id", "area_mu", "budget_cny", "risk_preference", "crop_preferences", "actual_inputs", "market_context"}
    if not isinstance(ctx, dict) or set(ctx) != required or payload["input_source"] != {"kind": "structured"}:
        invalid("长期决策输入字段不完整或包含不支持字段。")
    if slug_to_short(ctx["city_id"]) != "沈阳":
        raise ApiError(422, ErrorCode.UNSUPPORTED_CITY, "上市决策当前仅支持沈阳。")
    if not all(_finite(ctx[k]) and ctx[k] > 0 for k in ("area_mu", "budget_cny")):
        invalid("面积和预算必须是正的有限数值。")
    if ctx["risk_preference"] not in ("conservative", "balanced", "aggressive"):
        invalid("风险偏好不支持。")
    snap = _snapshot()
    as_of = _day(snap["as_of"])
    mc = ctx["market_context"]
    if not isinstance(mc, dict) or set(mc) - {"as_of", "expected_harvest_horizon_days", "expected_harvest_date"}:
        invalid("market_context 包含不支持字段。")
    if mc.get("as_of") is not None and _day(mc["as_of"]) != as_of:
        invalid("预生成长期结果仅支持当前快照基准日。")
    h, harvest_date = mc.get("expected_harvest_horizon_days"), mc.get("expected_harvest_date")
    if harvest_date is not None:
        delta = (_day(harvest_date) - as_of).days
        if h is not None and (type(h) is not int or h != delta):
            invalid("预计上市日与所选跨度不一致。")
        h = delta
    if type(h) is not int or h not in HORIZONS:
        invalid("请明确选择已登记的预计上市跨度，日期不自动匹配相邻档位。")
    crops_all = sorted({e["crop"] for e in snap["entries"]})
    prefs, actual = ctx["crop_preferences"], ctx["actual_inputs"]
    if not isinstance(prefs, list) or not all(isinstance(c, str) and c in crops_all for c in prefs) or len(set(prefs)) != len(prefs):
        invalid("请选择支持且不重复的作物。")
    if not isinstance(actual, dict) or set(actual) - set(crops_all):
        invalid("实际投入必须对应支持的作物。")
    for value in actual.values():
        if not isinstance(value, dict) or set(value) != {"cost_per_mu", "yield_kg_per_mu"} or not all(v is None or (_finite(v) and v > 0) for v in value.values()):
            invalid("实际成本、亩产必须为正的有限数值或 null。")
    daily = _read(C.DAILY_LATEST) or {}
    current = {r.get("crop"): r for r in daily.get("crops", []) if isinstance(r, dict)}
    rows = []
    for crop in prefs or crops_all:
        f = _forecast(snap, crop, h, ctx["city_id"], "harvest_market_price")
        harvest, obs = f["targets"]["harvest_market_price"], current.get(crop, {})
        point, low, high = (harvest.get(k) for k in ("point_forecast", "range_low", "range_high"))
        inputs = actual.get(crop, {})
        cost, yield_kg = inputs.get("cost_per_mu"), inputs.get("yield_kg_per_mu")
        complete = cost is not None and yield_kg is not None and point is not None
        total_cost = cost * ctx["area_mu"] if cost is not None else None
        if total_cost is not None and not _finite(total_cost):
            invalid("实际总成本超出有限数值范围。")
        budget_ok = total_cost <= ctx["budget_cny"] if total_cost is not None else None
        profits, revenues = {"low": None, "base": None, "high": None}, {"low": None, "base": None, "high": None}
        if complete:
            for key, price in zip(("low", "base", "high"), (low, point, high)):
                revenues[key] = round(price * yield_kg * ctx["area_mu"], 2) if price is not None else None
                profits[key] = round(revenues[key] - total_cost, 2) if revenues[key] is not None else None
                if revenues[key] is not None and (not _finite(revenues[key]) or not _finite(profits[key])):
                    invalid("实际投入推导的收入或利润超出有限数值范围。")
        latest_price = obs.get("latest_price")
        relative = point / latest_price - 1 if _finite(latest_price) and latest_price > 0 and point is not None else None
        warnings = []
        if not complete:
            warnings.append("缺少完整实际成本或亩产；仅比较市场价格环境，不输出利润。")
        if budget_ok is False:
            warnings.append("实际总成本超过预算，不纳入可行方案排序。")
        if harvest["production_status"] != "PRODUCTION_POINT":
            warnings.append("该上市档位未通过独立生产门禁，只能作情景参考。")
        if f["freshness"]["status"] != "CURRENT":
            warnings.append("长期数据尚未与 Daily 对齐，结果已标记陈旧或数据不可用。")
        rows.append({"crop": crop, "area_mu": ctx["area_mu"], "available": harvest["available"], "targets": f["targets"],
                     "price": {"low": low, "base": point, "high": high, "unit": "CNY/kg", "basis": "harvest_market_price"},
                     "profit": {**profits, "available": complete, "unit": "CNY", "basis": "user_input" if complete else "missing", "scenario_only": True, "cost_per_mu": cost, "yield_kg_per_mu": yield_kg, "total_cost": total_cost},
                     "revenue": {**revenues, "unit": "CNY", "scenario_only": True},
                     "budget_feasible": budget_ok, "harvest_relative_to_current": relative,
                     "current_market_context": {"as_of": obs.get("data_date"), "source": "daily_final_market_context" if obs else "unavailable",
                         "current_price": latest_price, "hri": obs.get("hri"), "hri_level": obs.get("hri_level"),
                         "market_risk": obs.get("market_risk"), "market_risk_level": obs.get("market_risk_level"),
                         "climate_exposure": {"available": False, "value": None, "reason": "NO_CUTOFF_SAFE_CLIMATE_SOURCE",
                                              "semantics": "historical_reference_not_future_weather"},
                         "semantics": "current_market_environment_not_future_risk"},
                     "model_disagreement": harvest.get("model_disagreement", {"dispersion_pct": harvest.get("model_disagreement_pct")}),
                     "freshness": f["freshness"], "warnings": warnings, "actual_method": harvest.get("actual_method", harvest.get("method")), "fallback_used": bool(harvest.get("fallback_used")), "production_status": harvest["production_status"], "confidence": harvest.get("confidence"), "recommendation_strength": "weak" if harvest["production_status"] != "PRODUCTION_POINT" else "moderate"})
    feasible = [r for r in rows if r["available"] and r["budget_feasible"] is not False]
    use_profit = bool(feasible) and all(r["profit"]["available"] for r in feasible)
    basis = "profit_scenario" if use_profit else "harvest_relative_market_environment"
    def score(row):
        if use_profit:
            val = row["profit"]["low" if ctx["risk_preference"] == "conservative" else "base"]
        else:
            val = row["harvest_relative_to_current"]
        return float(val) if val is not None else float("-inf")
    ranked = sorted((r for r in feasible if math.isfinite(score(r))), key=lambda r: (-score(r), r["crop"]))
    return {"contract_version": "2", "request": payload, "status": "SCENARIO_ONLY" if ranked else "NO_FEASIBLE_PLAN", "basis": "harvest_market_price", "market_as_of": str(as_of), "horizon_days": h, "expected_harvest_date": str(as_of + timedelta(days=h)), "candidates": rows, "ranking_basis": basis, "ranking": [{"crop": r["crop"], "score": round(score(r), 6)} for r in ranked],
            "recommendation": {"crop": ranked[0]["crop"] if ranked else None, "strength": "weak", "reason": "上市价格情景下的可比较方向，不是收益或生育期保证。"},
            "risk_preference_usage": {"selected": ctx["risk_preference"],
                "ranking_rule": "downside_profit_scenario" if use_profit and ctx["risk_preference"] == "conservative" else "base_profit_scenario" if use_profit else "caution_context_only",
                "future_risk_weighting": False,
                "note": "稳健偏好在实际投入齐全时按下行收益排序；市场环境比较没有经验证的未来风险权重，风险仅作背景。"},
            "freshness": _freshness(snap), "llm_status": "LLM_UNAVAILABLE" if not snap.get("llm_model") else "AVAILABLE", "model_version": snap.get("model_version"), "data_version": snap.get("runtime_data_version", snap.get("data_version")),
            "warnings": ["上市跨度来自用户选择，不推断作物生长周期。", "风险描述当前市场环境，不是上市时未来风险。", "未完成合法独立评估的长期结果只能作情景参考。"]}

__all__ = ["capabilities", "forecast", "decision"]
