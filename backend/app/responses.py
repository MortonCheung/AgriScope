# -*- coding: utf-8 -*-
"""安全 JSON 响应：非有限浮点（NaN/Infinity）一律转为 null。

背景：Starlette 的 JSONResponse 使用 allow_nan=False，一旦响应体含 NaN/Inf 会直接 500。
Final 引擎的部分指标在缺样本时可能产生 NaN。桥接实现（AgriScope/server/agriscope_api.py）
用 clean_json 做了同样的防护；正式后端在此统一收口，禁止 NaN/Inf 到达前端。
"""
from __future__ import annotations

import math
from typing import Any

from fastapi.responses import JSONResponse


def clean_json(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): clean_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean_json(v) for v in value]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


class SafeJSONResponse(JSONResponse):
    def render(self, content: Any) -> bytes:
        return super().render(clean_json(content))