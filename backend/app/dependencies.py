# -*- coding: utf-8 -*-
"""依赖：城市映射、推理锁、引擎获取、request_id。"""
from __future__ import annotations

import threading
import uuid
from typing import Dict, Optional

from . import config as C

# 前端 city_id（slug）<-> Final 标准城市名（shortName）
CITY_SLUG_TO_SHORT: Dict[str, str] = {
    "shenyang": "沈阳", "tieling": "铁岭", "chaoyang": "朝阳", "jinzhou": "锦州",
    "dandong": "丹东", "dalian": "大连", "anshan": "鞍山", "fushun": "抚顺",
    "benxi": "本溪", "yingkou": "营口", "fuxin": "阜新", "liaoyang": "辽阳",
    "panjin": "盘锦", "huludao": "葫芦岛",
}
CITY_SHORT_TO_SLUG: Dict[str, str] = {v: k for k, v in CITY_SLUG_TO_SHORT.items()}

# 推理串行化锁（单进程内）。Final 引擎有模块级/类级缓存，串行化最稳。
_INFERENCE_LOCK = threading.Lock()

# 引擎单例
_ENGINE = None


def slug_to_short(city_id: str) -> Optional[str]:
    if city_id is None:
        return None
    key = str(city_id).strip()
    if key in CITY_SLUG_TO_SHORT:
        return CITY_SLUG_TO_SHORT[key]
    if key in CITY_SHORT_TO_SLUG:      # 允许直接传标准名
        return key
    return None


def short_to_slug(short_name: str) -> Optional[str]:
    return CITY_SHORT_TO_SLUG.get(short_name)


def inference_lock() -> threading.Lock:
    return _INFERENCE_LOCK


def get_engine():
    global _ENGINE
    if _ENGINE is None:
        import decision_engine.final.inference as inf  # noqa: PLC0415
        _ENGINE = inf.get_engine()
    return _ENGINE


def new_request_id() -> str:
    return uuid.uuid4().hex[:12]


def lock_enabled() -> bool:
    return C.INFERENCE_LOCK_ENABLED