"""六城 V4 合同：真实发布资产、统计范围、功能独立门禁与缺失语义。"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.main import app
from app.schemas import CityObservationResponse, DecisionFeaturesModel, DecisionFeatureModel
from app.services import observation_service as O


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as value:
        yield value


@pytest.mark.parametrize("city,year,maize_ha,short_supported", [
    ("shenyang", 2024, 408901, True), ("chaoyang", 2024, 370600, True),
    ("jinzhou", 2023, 317500, False), ("tieling", 2024, 445800, False),
    ("dandong", 2022, 118900, False), ("dalian", 2024, 191800, False),
])
def test_six_city_business_contract(client, city, year, maize_ha, short_supported):
    response = client.get("/api/observations", params={"city": city})
    assert response.status_code == 200
    body = response.json()
    CityObservationResponse.model_validate(body)
    assert body["scope"] == "city" and body["city_id"] == city
    production, climate = body["production"], body["climate"]
    assert production["available"] is True and production["latest_year"] == year
    assert production["unit"] == "ha"
    assert next(item for item in production["items"] if item["crop"] == "玉米")["area_ha"] == maize_ha
    assert climate["complete_year"] == 2025
    assert [row["year"] for row in climate["series"]] == list(range(2010, 2026))
    assert any("再分析" in text for text in climate["limitations"])
    assert all(not path.startswith(("/", "../")) for path in production["source_paths"] + climate["source_paths"])

    capability = client.get("/api/decision/capabilities", params={"city": city}).json()
    features = capability["features"]
    DecisionFeaturesModel.model_validate(features)
    assert capability["supported"] is short_supported
    assert features["short_term_price"]["supported"] is short_supported
    assert features["short_term_price"]["validated_model"] is short_supported
    assert features["long_horizon_scenario"]["supported"] is (city == "shenyang")
    assert features["long_horizon_scenario"]["validated_model"] is False
    for name, result_type in [("production_structure", "OBSERVATIONAL_ANALYSIS"),
                              ("historical_climate", "OBSERVATIONAL_ANALYSIS"),
                              ("break_even", "DETERMINISTIC_CALCULATION"),
                              ("user_scenario", "USER_ASSUMPTION_SCENARIO")]:
        assert features[name]["supported"] is True
        assert features[name]["result_type"] == result_type
    if not short_supported:
        assert capability["crops"] == [] and capability["market_as_of"] is None
    assert features["break_even"]["required_inputs"] == [
        "area_mu", "yield_kg_per_mu", "cost_per_mu", "assumed_sale_price_per_kg", "sale_fraction"]


def test_shenyang_scope_is_districts_and_categories_do_not_double_count(client):
    production = client.get("/api/observations", params={"city": "shenyang"}).json()["production"]
    assert production["scope"] == "eight_agricultural_districts"
    assert {item["crop"] for item in production["items"]} == {"玉米", "稻谷", "大豆", "蔬菜及食用菌", "瓜果"}
    assert all(item["share"] is None for item in production["items"])
    assert next(item for item in production["items"] if item["crop"] == "稻谷")["area_ha"] == 103543
    assert any("不等于" in text for text in production["limitations"])


def test_research_area_reports_ranges_without_fabricated_totals(client):
    body = client.get("/api/observations").json()
    assert body["scope"] == "six_city_research_area"
    assert {city["city_id"] for city in body["cities"]} == set(O.RESEARCH_CITIES)
    assert body["summary"] == {
        "city_count": 6, "climate_year": 2025,
        "precipitation_range_mm": {"min": 528.8, "max": 1165.0},
        "mean_temp_range_c": {"min": pytest.approx(9.687123287671234), "max": pytest.approx(12.681369863013698)},
    }
    assert set(body["summary"]) == {"city_count", "climate_year", "precipitation_range_mm", "mean_temp_range_c"}
    assert any("全省" in text for text in body["limitations"])


def test_shenyang_climate_uses_its_own_runtime_values(client):
    climate = client.get("/api/observations", params={"city": "shenyang"}).json()["climate"]
    latest = climate["series"][-1]
    assert latest["precipitation_mm"] == 963.5
    assert latest["mean_temp_c"] == pytest.approx(10.101643835616438)
    assert latest["growing_season_precipitation_mm"] == 897.2
    assert climate["source_paths"] == ["data/model_ready/climate/climate_daily.parquet"]


@pytest.mark.parametrize("city", ["unknown", "anshan", "../shenyang", "", "沈阳"])
def test_observation_rejects_out_of_scope_ids_without_fallback(client, city):
    response = client.get("/api/observations", params={"city": city})
    assert response.status_code == 422 and response.json()["error_code"] == "UNSUPPORTED_CITY"


def test_unknown_capability_rejects_but_registered_non_research_is_honest(client):
    response = client.get("/api/decision/capabilities", params={"city": "unknown"})
    assert response.status_code == 422 and response.json()["error_code"] == "UNSUPPORTED_CITY"
    body = client.get("/api/decision/capabilities", params={"city": "anshan"}).json()
    assert body["supported"] is False
    assert all(feature["supported"] is False for feature in body["features"].values())


def test_missing_city_assets_preserve_other_features_and_do_not_make_partial_area_range(client, monkeypatch):
    original = O._csv
    O.reset_cache()
    with monkeypatch.context() as patch:
        patch.setattr(O, "_csv", lambda path: [] if "dandong" in path.parts else original(path))
        response = client.get("/api/observations", params={"city": "dandong"})
        assert response.status_code == 200
        body = response.json()
        assert body["production"]["available"] is False and body["production"]["items"] == []
        assert body["production"]["latest_year"] is None
        assert body["climate"]["available"] is False and body["climate"]["series"] == []
        features = client.get("/api/decision/capabilities", params={"city": "dandong"}).json()["features"]
        assert features["production_structure"]["supported"] is False
        assert features["historical_climate"]["supported"] is False
        assert features["break_even"]["supported"] is True and features["user_scenario"]["supported"] is True
        area = client.get("/api/observations").json()["summary"]
        assert area["climate_year"] is None and area["precipitation_range_mm"] is None
    O.reset_cache()


def test_partial_2026_and_invalid_numeric_rows_do_not_reach_annual_charts(client, monkeypatch):
    original = O._csv
    O.reset_cache()
    with monkeypatch.context() as patch:
        rows = [
            {"year": "2025", "precip_ann": "100", "tmean_ann": "10", "precip_gs": "90", "tmean_gs": "20"},
            {"year": "2026", "precip_ann": "99999", "tmean_ann": "10", "precip_gs": "90", "tmean_gs": "20"},
            {"year": "2024", "precip_ann": "NaN", "tmean_ann": "10", "precip_gs": "90", "tmean_gs": "20"},
        ]
        patch.setattr(O, "_csv", lambda path: rows if path.name == "A09_climatology.csv" and "dandong" in path.parts else original(path))
        climate = client.get("/api/observations", params={"city": "dandong"}).json()["climate"]
        assert climate["complete_year"] == 2025 and len(climate["series"]) == 1
        assert climate["series"][0]["precipitation_mm"] == 100
    O.reset_cache()


def test_shenyang_incomplete_daily_year_is_not_published_as_annual(client, monkeypatch):
    import pandas as pd

    dates = list(pd.date_range("2024-01-01", "2024-12-31")) + list(pd.date_range("2025-01-01", "2025-12-30"))
    data = pd.DataFrame({"date": dates, "city": "沈阳", "precipitation_sum": 1.0, "temperature_2m_mean": 10.0})
    O.reset_cache()
    with monkeypatch.context() as patch:
        patch.setattr(pd, "read_parquet", lambda *args, **kwargs: data.copy())
        climate = client.get("/api/observations", params={"city": "shenyang"}).json()["climate"]
        assert climate["complete_year"] == 2024
        assert [row["year"] for row in climate["series"]] == [2024]
        assert climate["series"][0]["precipitation_mm"] == 366
    O.reset_cache()


def test_strict_response_rejects_unlabelled_extra_data_and_nonfinite_number(client):
    body = client.get("/api/observations", params={"city": "dandong"}).json()
    body["future_yield"] = 3500
    with pytest.raises(ValidationError):
        CityObservationResponse.model_validate(body)
    del body["future_yield"]
    body["climate"]["series"][0]["precipitation_mm"] = float("nan")
    with pytest.raises(ValidationError):
        CityObservationResponse.model_validate(body)


def test_openapi_documents_observation_union_and_fixed_feature_contract(client):
    spec = client.get("/openapi.json").json()
    assert "/api/observations" in spec["paths"]
    schema = spec["paths"]["/api/observations"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
    assert len(schema["anyOf"]) == 2
    feature_schema = spec["components"]["schemas"]["DecisionFeaturesModel"]
    assert feature_schema["additionalProperties"] is False and len(feature_schema["required"]) == 6


@pytest.mark.parametrize("result_type,supported,validated", [
    ("VERIFIED_MODEL", True, False), ("OBSERVATIONAL_ANALYSIS", True, True),
    ("EXPLORATORY_REFERENCE", True, True), ("NOT_SUPPORTED", True, False),
    ("DETERMINISTIC_CALCULATION", False, False),
])
def test_feature_rejects_mislabelled_model_semantics(result_type, supported, validated):
    with pytest.raises(ValidationError):
        DecisionFeatureModel.model_validate({
            "supported": supported, "result_type": result_type, "validated_model": validated,
            "data_sources": [], "required_inputs": [], "limitations": [], "horizons": [], "crop_ids": [],
        })
