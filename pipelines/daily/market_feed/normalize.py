# -*- coding: utf-8 -*-
"""口径换算与规范化：单位 → 元/公斤、原始作物名 → 正式名、记录构造与校验。

只做数学可验证的换算；无法证明的（体积、未知单位）一律 ``price_per_kg=None``，
绝不猜测，也不生成假价格。
"""
from __future__ import annotations

import re
from typing import Optional

from . import config as C
from .records import PriceRecord


def to_price_per_kg(price: float, unit: str) -> Optional[float]:
    """把原价换算为 元/公斤。仅接受质量单位；其余返回 None。"""
    u = (unit or "").strip().replace(" ", "")
    if u in C.NON_MASS_UNITS or any(m in u for m in C.NON_MASS_MARKERS):
        return None
    factor = C.UNIT_TO_KG.get(u)
    if factor is None:
        # 容忍 “元/500克(下同)” 之类后缀
        for key, f in C.UNIT_TO_KG.items():
            if u.startswith(key):
                factor = f
                break
    if factor is None:
        return None
    try:
        return round(float(price) * factor, 4)
    except (TypeError, ValueError):
        return None


def standard_crop(raw: str) -> str:
    """原始作物名 → 正式展示名（含 马铃薯→土豆）。未知则原样返回并去空白。"""
    name = re.sub(r"\s+", "", raw or "")
    return C.CROP_ALIASES.get(name, name)


def parse_float(text) -> Optional[float]:
    if text is None:
        return None
    m = re.search(r"-?\d+(?:\.\d+)?", str(text))
    if not m:
        return None
    try:
        return float(m.group(0))
    except ValueError:
        return None


def make_record(
    *,
    region_id: str,
    source_id: str,
    source_name: str,
    source_url: str,
    market_id: str,
    product_raw: str,
    observation_date: str,
    collected_at: str,
    original_price: float,
    original_unit: str,
    price_level: str,
    product_specification: str = "",
    quality_status: str = C.QC_OK,
    raw_evidence_path: str = "",
    source_parser_version: str = "",
    notes: Optional[list] = None,
) -> PriceRecord:
    region = C.REGIONS.get(region_id, {})
    rec = PriceRecord(
        region_id=region_id,
        region_name=region.get("name", region_id),
        source_id=source_id,
        source_name=source_name,
        source_url=source_url,
        market_id=market_id,
        product_raw=product_raw.strip(),
        product_standard=standard_crop(product_raw),
        product_specification=product_specification.strip(),
        observation_date=observation_date,
        collected_at=collected_at,
        original_price=round(float(original_price), 4),
        original_unit=original_unit.strip(),
        price_per_kg=to_price_per_kg(original_price, original_unit),
        price_level=price_level,
        quality_status=quality_status,
        raw_evidence_path=raw_evidence_path,
        source_parser_version=source_parser_version,
        notes=list(notes or []),
    )
    return rec.finalize()


def validate(rec: PriceRecord) -> tuple[bool, str]:
    """返回 (是否可入库, 拒绝原因)。拒绝项标记为 REJECTED，不静默丢弃。"""
    if not rec.product_raw:
        return False, "EMPTY_CROP"
    if rec.price_level not in C.PRICE_LEVELS:
        return False, "BAD_PRICE_LEVEL"
    if rec.original_price is None or rec.original_price <= 0:
        return False, "NON_POSITIVE_PRICE"
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", rec.observation_date or ""):
        return False, "BAD_DATE"
    return True, ""
