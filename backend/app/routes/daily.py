# -*- coding: utf-8 -*-
"""Daily 路由：/api/daily/latest（原样返回冻结快照）。"""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Query

from ..services import daily_service as DAILY

router = APIRouter(tags=["daily"])


@router.get("/api/daily/latest", summary="Daily 市场脉搏最新快照（schema 1.1.0）")
def latest(city: str = Query("shenyang", description="城市 slug，目前仅 shenyang")) -> Dict[str, Any]:
    return DAILY.latest(city)