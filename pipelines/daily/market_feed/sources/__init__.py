# -*- coding: utf-8 -*-
"""七区域采集源注册表：每区域按优先级列出主来源与备用来源。

主来源失败（FAILED / SOURCE_SCHEMA_CHANGED）时运行器自动尝试备用来源；
备用来源的城市/市场/口径若不同，则作为**独立序列**（不同 source_id/market_id），
不并入同一条历史价格曲线。
"""
from __future__ import annotations

from .. import config as C
from .base import Adapter, FetchResult
from .shenyang_clz import ShenyangCLZ
from .liaoning_fgw_daily import LiaoningFgwDaily
from .chaoyang_basket import ChaoyangBasket
from .jinzhou_weekly import JinzhouWeekly
from .lnfgw_by_city import LnfgwByCity


def _make_registry() -> dict[str, list[Adapter]]:
    return {
        "liaoning": [LiaoningFgwDaily()],
        "shenyang": [ShenyangCLZ(), LnfgwByCity("shenyang")],
        "chaoyang": [ChaoyangBasket(), LnfgwByCity("chaoyang")],
        "jinzhou": [JinzhouWeekly(), LnfgwByCity("jinzhou")],
        "dalian": [LnfgwByCity("dalian")],
        "dandong": [LnfgwByCity("dandong")],
        "tieling": [LnfgwByCity("tieling")],
    }


REGISTRY = _make_registry()


def adapters_for(region_id: str) -> list[Adapter]:
    return REGISTRY.get(region_id, [])


def all_regions() -> list[str]:
    return list(C.REGION_ORDER)


__all__ = ["REGISTRY", "adapters_for", "all_regions", "Adapter", "FetchResult"]
