# -*- coding: utf-8 -*-
"""E2E：后端 HTTP 契约（FastAPI TestClient 覆盖 16 项用例）。"""
from __future__ import annotations

import concurrent.futures
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.main import app  # noqa: E402

FINAL_STATUSES = {"OK", "LOW_CONFIDENCE", "PARTIAL", "SCENARIO_ONLY", "USER_INPUT_REQUIRED",
                  "INSUFFICIENT_MARKET_DATA", "NO_FEASIBLE_PLAN", "NO_FEASIBLE_WINDOW",
                  "NO_CLEAR_WINNER", "NO_DIVERSIFICATION_BENEFIT", "MODEL_ERROR", "MODEL_UNAVAILABLE"}


def request_body(city="shenyang", crops=None, horizon=30, actual=None, as_of="2026-09-14"):
    return {
        "contract_version": "1",
        "user_context": {
            "city_id": city, "area_mu": 60, "budget_cny": 300000,
            "risk_preference": "balanced",
            "crop_preferences": crops if crops is not None else ["西红柿"],
            "actual_inputs": actual or {},
            "market_context": {"as_of": as_of, "horizon_days": horizon, "harvest_date": None},
        },
        "input_source": {"kind": "structured"},
    }


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# ---- 1
def test_health_liveness(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


# ---- 2
def test_health_ready_real_checks(client):
    r = client.get("/health/ready")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ready"
    assert body["detail"]["runtime_snapshot"]["ok"] is True


# ---- 3
def test_meta_exposes_version_matrix(client):
    body = client.get("/api/meta").json()
    assert body["final_model"]["model_version"] == "final_v1"
    assert body["final_model"]["code_fingerprint"]
    assert body["runtime"]["runtime_data_status"] in ("LIVE", "FROZEN_FALLBACK")
    assert body["daily"]["schema_version"] == "1.1.0"


# ---- 4
def test_capability_shenyang(client):
    v = client.get("/api/decision/capabilities", params={"city": "shenyang"}).json()
    assert v["city_id"] == "shenyang" and v["supported"] is True
    assert v["tier"] == "FULL" and len(v["crops"]) == 10
    assert v["market_as_of"]
    for c in v["crops"]:
        assert c["label"] == c["id"]
        assert all(h["days"] in (7, 14, 30, 60, 90) for h in c["horizons"])
        assert {h["mode"] for h in c["horizons"]} <= {"model", "scenario_only"}


# ---- 5
def test_capability_alias(client):
    a = client.get("/api/decision/capabilities", params={"city": "chaoyang"}).json()
    b = client.get("/api/capabilities", params={"city": "chaoyang"}).json()
    assert a == b and a["city_id"] == "chaoyang"


# ---- 6
def test_capability_unsupported_city(client):
    v = client.get("/api/decision/capabilities", params={"city": "dalian"}).json()
    assert v["supported"] is False and v["crops"] == [] and v["market_as_of"] is None
    assert v["tier"] == "INSUFFICIENT_MARKET_DATA"


# ---- 7
def test_evaluate_echoes_request_and_as_of(client):
    body = request_body()
    r = client.post("/api/decision/evaluate", json=body)
    assert r.status_code == 200
    env = r.json()
    assert env["request"] == body                                   # 原样回显
    assert env["market_as_of"] == body["user_context"]["market_context"]["as_of"]
    assert env["model_version"] == "final_v1"
    assert env["code_fingerprint"]
    assert env["batch"]["status"] in FINAL_STATUSES


# ---- 8
def test_evaluate_default_endpoint_alias(client):
    body = request_body()
    assert client.post("/api/decision", json=body).status_code == 200
    assert client.post("/api/decision/rank", json=body).status_code == 200


# ---- 9
def test_evaluate_status_enum_and_row_shape(client):
    body = request_body(crops=["西红柿"], actual={"西红柿": {"cost_per_mu": 2000, "yield_kg_per_mu": 5000}})
    env = client.post("/api/decision/evaluate", json=body).json()
    rows = env["batch"]["all"]
    assert rows and all(r["status"] in FINAL_STATUSES for r in rows)
    row = rows[0]
    assert row["city"] == "沈阳" and row["crop"] == "西红柿"
    assert row["area_mu"] == 60 and row["horizon_days"] == 30
    assert row["price"]["unit"] == "CNY/kg"
    assert set(row["hri"]) >= {"available", "value"}
    assert set(row["market_risk"]) >= {"available", "value"}


# ---- 10
def test_evaluate_horizon_90_scenario_only(client):
    body = request_body(crops=["西红柿"], horizon=90,
                        actual={"西红柿": {"cost_per_mu": 2000, "yield_kg_per_mu": 5000}})
    env = client.post("/api/decision/evaluate", json=body).json()
    assert all(r["price"]["scenario_only"] is True for r in env["batch"]["all"] if r["price"])


# ---- 11
def test_evaluate_insufficient_city_no_fallback(client):
    body = request_body(city="dalian", crops=["西红柿"])
    env = client.post("/api/decision/evaluate", json=body).json()
    statuses = {r["status"] for r in env["batch"]["all"]}
    assert statuses == {"INSUFFICIENT_MARKET_DATA"}
    assert all(r["price"] is None for r in env["batch"]["all"])


# ---- 12
def test_evaluate_user_input_required_without_inputs(client):
    body = request_body(crops=["西红柿"])  # 无实际成本/亩产
    env = client.post("/api/decision/evaluate", json=body).json()
    assert env["batch"]["all"][0]["status"] in ("USER_INPUT_REQUIRED", "PARTIAL")
    assert env["batch"]["all"][0]["profit"]["available"] is False


# ---- 13
def test_stress_available_and_unavailable(client):
    body = request_body(crops=["西红柿"], actual={"西红柿": {"cost_per_mu": 2000, "yield_kg_per_mu": 5000}})
    changes = {"price_pct": -20, "yield_pct": 0, "cost_pct": 0, "delay_days": 0}
    s = client.post("/api/decision/stress",
                    json={"request": body, "candidate_id": "西红柿", "changes": changes})
    assert s.status_code == 200
    j = s.json()
    assert j["candidate_id"] == "西红柿" and j["changes"] == changes and j["available"] is True
    assert isinstance(j["profit_base"], (int, float)) and isinstance(j["delta_cny"], (int, float))
    assert j["delta_cny"] < 0                       # 价格 -20% → 收益下降
    assert j["roi"] is None                         # Final 原生压力只返回基准收益，不返回 ROI

    body2 = request_body(crops=["西红柿"])  # 没有成本/亩产
    s2 = client.post("/api/decision/stress",
                     json={"request": body2, "candidate_id": "西红柿", "changes": changes}).json()
    assert s2["available"] is False
    assert s2["profit_base"] is None and s2["delta_cny"] is None and s2["roi"] is None


# ---- 13b
def test_stress_unsupported_combinations_are_honest(client):
    body = request_body(crops=["西红柿"], actual={"西红柿": {"cost_per_mu": 2000, "yield_kg_per_mu": 5000}})
    base = {"request": body, "candidate_id": "西红柿"}
    # 上市延迟：Final 无重估接口 → 不可用且不得携带收益
    d = client.post("/api/decision/stress", json={
        **base, "changes": {"price_pct": 0, "yield_pct": 0, "cost_pct": 0, "delay_days": 7}}).json()
    assert d["available"] is False and d["profit_base"] is None and d["roi"] is None
    # 非官方组合 → 不可用
    c = client.post("/api/decision/stress", json={
        **base, "changes": {"price_pct": -10, "yield_pct": -10, "cost_pct": 0, "delay_days": 0}}).json()
    assert c["available"] is False
    # 官方综合压力 → 可用
    ok = client.post("/api/decision/stress", json={
        **base, "changes": {"price_pct": -20, "yield_pct": -15, "cost_pct": 20, "delay_days": 0}})
    assert ok.status_code == 200 and ok.json()["available"] is True


# ---- 13c
def test_stress_rejects_mismatched_candidate(client):
    body = request_body(crops=["西红柿"])
    r = client.post("/api/decision/stress", json={
        "request": body, "candidate_id": "黄瓜",
        "changes": {"price_pct": -10, "yield_pct": 0, "cost_pct": 0, "delay_days": 0}})
    assert r.status_code == 400 and r.json()["error_code"] == "VALIDATION_ERROR"


# ---- 14
def test_stress_rejects_invalid_changes(client):
    body = request_body()
    bad = {"price_pct": 10, "yield_pct": 0, "cost_pct": 0, "delay_days": 0}
    r = client.post("/api/decision/stress",
                    json={"request": body, "candidate_id": "西红柿", "changes": bad})
    assert r.status_code == 400 and r.json()["error_code"] == "VALIDATION_ERROR"


# ---- 15
def test_daily_latest_and_city_scope(client):
    r = client.get("/api/daily/latest", params={"city": "shenyang"})
    assert r.status_code == 200
    raw = r.json()
    assert raw["schema_version"] == "1.1.0" and raw["city"] == "沈阳"
    assert raw["recommendation"] is None
    bad = client.get("/api/daily/latest", params={"city": "dalian"})
    assert bad.status_code == 404 and bad.json()["error_code"] == "NOT_FOUND"


# ---- 16
def test_error_contract_and_request_id(client):
    r = client.post("/api/decision/evaluate", json={"contract_version": "2"})
    assert r.status_code == 400
    body = r.json()
    assert body["error_code"] == "VALIDATION_ERROR"
    assert isinstance(body["request_id"], str) and body["request_id"]
    assert "details" in body
    assert r.headers.get("x-request-id") == body["request_id"]


# ---- 17 严格校验（对齐桥接实现的更严谨部分）
def test_strict_validation_rejects_extra_fields(client):
    body = request_body()
    body["user_context"]["unexpected"] = 1
    r = client.post("/api/decision/evaluate", json=body)
    assert r.status_code == 400 and r.json()["error_code"] == "VALIDATION_ERROR"


# ---- 18
def test_strict_validation_rejects_unknown_crop(client):
    body = request_body(crops=["不存在的作物"])
    r = client.post("/api/decision/evaluate", json=body)
    assert r.status_code == 400 and r.json()["error_code"] == "VALIDATION_ERROR"


# ---- 19
def test_strict_validation_rejects_future_as_of(client):
    cap = client.get("/api/decision/capabilities", params={"city": "shenyang"}).json()
    assert cap["market_as_of"]
    body = request_body(as_of="2099-01-01")
    r = client.post("/api/decision/evaluate", json=body)
    assert r.status_code == 400 and r.json()["error_code"] == "VALIDATION_ERROR"


# ---- 20
def test_request_body_size_limit(client):
    body = request_body()
    body["input_source"] = {"kind": "natural_language", "text": "x" * (70 * 1024)}
    r = client.post("/api/decision/evaluate", json=body)
    assert r.status_code == 413


# ---- 21
def test_no_nan_or_infinity_in_payload(client):
    body = request_body(crops=["西红柿", "黄瓜"], horizon=90)
    env = client.post("/api/decision/evaluate", json=body).json()
    raw = client.post("/api/decision/evaluate", json=body).text
    for token in ("NaN", "Infinity", "-Infinity"):
        assert token not in raw, f"响应体含非有限浮点 {token}"
    assert isinstance(env["batch"]["all"], list)


# ---- 并发：10 并发 evaluate 结果不串
def test_concurrent_evaluate_isolation(client):
    crops = ["西红柿", "黄瓜", "韭菜", "茄子", "青椒", "尖椒", "芹菜", "芸豆", "甘蓝", "土豆"]
    actual = {c: {"cost_per_mu": 2000 + i * 10, "yield_kg_per_mu": 5000 + i * 10}
              for i, c in enumerate(crops)}
    bodies = [request_body(crops=[c], actual={c: actual[c]}) for c in crops]

    def call(b):
        env = client.post("/api/decision/evaluate", json=b).json()
        return env["request"]["user_context"]["crop_preferences"][0], env["batch"]["all"][0]

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        results = list(ex.map(call, bodies))

    for crop, row in results:
        assert row["crop"] == crop, f"串了：期望 {crop} 得到 {row['crop']}"
        assert row["area_mu"] == 60