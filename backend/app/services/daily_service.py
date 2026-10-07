# -*- coding: utf-8 -*-
"""Daily 服务：原子读取冻结的 latest.json，原样返回（前端自行按 schema 1.1.0 校验）。"""
from __future__ import annotations

import json
import time
from typing import Any, Dict, Optional

from .. import config as C
from ..errors import ApiError, ErrorCode

_SUPPORTED_CITIES = {"shenyang"}


def _read_json_atomic(path) -> Optional[Dict[str, Any]]:
    """原子读：流式发布时可能出现半写文件 → 重试一次。"""
    for attempt in range(2):
        try:
            raw = paths_read_bytes(path)
            return json.loads(raw.decode("utf-8"))
        except FileNotFoundError:
            return None
        except (json.JSONDecodeError, UnicodeDecodeError):
            if attempt == 0:
                time.sleep(0.05)
                continue
            raise ApiError(503, ErrorCode.DAILY_UNAVAILABLE,
                           "Daily 快照正在更新（读取到不完整 JSON），请稍后重试。")
        except Exception as exc:  # noqa: BLE001
            raise ApiError(500, ErrorCode.DAILY_UNAVAILABLE,
                           "Daily 快照读取失败。", {"type": type(exc).__name__, "detail": str(exc)[:200]})
    return None


def paths_read_bytes(path) -> bytes:
    with open(path, "rb") as f:
        return f.read()


def latest(city: str) -> Dict[str, Any]:
    if city not in _SUPPORTED_CITIES:
        raise ApiError(404, ErrorCode.NOT_FOUND,
                       f"Daily 目前仅支持 shenyang（收到 {city}）。", {"city": city})
    if not C.DAILY_LATEST.exists():
        raise ApiError(503, ErrorCode.DAILY_UNAVAILABLE,
                       "Daily latest.json 不存在（尚未生成快照）。")
    data = _read_json_atomic(C.DAILY_LATEST)
    if not isinstance(data, dict) or not data:
        raise ApiError(503, ErrorCode.DAILY_UNAVAILABLE, "Daily latest.json 为空或格式错误。")
    return data


def monitor() -> Optional[Dict[str, Any]]:
    if not C.DAILY_MONITOR.exists():
        return None
    try:
        return json.loads(C.DAILY_MONITOR.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return None