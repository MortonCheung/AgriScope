# -*- coding: utf-8 -*-
"""对外响应模型（供 OpenAPI 文档与响应校验）。

说明：decision 信封（evaluate）字段较多且部分字段必须**原样回显**请求，
故该路由不绑定 response_model，以免 FastAPI 过滤字段破坏前端契约；
本文件仍为 capability / stress / meta / health 提供精确模型。
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictObservationModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


DecisionResultType = Literal[
    "VERIFIED_MODEL", "OBSERVATIONAL_ANALYSIS", "DETERMINISTIC_CALCULATION",
    "USER_ASSUMPTION_SCENARIO", "EXPLORATORY_REFERENCE", "NOT_SUPPORTED",
]


class DecisionFeatureModel(StrictObservationModel):
    supported: bool
    result_type: DecisionResultType
    data_sources: List[str]
    required_inputs: List[str]
    validated_model: bool
    limitations: List[str]
    horizons: List[int]
    crop_ids: List[str]

    @model_validator(mode="after")
    def consistent_result_semantics(self):
        if self.supported != (self.result_type != "NOT_SUPPORTED"):
            raise ValueError("supported must agree with result_type")
        if self.validated_model != (self.result_type == "VERIFIED_MODEL"):
            raise ValueError("only VERIFIED_MODEL carries validated_model=true")
        return self


class DecisionFeaturesModel(StrictObservationModel):
    short_term_price: DecisionFeatureModel
    long_horizon_scenario: DecisionFeatureModel
    production_structure: DecisionFeatureModel
    historical_climate: DecisionFeatureModel
    break_even: DecisionFeatureModel
    user_scenario: DecisionFeatureModel


class ProductionObservationItem(StrictObservationModel):
    crop: str
    area_ha: float = Field(ge=0)
    share: Optional[float] = Field(ge=0, le=1)


class ProductionObservationModel(StrictObservationModel):
    available: bool
    period_start: Optional[int]
    period_end: Optional[int]
    latest_year: Optional[int]
    scope: Literal["eight_agricultural_districts", "eight_crop_categories"]
    unit: Literal["ha"]
    items: List[ProductionObservationItem]
    source_paths: List[str]
    limitations: List[str]


class ClimateObservationYear(StrictObservationModel):
    year: int = Field(ge=2010, le=2025)
    precipitation_mm: float = Field(ge=0)
    mean_temp_c: float
    growing_season_precipitation_mm: float = Field(ge=0)
    growing_season_mean_temp_c: float


class ClimateObservationModel(StrictObservationModel):
    available: bool
    period_start: Optional[int]
    period_end: Optional[int]
    complete_year: Optional[int]
    series: List[ClimateObservationYear]
    source_paths: List[str]
    limitations: List[str]


class CityObservationResponse(StrictObservationModel):
    contract_version: Literal["1"]
    scope: Literal["city"]
    city_id: str
    city_name: str
    production: ProductionObservationModel
    climate: ClimateObservationModel


class ObservationRangeModel(StrictObservationModel):
    min: float
    max: float


class ResearchAreaObservationSummary(StrictObservationModel):
    city_count: int
    climate_year: Optional[int]
    precipitation_range_mm: Optional[ObservationRangeModel]
    mean_temp_range_c: Optional[ObservationRangeModel]


class ResearchAreaObservationResponse(StrictObservationModel):
    contract_version: Literal["1"]
    scope: Literal["six_city_research_area"]
    cities: List[CityObservationResponse]
    summary: ResearchAreaObservationSummary
    limitations: List[str]


class HorizonModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    days: int
    mode: str


class CropCapabilityModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    label: str
    horizons: List[HorizonModel]


class CapabilityResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    city_id: str
    tier: str
    supported: bool
    crops: List[CropCapabilityModel]
    market_as_of: Optional[str]
    model_version: str
    data_version: str
    code_fingerprint: str
    limitation: Optional[str]
    features: DecisionFeaturesModel


class StressChangesModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    price_pct: float
    yield_pct: float
    cost_pct: float
    delay_days: int


class StressResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    candidate_id: str
    changes: StressChangesModel
    available: bool
    profit_base: Optional[float]
    delta_cny: Optional[float]
    roi: Optional[float]
    note: str
    model_version: str
    data_version: str


class ErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    error_code: str
    message: str
    request_id: str
    details: Dict[str, Any] = {}


class LongHorizonForecastRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    contract_version: Optional[Literal["1", "2"]] = None
    city_id: Optional[str] = None
    crop: str
    horizon_days: int
    target_type: Literal["harvest_market_price", "cycle_market_average"] = "harvest_market_price"


class LongHorizonActualInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    cost_per_mu: Optional[float]
    yield_kg_per_mu: Optional[float]


class LongHorizonMarketContext(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    as_of: Optional[str] = None
    expected_harvest_horizon_days: Optional[int] = None
    expected_harvest_date: Optional[str] = None


class LongHorizonUserContext(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    city_id: str
    area_mu: float
    budget_cny: float
    risk_preference: Literal["conservative", "balanced", "aggressive"]
    crop_preferences: List[str]
    actual_inputs: Dict[str, LongHorizonActualInput]
    market_context: LongHorizonMarketContext


class StructuredInputSource(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    kind: Literal["structured"]


class LongHorizonDecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    contract_version: Literal["2"]
    user_context: LongHorizonUserContext
    input_source: StructuredInputSource
