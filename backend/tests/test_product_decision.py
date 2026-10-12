"""Product contract/routing/selection regressions; no paid network calls in pytest."""
import asyncio
from copy import deepcopy
import hashlib
import json
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import app
from app import runtime_snapshot as RS
from app.product_schemas import ProductDecisionRequest
from app.services import product_decision_service as S, product_llm as LLM


def request(**changes):
    value = dict(contract_version="product-1", city_id="tieling", crop="黄瓜", area_mu=10., budget_cny=10000., target="conservative", sale_date=None, yield_kg_per_mu=2000., cost_per_mu=1000., sale_price_per_kg=3.8, sale_fraction=.9, price_is_user=True, as_of="2026-10-10")
    return ProductDecisionRequest(**{**value, **changes})


@pytest.fixture(autouse=True)
def isolate(monkeypatch):
    monkeypatch.setenv("AGRISCOPE_PRODUCT_LLM_ENABLED", "false")
    S.clear_cache()
    yield
    S.clear_cache()


@pytest.mark.parametrize("changes", [{"crop":"bad!"}, {"area_mu":True}, {"area_mu":float("inf")}, {"budget_cny":-1}, {"sale_date":"2026-02-30"}, {"as_of":"2026-2-01"}, {"sale_fraction":1.1}, {"unexpected":1}])
def test_invalid_request(changes):
    with pytest.raises(ValidationError): request(**changes)


def test_numeric_hash_matches_browser_binary64():
    value = {"a":10.0,"b":.9,"c":0.0}
    canonical = '{"a":{"$number":"4024000000000000"},"b":{"$number":"3feccccccccccccd"},"c":{"$number":"0000000000000000"}}'
    assert S._hash(value) == hashlib.sha256(canonical.encode()).hexdigest()
    assert S._hash({"a":10,"b":.9,"c":-0.}) == S._hash(value)


def test_explicit_price_and_budget_are_immutable():
    req = request(budget_cny=8000., sale_price_per_kg=6.)
    response = S._base(req)
    assert all(row["price_per_kg"] == 6. and row["cost_cny"] <= 8000. for row in response["candidates"])
    assert response["request"]["area_mu"] == 10.
    assert response["candidates"][0]["area_mu"] == 8.
    assert S._base(request(budget_cny=0.))["recommendation"]["candidate_id"] is None


def choice_for(response, candidate="reserve", **changes):
    ids = [row["id"] for row in response["candidates"]]
    ranking = [candidate] + [value for value in ids if value != candidate]
    return {"context_hash":response["context_hash"],"data_version":response["origin"]["data_version"],"candidate_id":candidate,"ranking":ranking,"area_mu":None,"reasons":["保留投入余量，优先控制经营风险。"],**changes}


def test_llm_selection_changes_recommendation_and_recomputes_accounts():
    req = request()
    response = S._base(req); response["context_hash"] = S._hash(req.model_dump()); response["origin"]["data_version"] = "fixture"
    assert response["recommendation"]["candidate_id"] == "plan"
    assert S._apply_llm(req, response, choice_for(response, area_mu=8.))
    assert response["origin"]["llm_used"] is True
    assert response["recommendation"]["candidate_id"] == "reserve"
    selected = next(row for row in response["candidates"] if row["id"] == "reserve")
    assert selected["area_mu"] == 8.
    assert selected["profit_cny"] == 8 * (2000 * .9 * 3.8 - 1000)
    assert response["request"] == req.model_dump()


@pytest.mark.parametrize("changes", [{"context_hash":"old"},{"candidate_id":"unknown"},{"ranking":["plan","plan"]},{"area_mu":11.},{"area_mu":float("nan")},{"profit_cny":999999.},{"reasons":["预计收益提高100元"]}])
def test_illegal_llm_output_cannot_mutate_the_result(changes):
    req = request(); response = S._base(req); response["context_hash"] = S._hash(req.model_dump()); response["origin"]["data_version"] = "fixture"
    before = deepcopy(response)
    assert not S._apply_llm(req, response, choice_for(response, **changes))
    assert response == before


@pytest.mark.parametrize("city,source",[("chaoyang","chaoyang"),("shenyang","shenyang"),("tieling","shenyang"),("jinzhou","shenyang"),("dandong","shenyang"),("dalian","shenyang")])
def test_real_registered_city_routing(city, source):
    RS.bind()
    response = S._build(request(city_id=city))
    assert response["origin"]["source_city"] == source
    assert response["origin"]["target_city"] == city
    assert response["origin"]["forecasts"]
    assert all(row["source_city"] == source for row in response["origin"]["forecasts"])
    assert "hri" not in response["origin"]


def test_uncovered_crop_keeps_the_schema_without_using_another_crop_model():
    RS.bind()
    response = S._build(request(city_id="dalian",crop="玉米"))
    assert response["origin"]["route"] == "formula"
    assert response["origin"]["forecasts"] == []
    assert response["candidates"][0]["crop"] == "玉米"


def test_arbitrary_sale_date_is_not_short_model_harvest_prediction():
    RS.bind()
    response = S._build(request(city_id="chaoyang", sale_date="2026-09-28", price_is_user=False, as_of="2026-09-21"))
    assert response["origin"]["route"] == "local_model"
    assert response["candidates"][0]["horizon_days"] is None
    assert response["candidates"][0]["sales_window"] == {"start":"2026-09-28","end":"2026-09-28"}
    assert response["candidates"][0]["price_per_kg"] == 3.8


def test_inflight_sharing_abort_cache_and_invalid_json_fallback(monkeypatch):
    monkeypatch.setattr(RS,"read_final_versions",lambda:{"model_version":"fixture"})
    monkeypatch.setattr(RS,"state",lambda:{"runtime_data_version":"fixture"})
    monkeypatch.setattr(S.LONG,"capabilities",lambda city:{})
    monkeypatch.setattr(S,"_build",lambda req:S._base(req))
    calls=[]
    async def select(packet):
        calls.append(packet); await asyncio.sleep(.05)
        return {"unexpected":"invalid"}
    monkeypatch.setattr(LLM,"select",select)
    async def run():
        first=asyncio.create_task(S.evaluate(request())); second=asyncio.create_task(S.evaluate(request()))
        await asyncio.sleep(.01); first.cancel()
        with pytest.raises(asyncio.CancelledError): await first
        result=await second
        assert result["origin"]["llm_used"] is False
        assert result["origin"]["llm_status"] == "rejected"
        assert len(calls)==1
        assert await S.evaluate(request()) == result
        assert len(calls)==1
        different=asyncio.create_task(S.evaluate(request(area_mu=9.)))
        await asyncio.sleep(.01); different.cancel()
        with pytest.raises(asyncio.CancelledError): await different
        await asyncio.sleep(0)
        assert not S._inflight
    asyncio.run(run())


def test_llm_timeout_returns_valid_accounts(monkeypatch):
    monkeypatch.setattr(RS,"read_final_versions",lambda:{"model_version":"fixture"})
    monkeypatch.setattr(RS,"state",lambda:{})
    monkeypatch.setattr(S.LONG,"capabilities",lambda city:{})
    monkeypatch.setattr(S,"_build",lambda req:S._base(req))
    monkeypatch.setattr(S,"LLM_TIMEOUT",.01)
    async def delayed(packet): await asyncio.sleep(1)
    monkeypatch.setattr(LLM,"select",delayed)
    result=asyncio.run(S.evaluate(request()))
    assert result["origin"]["llm_status"] == "unavailable"
    assert result["recommendation"]["candidate_id"] == "plan"


def test_http_product_endpoint_and_frozen_contract_remain_separate():
    from fastapi.testclient import TestClient
    with TestClient(app) as client:
        response=client.post("/api/product/decision",json=request(crop="玉米").model_dump())
        assert response.status_code==200, response.text
        assert response.json()["contract_version"]=="product-1"
        assert response.json()["request"]["city_id"]=="tieling"
        assert client.post("/api/decision/evaluate",json=request().model_dump()).status_code==400
        assert client.post("/api/product/decision",json={**request().model_dump(),"area_mu":False}).status_code==400


def test_overlapping_long_ranges_keep_discrete_windows_instead_of_one_best_date():
    RS.bind()
    req=request(city_id="shenyang",price_is_user=False)
    response=S._build(req)
    original=deepcopy(response["origin"]["forecasts"])
    S._window_comparison(response)
    choices=response["origin"]["window_choices"]
    assert len(choices)==6
    assert choices == sorted([row["window"] for row in original],key=lambda row:row["start"])
    assert response["origin"]["forecasts"] == original
    assert response["origin"]["window_basis"] == "overlapping_price_ranges"


def test_llm_cannot_turn_historical_climate_into_a_current_weather_claim():
    req=request();response=S._base(req);response["context_hash"]=S._hash(req.model_dump());response["origin"]["data_version"]="fixture"
    assert not S._apply_llm(req,response,choice_for(response,reasons=["气候条件正常，没有气象风险。"] ))


def test_absence_from_annual_categories_does_not_prove_a_crop_is_unsuitable():
    req=request();response=S._base(req);response["context_hash"]=S._hash(req.model_dump());response["origin"]["data_version"]="fixture"
    assert not S._apply_llm(req,response,choice_for(response,reasons=["黄瓜在当地非主导作物，不适合扩大种植。"] ))


def test_valid_selection_keeps_operating_reasons_and_omits_unsupported_background_claims():
    req=request();response=S._base(req);response["context_hash"]=S._hash(req.model_dump());response["origin"]["data_version"]="fixture"
    assert S._apply_llm(req,response,choice_for(response,reasons=["保留经营余量。","本地年度生产未列黄瓜，不宜扩大投入。"] ))
    assert response["recommendation"]["candidate_id"] == "reserve"
    assert response["recommendation"]["reasons"] == ["保留经营余量。"]
