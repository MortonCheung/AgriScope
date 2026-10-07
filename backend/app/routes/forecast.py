# -*- coding: utf-8 -*-
"""Long-Horizon 路由（新增，**不改** /api/decision 语义）。

  GET  /api/forecast/capabilities?city=...   长期能力（crop × horizon × method × status）
  POST /api/forecast/long-horizon            长期预测主契约（只读预生成快照）
"""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Body, Query

from ..services import long_horizon_service as LH
from ..schemas import LongHorizonDecisionRequest, LongHorizonForecastRequest

router = APIRouter(tags=["forecast"])

_FORECAST_BODY = Body(..., description="{contract_version?: '1'|'2', city_id?, crop, horizon_days, target_type?: harvest_market_price|cycle_market_average}")


@router.get("/api/forecast/capabilities",
            summary="长期预测能力（crop × horizon × method × production_status）")
def capabilities(city: str = Query("shenyang", description="城市 slug，目前仅 shenyang")) -> Dict[str, Any]:
    return LH.capabilities(city)


@router.post("/api/forecast/long-horizon",
             summary="长期双目标：上市窗口价格与周期市场均价")
def long_horizon(payload: LongHorizonForecastRequest = _FORECAST_BODY) -> Dict[str, Any]:
    return LH.forecast(payload.model_dump(exclude_unset=True))


@router.post("/api/decision/long-horizon", summary="上市窗口种植决策（结构化契约 v2）")
def long_horizon_decision(payload: LongHorizonDecisionRequest = Body(..., description="contract_version='2'; user_context 包含面积、预算、风险偏好、作物、实际投入与用户选择的预计上市跨度/日期。")) -> Dict[str, Any]:
    return LH.decision(payload.model_dump(exclude_unset=True))
