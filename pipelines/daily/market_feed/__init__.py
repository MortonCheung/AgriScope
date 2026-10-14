# -*- coding: utf-8 -*-
"""AgriScope 七区域每日农产品价格采集（market_feed）。

仅标准库；采集真实官方行情 → SQLite 历史 → 版本化 JSON 快照（供前端读取）。
详见同目录 README.md 与 docs/v4-final/SEVEN_REGION_MARKET_FEED_CONTRACT.md。
"""
from __future__ import annotations

from . import config
from .runner import run

__all__ = ["config", "run"]
__version__ = config.FRAMEWORK_VERSION
