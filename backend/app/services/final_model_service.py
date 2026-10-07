# -*- coding: utf-8 -*-
"""Final Model 服务：把前端 FinalDecisionRequest 映射为 Final 引擎入参，
再把 evaluate_many 输出包装成前端 HttpDecisionProvider 期望的信封。

信封（前端 finalAdapter.adaptFinalDecision 的权威要求）：
  { request, batch(=evaluate_many 输出), market_as_of, model_version, data_version, code_fingerprint }

严格约束：
  - request 原样回显（前端 sameDecisionContext 要求逐字段一致）；
  - market_as_of 必须等于 request.user_context.market_context.as_of；
  - 不改 Final 算法、不重训；只读调用。

严格校验与压力情景语义对齐桥接实现（AgriScope/server/agriscope_api.py）中更严谨的部分：
  - 精确键集校验、城市/作物/horizon 白名单、as_of 不得晚于模型最新数据日期；
  - 压力情景只走 Final 原生 `optimize._scenario_profit`（官方 SHOCKS），
    不支持的组合（含上市延迟）返回 available=false，不自造映射。
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from .. import runtime_snapshot as RS
from ..dependencies import get_engine, inference_lock, lock_enabled, new_request_id, slug_to_short
from ..errors import ApiError, ErrorCode
from . import capability_service as CAPS

_CONTRACT_VERSION = "1"
_VALID_PREFS = ("conservative", "balanced", "aggressive")
_VALID_HORIZONS = (7, 14, 30, 60, 90)
_MAX_LIST = 20

_REQ_KEYS = {"contract_version", "user_context", "input_source"}
_CTX_KEYS = {"city_id", "area_mu", "budget_cny", "risk_preference", "crop_preferences",
             "actual_inputs", "market_context"}
_MARKET_KEYS = {"as_of", "horizon_days", "harvest_date"}
_INPUT_KEYS = {"cost_per_mu", "yield_kg_per_mu"}
_SOURCE_KEYS = {"kind", "text"}


# ---------------------------------------------------------------- 基础校验
def _invalid(message: str) -> None:
    raise ApiError(400, ErrorCode.VALIDATION_ERROR, message)


def _finite(value: Any) -> bool:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return False
    try:
        return float("-inf") < float(value) < float("inf")
    except (OverflowError, ValueError):
        return False


def _iso_date(value: Any) -> bool:
    if not isinstance(value, str) or len(value) != 10:
        return False
    try:
        import datetime as _dt  # noqa: PLC0415
        return _dt.date.fromisoformat(value).isoformat() == value
    except (ValueError, TypeError):
        return False


def validate_final_request(payload: Any) -> Dict[str, Any]:
    """形状与取值校验（不依赖模型能力）。"""
    if not isinstance(payload, dict):
        _invalid("请求体必须是 JSON 对象。")
    if set(payload) - _REQ_KEYS:
        _invalid("种植条件含不支持的字段。")
    if str(payload.get("contract_version")) != _CONTRACT_VERSION:
        _invalid("仅支持 contract_version='1'。")
    ctx = payload.get("user_context")
    if not isinstance(ctx, dict) or set(ctx) != _CTX_KEYS:
        _invalid("种植条件格式不完整。")
    if not isinstance(ctx.get("city_id"), str) or not ctx["city_id"]:
        _invalid("缺少 user_context.city_id。")
    if not _finite(ctx.get("area_mu")) or ctx["area_mu"] <= 0:
        _invalid("面积需要是大于零的有限数字。")
    if not _finite(ctx.get("budget_cny")) or ctx["budget_cny"] <= 0:
        _invalid("预算需要是大于零的有限数字。")
    if str(ctx.get("risk_preference")) not in _VALID_PREFS:
        _invalid("请选择决策偏好（conservative/balanced/aggressive）。")

    source = payload.get("input_source")
    if not isinstance(source, dict) or set(source) - _SOURCE_KEYS:
        _invalid("输入来源格式有误。")
    if source.get("kind") not in ("structured", "natural_language"):
        _invalid("输入来源格式有误。")
    if "text" in source and (not isinstance(source["text"], str) or len(source["text"]) > 4000):
        _invalid("输入原文格式有误。")
    if source["kind"] == "natural_language" and not str(source.get("text", "")).strip():
        _invalid("自然语言输入原文不完整。")

    market = ctx.get("market_context")
    if not isinstance(market, dict) or set(market) != _MARKET_KEYS or not _iso_date(market.get("as_of")):
        _invalid("市场评估日期格式有误。")
    horizon = market.get("horizon_days")
    if not isinstance(horizon, int) or isinstance(horizon, bool) or horizon not in _VALID_HORIZONS:
        _invalid("比较周期需要是 7、14、30、60 或 90 天。")
    if market.get("harvest_date") is not None and not _iso_date(market["harvest_date"]):
        _invalid("气候参照日期格式有误。")

    prefs = ctx.get("crop_preferences")
    if not isinstance(prefs, list) or len(prefs) > _MAX_LIST \
            or any(not isinstance(x, str) or not x.strip() for x in prefs) \
            or len(set(prefs)) != len(prefs):
        _invalid("作物偏好格式有误。")
    actual = ctx.get("actual_inputs")
    if not isinstance(actual, dict) or len(actual) > _MAX_LIST:
        _invalid("实际成本与亩产格式有误。")
    for crop, inputs in actual.items():
        if not isinstance(crop, str) or not crop.strip():
            _invalid("实际投入需要对应作物名称。")
        if not isinstance(inputs, dict) or set(inputs) != _INPUT_KEYS:
            _invalid("实际成本与亩产格式有误。")
        for v in inputs.values():
            if v is not None and (not _finite(v) or v <= 0):
                _invalid("实际成本与亩产需要是大于零的有限数字，缺失请留空。")
    return payload


def _validate_against_capability(ctx: Dict[str, Any], cap: Dict[str, Any]) -> List[str]:
    """依赖模型能力的校验；返回最终选定的作物列表。"""
    preferred = list(ctx.get("crop_preferences") or [])
    actual = ctx.get("actual_inputs") or {}
    if not cap.get("supported"):
        # 城市未登记或无同口径模型：不做作物白名单校验，交由引擎返回 INSUFFICIENT_MARKET_DATA
        return preferred or [None]
    allowed = {c["id"]: c for c in cap["crops"]}
    if any(c not in allowed for c in preferred) or any(c not in allowed for c in actual):
        _invalid("请选择模型支持的规范作物名称。")
    market = ctx["market_context"]
    horizon = market["horizon_days"]
    for crop in (preferred or list(allowed)):
        days = [h["days"] for h in allowed[crop]["horizons"]]
        if horizon not in days:
            _invalid(f"{crop} 不支持 {horizon} 天的比较周期。")
    if cap.get("market_as_of") and market["as_of"] > cap["market_as_of"]:
        _invalid("市场日期不能晚于正式模型的最新数据日期。")
    return preferred or list(allowed)


# ---------------------------------------------------------------- 引擎入参
def _engine_request(city_short: str, crop: Optional[str], ctx: Dict[str, Any],
                    request_id: str) -> Dict[str, Any]:
    market = ctx.get("market_context") or {}
    area = float(ctx.get("area_mu"))
    ai = (ctx.get("actual_inputs") or {}).get(crop) if crop else None
    ai = ai if isinstance(ai, dict) else {}
    cost = ai.get("cost_per_mu")
    yld = ai.get("yield_kg_per_mu")
    req = {
        "request_id": request_id,
        "city": city_short,
        "crop": crop,
        "area_mu": area,
        "budget": ctx.get("budget_cny"),
        "as_of": market.get("as_of"),
        "plant_date": market.get("as_of"),          # 确定性气候月份参照（不用“今天”）
        "horizon_days": market.get("horizon_days"),
        "risk_preference": ctx.get("risk_preference"),
        "actual_cost_per_mu": cost if _finite(cost) else None,
        "actual_yield_per_mu": yld if _finite(yld) else None,
    }
    if market.get("harvest_date") is not None:
        req["harvest_date"] = market["harvest_date"]
    return req


# ---------------------------------------------------------------- 主入口
def evaluate(payload: Any) -> Dict[str, Any]:
    payload = validate_final_request(payload)
    ctx = payload["user_context"]
    city_id = ctx["city_id"]
    if slug_to_short(city_id) is None:
        raise ApiError(422, ErrorCode.UNSUPPORTED_CITY,
                       f"未登记城市：{city_id}（不做跨城 fallback）。", {"city_id": city_id})
    cap = CAPS.capability(city_id)
    crops = _validate_against_capability(ctx, cap)

    request_id = new_request_id()
    engine_requests = [_engine_request(slug_to_short(city_id), c, ctx, f"{request_id}-{i}")
                       for i, c in enumerate(crops)]

    engine = get_engine()
    try:
        if lock_enabled():
            with inference_lock():
                batch = engine.evaluate_many(engine_requests)
        else:
            batch = engine.evaluate_many(engine_requests)
    except ApiError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise ApiError(500, ErrorCode.INFERENCE_ERROR,
                       "Final 推理失败。", {"type": type(exc).__name__, "detail": str(exc)[:300]})

    versions = RS.read_final_versions()
    return {
        "request": payload,
        "batch": batch,
        "market_as_of": ctx["market_context"].get("as_of"),
        "model_version": versions["model_version"],
        "data_version": versions["data_version"],
        "code_fingerprint": versions["code_fingerprint"],
    }


# ---------------------------------------------------------------- 压力情景（Final 原生）
# 与 Final optimize.SHOCKS 一致：仅支持单项压力与两组官方综合压力。
_COMBO_MILD = (-10, -5, 10)
_COMBO_SEVERE = (-20, -15, 20)


def _stress_plan(changes: Dict[str, Any]):
    if changes["delay_days"]:
        return None, None, "正式模型没有上市延迟重估接口，暂不估算这组收益。"
    values = (changes["price_pct"], changes["yield_pct"], changes["cost_pct"])
    if values == _COMBO_MILD:
        return "combo_mild", None, None
    if values == _COMBO_SEVERE:
        return "combo_severe", None, None
    if sum(v != 0 for v in values) <= 1:
        idx = next((i for i, v in enumerate(values) if v != 0), 0)
        kind = ("price", "yield", "cost")[idx]
        return kind, 1 + values[idx] / 100.0, None
    return None, None, "正式模型仅支持单项压力与两组固定综合压力，暂不估算这组组合。"


def stress(payload: Any) -> Dict[str, Any]:
    if not isinstance(payload, dict) or set(payload) != {"request", "candidate_id", "changes"}:
        _invalid("压力条件格式不完整。")
    request = payload["request"]
    ctx = validate_final_request(request)["user_context"]
    city_id = ctx["city_id"]
    if slug_to_short(city_id) is None:
        raise ApiError(422, ErrorCode.UNSUPPORTED_CITY, f"未登记城市：{city_id}。", {"city_id": city_id})
    cap = CAPS.capability(city_id)
    selected = _validate_against_capability(ctx, cap)

    crop = payload["candidate_id"]
    if not isinstance(crop, str) or crop not in selected:
        _invalid("压力方案需要对应当前请求中的规范作物。")

    changes = payload["changes"]
    if not isinstance(changes, dict) or set(changes) != {"price_pct", "yield_pct", "cost_pct", "delay_days"}:
        _invalid("请提供完整的四项压力变化。")
    if not all(_finite(v) for v in changes.values()):
        _invalid("压力变化需要是有限数字。")
    if not (-100 <= changes["price_pct"] <= 0 and -100 <= changes["yield_pct"] <= 0
            and 0 <= changes["cost_pct"] <= 100):
        _invalid("价格与亩产变化需在 -100% 到 0%，成本变化需在 0% 到 100%。")
    if not isinstance(changes["delay_days"], int) or isinstance(changes["delay_days"], bool) \
            or not 0 <= changes["delay_days"] <= 60:
        _invalid("上市延迟需要是 0 到 60 个整天。")

    versions = RS.read_final_versions()
    out: Dict[str, Any] = {
        "candidate_id": crop, "changes": changes, "available": False,
        "profit_base": None, "delta_cny": None, "roi": None, "note": "",
        "model_version": versions["model_version"], "data_version": versions["data_version"],
    }

    kind, factor, reason = _stress_plan(changes)
    if kind is None:
        out["note"] = reason
        return out

    engine = get_engine()
    engine_request = _engine_request(slug_to_short(city_id), crop, ctx, new_request_id())
    try:
        if lock_enabled():
            with inference_lock():
                row = engine.evaluate(engine_request)
        else:
            row = engine.evaluate(engine_request)
    except Exception as exc:  # noqa: BLE001
        raise ApiError(500, ErrorCode.INFERENCE_ERROR,
                       "压力情景推理失败。", {"type": type(exc).__name__, "detail": str(exc)[:300]})

    price = row.get("price") or {}
    profit = row.get("profit") or {}
    if not profit.get("available"):
        out["note"] = "补充实际亩均成本与亩产后，再查看正式收益压力。"
        return out
    source = {
        "price_low": price.get("low"), "price_mid": price.get("mid"), "price_high": price.get("high"),
        "area_mu": row.get("area_mu"), "cost_per_mu": profit.get("cost_per_mu"),
        "expected_yield_per_mu": profit.get("expected_yield_per_mu"),
    }
    if not all(_finite(v) for v in source.values()) or not _finite(profit.get("profit")):
        out["note"] = "正式方案缺少可用的收益核算字段。"
        return out

    from decision_engine.final.optimize import _scenario_profit  # noqa: PLC0415
    stressed = _scenario_profit(source, kind, factor)
    if not _finite(stressed):
        out["note"] = "正式模型暂时无法核算这组压力。"
        return out
    out.update({
        "profit_base": round(float(stressed), 2),
        "delta_cny": round(float(stressed) - float(profit["profit"]), 2),
        "available": True,
        "note": "正式模型参数压力结果；仅返回基准收益，未提供上下行情景与回报率。",
    })
    return out