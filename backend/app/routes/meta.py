# -*- coding: utf-8 -*-
"""版本矩阵路由：/api/meta。"""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Request

from ..services import meta_service as META

router = APIRouter(tags=["meta"])


@router.get("/api/meta", summary="版本矩阵（model/daily/runtime/backend）")
def meta(request: Request) -> Dict[str, Any]:
    body = META.meta()
    body["request_id"] = request.state.request_id
    return body