# -*- coding: utf-8 -*-
"""统一 Error Contract：{error_code, message, request_id, details}。

所有非 2xx 响应都使用该信封；request_id 便于前后端联调定位。
"""
from __future__ import annotations

from typing import Any, Dict, Optional


class ErrorCode:
    BAD_REQUEST = "BAD_REQUEST"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    UNSUPPORTED_CITY = "UNSUPPORTED_CITY"
    NOT_FOUND = "NOT_FOUND"
    MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"
    DAILY_UNAVAILABLE = "DAILY_UNAVAILABLE"
    FORECAST_UNAVAILABLE = "FORECAST_UNAVAILABLE"
    LLM_UNAVAILABLE = "LLM_UNAVAILABLE"
    INFERENCE_ERROR = "INFERENCE_ERROR"
    INTERNAL_ERROR = "INTERNAL_ERROR"


class ApiError(Exception):
    """业务异常：携带 HTTP 状态码与错误码。"""

    def __init__(self, status_code: int, error_code: str, message: str,
                 details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        self.details = details or {}


def error_body(error_code: str, message: str, request_id: str,
               details: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return {
        "error_code": error_code,
        "message": message,
        "request_id": request_id,
        "details": details or {},
    }