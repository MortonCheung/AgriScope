"""City model routing + deterministic accounts + constrained online selection.

No frozen model/global snapshot mutation. All inputs come from published runtime.
"""
import asyncio
from collections import OrderedDict
from copy import deepcopy
from datetime import date, timedelta
import hashlib
import json
import math
import re
import threading
import struct
import time

from ..errors import ApiError, ErrorCode
from ..product_schemas import ProductDecisionRequest, ProductDecisionResponse
from .. import runtime_snapshot as RS
from . import capability_service as CAPS, final_model_service as FINAL
from . import observation_service as OBS, long_horizon_service as LONG, product_llm as LLM

POLICY = "product-city-plan-v1"
CACHE_TTL = 120.0
MAX_CACHE = 64
MAX_INFLIGHT = 16
MODEL_TIMEOUT = 8.0
LLM_TIMEOUT = 12.5
_cache = OrderedDict()
_inflight = {}
_waiters = {}
_forecast_cache = OrderedDict()
_forecast_lock = threading.Lock()


def _canonical(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return {"$number": struct.pack(">d", float(value) if value else 0.0).hex()}
    if isinstance(value, dict):
        return {key: _canonical(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_canonical(item) for item in value]
    return value


def _hash(value):
    return hashlib.sha256(json.dumps(_canonical(value), ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def _finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _crop(value):
    return {"马铃薯": "土豆", "番茄": "西红柿"}.get(value, value)


def _cap(city):
    try:
        return CAPS.capability(city)
    except Exception:
        return {"supported": False, "crops": []}


def _model_date(requested, available):
    # The request remains unchanged; an unavailable future cutoff is never invented.
    return min(requested, available) if requested else available


def _short_forecast(request, crop, horizon, local_only=False):
    for city in ([request.city_id] if local_only else dict.fromkeys([request.city_id, "shenyang"])):
        cap = _cap(city)
        supported = next((item for item in cap.get("crops", []) if _crop(item["id"]) == crop and any(h["days"] == horizon and h["mode"] == "model" for h in item["horizons"])), None)
        if not cap.get("supported") or not supported or not cap.get("market_as_of"):
            continue
        as_of = _model_date(request.as_of, cap["market_as_of"])
        key = (city, supported["id"], horizon, as_of, cap.get("model_version"), cap.get("data_version"), cap.get("code_fingerprint"))
        with _forecast_lock:
            if key in _forecast_cache:
                return deepcopy(_forecast_cache[key])
        payload = {"contract_version": "1", "user_context": {"city_id": city, "area_mu": 1.0, "budget_cny": 1000000.0, "risk_preference": "balanced", "crop_preferences": [supported["id"]], "actual_inputs": {}, "market_context": {"as_of": as_of, "horizon_days": horizon, "harvest_date": None}}, "input_source": {"kind": "structured"}}
        try:
            envelope = FINAL.evaluate(payload)
            row = next((row for row in envelope["batch"]["all"] if _crop(row.get("crop")) == crop), None)
            price = row.get("price") if row else None
            if not isinstance(price, dict) or not _finite(price.get("mid")) or price["mid"] <= 0:
                continue
            result = {"source_city": city, "model_as_of": as_of, "horizon_days": horizon,
                      "price_per_kg": price["mid"], "price_low": price.get("low") if _finite(price.get("low")) else None,
                      "price_high": price.get("high") if _finite(price.get("high")) else None,
                      "price_level": price.get("price_level"), "method": price.get("method"),
                      "model_id": f"{envelope['model_version']}:{city}:{supported['id']}:{horizon}",
                      "target_type": "next_window_market_average", "window": None}
            with _forecast_lock:
                _forecast_cache[key] = deepcopy(result)
                while len(_forecast_cache) > 128:
                    _forecast_cache.popitem(last=False)
            return result
        except Exception:
            continue
    return None


def _long_forecasts(request, crop):
    # Long-horizon registry currently covers Shenyang only, separately from Final.
    try:
        cap = LONG.capabilities(request.city_id)
        source = request.city_id
        if not cap.get("supported") or not any(_crop(item["id"]) == crop for item in cap.get("crops", [])):
            cap, source = LONG.capabilities("shenyang"), "shenyang"
        if not cap.get("supported") or not any(_crop(item["id"]) == crop for item in cap.get("crops", [])):
            return []
        # A historical request must not receive a future precomputed snapshot.
        if request.as_of and cap.get("as_of") and request.as_of < cap["as_of"]:
            return []
        rows = []
        for horizon in cap.get("horizons", [])[:6]:
            raw = LONG.forecast({"contract_version": "2", "city_id": source, "crop": crop, "horizon_days": horizon, "target_type": "harvest_market_price"})
            target = raw.get("targets", {}).get("harvest_market_price", {})
            point = target.get("point_forecast")
            if not target.get("available") or not _finite(point) or point <= 0:
                continue
            window = target.get("target_window", {})
            anchor = date.fromisoformat(raw["as_of"])
            start, end = window.get("start_offset"), window.get("end_offset_exclusive")
            period = {"start": str(anchor + timedelta(days=start)), "end": str(anchor + timedelta(days=end - 1))} if type(start) is int and type(end) is int and end > start else None
            rows.append({"source_city": source, "model_as_of": raw["as_of"], "horizon_days": horizon,
                         "price_per_kg": point, "price_low": target.get("range_low"), "price_high": target.get("range_high"),
                         "price_level": "wholesale", "method": target.get("actual_method", target.get("method")),
                         "model_id": f"{raw['model_version']}:{source}:{crop}:{horizon}",
                         "target_type": "harvest_market_price", "window": period})
        return rows
    except Exception:
        return []


def _local_facts(city, as_of):
    try:
        data = OBS.city_observation(city)
        production = data["production"]
        climate = data["climate"]
        cutoff_year = date.fromisoformat(as_of).year if as_of else date.today().year
        years = [row for row in climate["series"] if row["year"] < cutoff_year]
        latest = years[-1] if years else None
        production_safe = production.get("latest_year") is not None and production["latest_year"] < cutoff_year
        return {"city_id": city, "production_year": production.get("latest_year") if production_safe else None,
                "production": [{"crop": row["crop"], "area_ha": row["area_ha"]} for row in production.get("items", [])[:12]] if production_safe else [],
                "climate_complete_year": latest["year"] if latest else None,
                "historical_climate": latest, "climate_kind": "historical_reanalysis", "production_kind": "annual_area_not_yield"}
    except Exception:
        return {"city_id": city, "production": [], "historical_climate": None}


def _accounts(request, candidate_id, area, price, horizon=None, window=None):
    revenue = area * request.yield_kg_per_mu * request.sale_fraction * price
    cost = area * request.cost_per_mu
    profit = revenue - cost
    adverse = [revenue * .8 - cost, revenue - cost * 1.2]
    if not all(math.isfinite(value) for value in [revenue, cost, profit, *adverse]):
        raise ApiError(400, ErrorCode.VALIDATION_ERROR, "数值过大，请缩小输入范围。")
    risk = "高" if profit <= 0 else "中等" if min(adverse) < 0 else "低"
    reason = "当前收入未覆盖投入，优先控制成本。" if profit <= 0 else "价格或成本变化可能影响盈亏，保留经营余量。" if risk == "中等" else "当前投入与经营条件能够覆盖单项不利变化。"
    denominator = request.yield_kg_per_mu * request.sale_fraction
    return {"id": candidate_id, "crop": _crop(request.crop), "area_mu": area, "price_per_kg": price,
            "horizon_days": horizon, "sales_window": window,
            "revenue_cny": round(revenue, 2), "cost_cny": round(cost, 2), "profit_cny": round(profit, 2),
            "break_even_price": request.cost_per_mu / denominator if denominator > 0 else None,
            "risk": risk, "reasons": [reason]}


def _base(request, forecasts=None, facts=None):
    forecasts = forecasts or []
    facts = facts or {"city_id": request.city_id, "production": [], "historical_climate": None}
    area = request.area_mu
    if request.budget_cny is not None and request.cost_per_mu > 0:
        area = min(area, request.budget_cny / request.cost_per_mu)
    candidates = []
    sale_window = {"start": request.sale_date, "end": request.sale_date} if request.sale_date else None
    if area > 0:
        if request.price_is_user or not forecasts:
            candidates.append(_accounts(request, "plan", area, request.sale_price_per_kg, window=sale_window))
        else:
            for index, forecast in enumerate(forecasts):
                if not forecast.get("account_eligible", True):
                    continue
                # A short next-N-day mean is not a harvest-day forecast.
                window = forecast["window"] if not request.sale_date else sale_window
                if request.sale_date and forecast["window"] and not (forecast["window"]["start"] <= request.sale_date <= forecast["window"]["end"]):
                    continue
                candidates.append(_accounts(request, f"forecast-{index}", area, forecast["price_per_kg"], forecast["horizon_days"], window))
            if not candidates:
                candidates.append(_accounts(request, "plan", area, request.sale_price_per_kg, window=sale_window))
        if request.budget_cny is not None and request.cost_per_mu > 0:
            # Existing +20% cost sensitivity defines this reserve, no city price coefficient.
            reserve = min(request.area_mu, request.budget_cny / (request.cost_per_mu * 1.2))
            if reserve > 0 and reserve < area - 1e-9:
                candidates.append(_accounts(request, "reserve", reserve, candidates[0]["price_per_kg"], candidates[0]["horizon_days"], candidates[0]["sales_window"]))
    def score(row):
        return row["revenue_cny"] * .8 - row["cost_cny"] if request.target == "conservative" else row["profit_cny"]
    ranking = sorted(candidates, key=lambda row: (-score(row), row["id"]))
    source = forecasts[0]["source_city"] if forecasts else None
    route = "local_model" if source == request.city_id else "shenyang_reference" if source else "formula"
    return {"contract_version": "product-1", "request": request.model_dump(), "context_hash": "",
            "candidates": candidates, "recommendation": {"candidate_id": ranking[0]["id"] if ranking else None,
                "reasons": ranking[0]["reasons"] if ranking else ["当前预算无法覆盖生产投入，请调整面积或预算。"]},
            "origin": {"source_city": source, "target_city": request.city_id, "route": route,
                "model_id": forecasts[0]["model_id"] if forecasts else None, "forecasts": forecasts,
                "transfer_policy": "target_conditions_on_shenyang_reference" if route == "shenyang_reference" else None,
                "policy_version": POLICY, "local_constraints": facts, "price_is_user": request.price_is_user,
                "risk_basis": "budget_and_operating_sensitivity", "window_kind": "user_plan" if request.sale_date else "published_harvest_window" if any(row["window"] for row in forecasts) else "not_selected",
                "llm_used": False, "llm_status": "not_applied", "ranking": [row["id"] for row in ranking]}}


def _build(request):
    crop = _crop(request.crop)
    cap = _cap(request.city_id)
    anchor = cap.get("market_as_of") or _cap("shenyang").get("market_as_of")
    delta = (date.fromisoformat(request.sale_date) - date.fromisoformat(_model_date(request.as_of, anchor))).days if request.sale_date and anchor else None
    # A requested long harvest window can use a Shenyang reference when that
    # exact local target is absent. An unspecified horizon first uses local
    # short models, rather than silently skipping Chaoyang's registered models.
    if delta is not None and delta > 30:
        forecasts = _long_forecasts(request, crop)
    else:
        forecasts = [value for horizon in (7, 14, 30) if (value := _short_forecast(request, crop, horizon, local_only=True))]
        if request.city_id == "shenyang" and delta is None:
            forecasts = _long_forecasts(request, crop) or forecasts
        if not forecasts:
            forecasts = _long_forecasts(request, crop) if delta is None else []
        if not forecasts:
            forecasts = [value for horizon in (7, 14, 30) if (value := _short_forecast(request, crop, horizon))]
    # Short next-window averages are contextual comparisons, never a forecast
    # for an arbitrary sale date. Preserve that date and its explicit account.
    if request.sale_date:
        for forecast in forecasts:
            forecast["account_eligible"] = forecast["target_type"] == "harvest_market_price" and forecast["window"] is not None and forecast["window"]["start"] <= request.sale_date <= forecast["window"]["end"]
    return _base(request, forecasts, _local_facts(request.city_id, request.as_of))


def _packet(response):
    return {"context_hash": response["context_hash"], "data_version": response["origin"]["data_version"], "user": response["request"],
            "local_facts": response["origin"]["local_constraints"],
            "model_reference": response["origin"]["forecasts"],
            "candidates": [{**row, "allowed_area_max": row["area_mu"]} for row in response["candidates"]],
            "constraints": {"no_new_candidates": True, "no_amount_generation": True, "fixed_user_conditions": True}}


def _apply_llm(request, response, choice):
    required = {"context_hash", "data_version", "candidate_id", "ranking", "area_mu", "reasons"}
    if not isinstance(choice, dict) or set(choice) != required or choice["context_hash"] != response["context_hash"] or choice["data_version"] != response["origin"]["data_version"]:
        return False
    ids = [row["id"] for row in response["candidates"]]
    ranking = choice["ranking"]
    if not isinstance(ranking, list) or len(ranking) != len(ids) or not all(isinstance(value, str) for value in ranking) or set(ranking) != set(ids) or not ranking or choice["candidate_id"] != ranking[0]:
        return False
    selected = next((row for row in response["candidates"] if row["id"] == choice["candidate_id"]), None)
    if selected is None:
        return False
    reasons = choice["reasons"]
    if not isinstance(reasons, list) or not 1 <= len(reasons) <= 3 or any(not isinstance(reason, str) or not 1 <= len(reason) <= 180 or re.search(r"\d|模拟|演示|Final|冻结|训练|快照|API|密钥|气候.*正常|气象.*正常|天气.*正常|条件正常|未显示.*不利|稳赚|保证收益", reason) for reason in reasons):
        return False
    area = choice["area_mu"]
    if area is not None:
        if not _finite(area) or not 0 < area <= selected["area_mu"]:
            return False
        if request.budget_cny is not None and area * request.cost_per_mu > request.budget_cny + 1e-8:
            return False
        updated = _accounts(request, selected["id"], area, selected["price_per_kg"], selected["horizon_days"], selected["sales_window"])
        selected.update(updated)
    selected["reasons"] = reasons
    response["recommendation"] = {"candidate_id": selected["id"], "reasons": reasons}
    response["origin"].update(llm_used=True, llm_status="applied", ranking=ranking)
    return True


def _window_comparison(response):
    selected = next((row for row in response["candidates"] if row["id"] == response["recommendation"]["candidate_id"]), None)
    choices = []
    forecasts = response["origin"]["forecasts"]
    if selected and selected["horizon_days"] is not None and not response["request"]["sale_date"]:
        current = next((row for row in forecasts if row["horizon_days"] == selected["horizon_days"] and row["price_per_kg"] == selected["price_per_kg"] and row["window"]), None)
        if current:
            # Keep discrete evaluated windows. Overlapping price ranges cannot
            # justify one unique best date, or fill unevaluated gaps between dates.
            group = [current]
            remaining = [row for row in forecasts if row is not current and row["window"] and row["target_type"] == current["target_type"] and row["model_as_of"] == current["model_as_of"]]
            changed = True
            while changed:
                changed = False
                for row in remaining[:]:
                    if any(not all(_finite(v) for v in [row["price_low"], row["price_high"], other["price_low"], other["price_high"]]) or max(row["price_low"], other["price_low"]) <= min(row["price_high"], other["price_high"]) for other in group):
                        group.append(row); remaining.remove(row); changed = True
            choices = sorted([row["window"] for row in group], key=lambda value: value["start"])
    response["origin"]["window_choices"] = choices
    response["origin"]["window_basis"] = "overlapping_price_ranges" if len(choices) > 1 else "evaluated_window" if choices else "user_plan" if response["request"]["sale_date"] else "not_selected"


async def _compute(request, cache_key, context_hash, versions):
    try:
        response = await asyncio.wait_for(asyncio.to_thread(_build, request), MODEL_TIMEOUT)
    except asyncio.TimeoutError:
        response = _base(request)
        response["origin"]["model_status"] = "deadline"
    response["context_hash"] = context_hash
    response["origin"]["data_version"] = _hash({"versions": versions, "forecasts": response["origin"]["forecasts"], "policy": POLICY})
    if response["candidates"]:
        try:
            choice = await asyncio.wait_for(LLM.select(_packet(response)), LLM_TIMEOUT)
        except (asyncio.TimeoutError, Exception):
            choice = None
            response["origin"]["llm_status"] = "unavailable"
        if isinstance(choice, dict) and choice.get("_failure") in {"http_error", "incomplete", "refused", "invalid_json", "unavailable"}:
            response["origin"]["llm_status"] = choice["_failure"]
        elif choice is not None and not _apply_llm(request, response, choice):
            response["origin"]["llm_status"] = "rejected"
    _window_comparison(response)
    response = ProductDecisionResponse.model_validate(response).model_dump()
    _cache[cache_key] = (time.monotonic(), deepcopy(response))
    _cache.move_to_end(cache_key)
    while len(_cache) > MAX_CACHE:
        _cache.popitem(last=False)
    return response


async def evaluate(request):
    versions = {**RS.read_final_versions(), "long_snapshot": LONG.capabilities("shenyang").get("snapshot_hash")}
    context_hash = _hash(request.model_dump())
    cache_key = _hash({"request": request.model_dump(), "policy": POLICY, "models": versions,
                          "runtime": RS.state().get("runtime_data_version"), "llm": LLM.identity()})
    cached = _cache.get(cache_key)
    if cached and time.monotonic() - cached[0] < CACHE_TTL:
        return deepcopy(cached[1])
    task = _inflight.get(cache_key)
    if task is None:
        if len(_inflight) >= MAX_INFLIGHT:
            raise ApiError(429, ErrorCode.INFERENCE_ERROR, "当前请求较多，请稍后再试。")
        task = asyncio.create_task(_compute(request, cache_key, context_hash, versions))
        _inflight[cache_key] = task
        task.add_done_callback(lambda finished: _inflight.pop(cache_key, None) if _inflight.get(cache_key) is finished else None)
    _waiters[cache_key] = _waiters.get(cache_key, 0) + 1
    try:
        return deepcopy(await asyncio.shield(task))
    finally:
        _waiters[cache_key] -= 1
        if _waiters[cache_key] == 0:
            _waiters.pop(cache_key, None)
            if not task.done():
                if _inflight.get(cache_key) is task:
                    _inflight.pop(cache_key, None)
                task.cancel()


def clear_cache():
    """Tests/process shutdown; does not change frozen engine data or model caches."""
    for task in list(_inflight.values()):
        task.cancel()
    _inflight.clear()
    _cache.clear()
    with _forecast_lock:
        _forecast_cache.clear()
