# -*- coding: utf-8 -*-
"""决策路由：evaluate（+ 别名）/ stress。"""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Body

from ..schemas import StressResponse
from ..services import final_model_service as SVC

router = APIRouter(tags=["decision"])

_EVALUATE_BODY = Body(..., description="FinalDecisionRequest（contract_version='1'），原样回显。")
_STRESS_BODY = Body(..., description="{request, candidate_id, changes}")


def _evaluate(payload: Dict[str, Any] = _EVALUATE_BODY) -> Dict[str, Any]:
    return SVC.evaluate(payload)


# 前端默认 base = /api/decision → POST /api/decision 为主入口；
# /api/decision/evaluate 与 /api/decision/rank 为任务文档中的别名。
router.add_api_route("/api/decision/evaluate", _evaluate, methods=["POST"],
                     summary="种植决策评估（Final Model，主契约）")
router.add_api_route("/api/decision", _evaluate, methods=["POST"],
                     summary="别名：/api/decision（前端 HttpDecisionProvider 默认入口）")
router.add_api_route("/api/decision/rank", _evaluate, methods=["POST"],
                     include_in_schema=False, summary="别名：/api/decision/rank")


def _stress(payload: Dict[str, Any] = _STRESS_BODY) -> Dict[str, Any]:
    return SVC.stress(payload)


router.add_api_route("/api/decision/stress", _stress, methods=["POST"],
                     response_model=StressResponse,
                     summary="压力情景（价格/亩产/成本/延迟）")