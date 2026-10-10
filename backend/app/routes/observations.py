# -*- coding: utf-8 -*-
"""V4 六城农业与历史气候的只读观测 API。"""
from typing import Optional, Union

from fastapi import APIRouter, Query

from ..schemas import CityObservationResponse, ResearchAreaObservationResponse
from ..services import observation_service as O

router = APIRouter(tags=["observations"])


@router.get("/api/observations", response_model=Union[CityObservationResponse, ResearchAreaObservationResponse],
            summary="六城农业与完整年度历史气候观测（不含未来预测）")
def observations(city: Optional[str] = Query(None, description="六城 slug；省略返回六城研究区，非全省总量。")):
    return O.observations(city)
