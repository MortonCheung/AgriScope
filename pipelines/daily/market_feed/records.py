# -*- coding: utf-8 -*-
"""规范化价格观测记录（canonical record）。

一条记录 = 某个区域、某来源、某市场、某品种规格、某官方监测日的一条价格。
字段与任务 §5 对齐。``record_hash`` 使「同来源/市场/品种规格/日期」的重复采集幂等，
同时保留每次抓取的原始证据路径。
"""
from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass, field
from typing import Optional


@dataclass
class PriceRecord:
    region_id: str
    region_name: str
    source_id: str
    source_name: str
    source_url: str
    market_id: str
    product_raw: str
    product_standard: str
    product_specification: str
    observation_date: str          # 官方监测日 YYYY-MM-DD（Asia/Shanghai）
    collected_at: str              # 本系统抓取时刻 ISO8601（Asia/Shanghai）
    original_price: float
    original_unit: str
    price_per_kg: Optional[float]
    price_level: str
    quality_status: str = "OK"
    raw_evidence_path: str = ""
    record_hash: str = ""
    source_parser_version: str = ""
    notes: list = field(default_factory=list)

    # 幂等身份：同一「区域 + 来源 + 市场 + 原始品种 + 规格 + 监测日 + 口径」视为同一观测
    # （含 region_id，杜绝不同城市同源同品种同日互相覆盖）
    def identity(self) -> str:
        return "\0".join([
            self.region_id, self.source_id, self.market_id, self.product_raw,
            self.product_specification, self.observation_date, self.price_level,
        ])

    def compute_hash(self) -> str:
        return hashlib.sha256(self.identity().encode("utf-8")).hexdigest()[:20]

    def content_hash(self) -> str:
        """内容指纹：用于检测同日价格修订（值变化）。"""
        return hashlib.sha256(
            (self.identity() + "\0" + repr(self.original_price) + "\0" + self.original_unit)
            .encode("utf-8")
        ).hexdigest()[:20]

    def finalize(self) -> "PriceRecord":
        from .normalize import standard_crop, to_price_per_kg  # 懒加载避免循环导入
        if not self.product_standard:
            self.product_standard = standard_crop(self.product_raw)
        if not self.record_hash:
            self.record_hash = self.compute_hash()
        if self.price_per_kg is None:
            self.price_per_kg = to_price_per_kg(self.original_price, self.original_unit)
        return self

    def to_dict(self) -> dict:
        return asdict(self)
