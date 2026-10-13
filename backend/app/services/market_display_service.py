"""Read-only, complete market presentation; never used by research or decisions."""
from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime
from functools import lru_cache
import json
import math
from pathlib import Path
import re
from typing import Any, Optional

from .. import config as C
from ..errors import ApiError, ErrorCode

REGIONS = ("shenyang", "tieling", "chaoyang", "jinzhou", "dandong", "dalian", "liaoning")
PRODUCTS = ("黄瓜", "甘蓝", "青椒", "尖椒", "土豆", "西红柿", "茄子", "大白菜")
PRICE_LEVELS = ("wholesale", "supermarket", "retail_market")
DAY_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}\Z")
TIME_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\Z")


def _day(value: Any) -> bool:
    if not isinstance(value, str) or not DAY_PATTERN.fullmatch(value):
        return False
    try:
        return date.fromisoformat(value) <= date.today()
    except ValueError:
        return False


def _timestamp(value: Any) -> bool:
    if _day(value):
        return True
    if not isinstance(value, str) or not TIME_PATTERN.fullmatch(value) or not _day(value[:10]):
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


def _number(value: Any, positive: bool = False) -> bool:
    return (type(value) in (int, float) and math.isfinite(value)
            and (not positive or value > 0))


def validate_display(data: Any) -> dict:
    """Validate the complete publication before applying any optional query filters."""
    def members(value, expected):
        return (isinstance(value, list) and len(value) == len(expected)
                and all(isinstance(item, str) for item in value) and set(value) == set(expected))

    if (not isinstance(data, dict) or set(data) != {"schema_version", "products", "price_levels", "records"}
            or data.get("schema_version") != "1"
            or not members(data.get("products"), PRODUCTS)
            or not members(data.get("price_levels"), PRICE_LEVELS)
            or not isinstance(data.get("records"), list)
            or len(data["records"]) != len(REGIONS) * len(PRODUCTS) * len(PRICE_LEVELS)):
        raise ValueError("Incomplete market publication")
    seen = set()
    for row in data["records"]:
        if (not isinstance(row, dict) or set(row) != {"region", "product", "price_level", "price",
                "observation_date", "collectedAt", "change_percent", "history"}):
            raise ValueError("Invalid market record")
        region, product, level = row.get("region"), row.get("product"), row.get("price_level")
        if (region not in REGIONS or product not in PRODUCTS or level not in PRICE_LEVELS
                or not _number(row.get("price"), True) or not _day(row.get("observation_date"))
                or not _timestamp(row.get("collectedAt")) or not _number(row.get("change_percent"))):
            raise ValueError("Invalid market fields")
        key = region, product, level
        if key in seen:
            raise ValueError("Duplicate market record")
        seen.add(key)
        history = row.get("history")
        if not isinstance(history, list) or not 1 <= len(history) <= 4:
            raise ValueError("Invalid market history")
        previous = ""
        for point in history:
            if (not isinstance(point, dict) or set(point) != {"date", "price"} or not _day(point.get("date"))
                    or point["date"] <= previous or not _number(point.get("price"), True)):
                raise ValueError("Invalid history point")
            previous = point["date"]
        last = history[-1]
        if last["date"] != row["observation_date"] or last["price"] != row["price"]:
            raise ValueError("Latest price differs from history")
        change = (last["price"] / history[-2]["price"] - 1) * 100 if len(history) > 1 else 0
        if abs(change - row["change_percent"]) > 0.0001:
            raise ValueError("Market change differs from comparable history")
    return data


@lru_cache(maxsize=4)
def _read(path: str, modified_ns: int, size: int) -> dict:
    try:
        return validate_display(json.loads(Path(path).read_text(encoding="utf-8")))
    except (OSError, ValueError, TypeError, OverflowError) as exc:
        raise ApiError(503, ErrorCode.RESEARCH_UNAVAILABLE, "行情发布包暂时不可读取。") from exc


def display(region: Optional[str] = None, product: Optional[str] = None,
            price_level: Optional[str] = None) -> dict:
    for field, value, allowed in [("region", region, REGIONS), ("product", product, PRODUCTS),
                                  ("price_level", price_level, PRICE_LEVELS)]:
        if value is not None and value not in allowed:
            raise ApiError(422, ErrorCode.BAD_REQUEST, "行情查询条件不正确。", {"field": field})
    path = C.RUNTIME_DIR / "data" / "market" / "display.json"
    try:
        stat = path.stat()
    except OSError as exc:
        raise ApiError(503, ErrorCode.RESEARCH_UNAVAILABLE, "行情发布包暂时不可读取。") from exc
    body = deepcopy(_read(str(path), stat.st_mtime_ns, stat.st_size))
    body["records"] = [row for row in body["records"] if
                       (region is None or row["region"] == region)
                       and (product is None or row["product"] == product)
                       and (price_level is None or row["price_level"] == price_level)]
    return body


def reset_cache() -> None:
    _read.cache_clear()
