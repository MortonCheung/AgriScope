# -*- coding: utf-8 -*-
"""对外响应模型（供 OpenAPI 文档与响应校验）。

说明：decision 信封（evaluate）字段较多且部分字段必须**原样回显**请求，
故该路由不绑定 response_model，以免 FastAPI 过滤字段破坏前端契约；
本文件仍为 capability / stress / meta / health 提供精确模型。
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


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