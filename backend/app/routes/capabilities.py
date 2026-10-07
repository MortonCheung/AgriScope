# -*- coding: utf-8 -*-
"""能力路由：/api/decision/capabilities（+ /api/capabilities 别名）。"""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Query

from ..schemas import CapabilityResponse
from ..services import capability_service as CAPS

router = APIRouter(tags=["capabilities"])


def _capability(city: str = Query(..., description="前端 city_id（slug），如 shenyang")) -> Dict[str, Any]:
    return CAPS.capability(city)


router.add_api_route("/api/decision/capabilities", _capability,
                     methods=["GET"], response_model=CapabilityResponse,
                     summary="城市决策能力（前端可支持的作物与 horizon）")
router.add_api_route("/api/capabilities", _capability,
                     methods=["GET"], response_model=CapabilityResponse,
                     include_in_schema=False, summary="别名：/api/capabilities")