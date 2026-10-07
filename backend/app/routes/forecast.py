# -*- coding: utf-8 -*-
"""Long-Horizon 路由（新增，**不改** /api/decision 语义）。

  GET  /api/forecast/capabilities?city=...   长期能力（crop × horizon × method × status）
  POST /api/forecast/long-horizon            长期预测主契约（只读预生成快照）
"""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Body, Query

from ..services import long_horizon_service as LH

router = APIRouter(tags=["forecast"])

_FORECAST_BODY = Body(..., description="{contract_version?, city_id?, crop, horizon_days}")


@router.get("/api/forecast/capabilities",
            summary="长期预测能力（crop × horizon × method × production_status）")
def capabilities(city: str = Query("shenyang", description="城市 slug，目前仅 shenyang")) -> Dict[str, Any]:
    return LH.capabilities(city)


@router.post("/api/forecast/long-horizon",
             summary="长期预测（N 天窗口均价的情景化估计）")
def long_horizon(payload: Dict[str, Any] = _FORECAST_BODY) -> Dict[str, Any]:
    return LH.forecast(payload)