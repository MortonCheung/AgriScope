# -*- coding: utf-8 -*-
"""采集适配器基类与结果容器。"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Optional

from .. import config as C
from ..records import PriceRecord


@dataclass
class FetchResult:
    region_id: str
    source_id: str
    source_name: str
    status: str = C.ST_SUCCESS
    records: list = field(default_factory=list)      # 候选 PriceRecord（未校验）
    rejected: list = field(default_factory=list)     # [(record_dict, reason)]
    raw_paths: list = field(default_factory=list)
    observation_date: Optional[str] = None
    schema_ok: bool = True
    schema_note: str = ""
    error: str = ""
    detail: dict = field(default_factory=dict)


class Adapter:
    """子类实现 ``collect(target_date)``。

    region_id / source_id / source_name / source_url / price_level / frequency / is_primary
    """

    region_id: str = ""
    source_id: str = ""
    source_name: str = ""
    source_url: str = ""
    price_level: str = "other"
    frequency: str = "daily"          # daily | workday | weekly | irregular
    is_primary: bool = True

    def collect(self, target_date: Optional[date] = None) -> FetchResult:  # pragma: no cover
        raise NotImplementedError
