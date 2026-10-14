"""Read-only, complete market presentation; never used by research or decisions."""
from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime, timezone, timedelta
from functools import lru_cache
import json
import math
import os
from pathlib import Path
import re
from typing import Any, Optional

from .. import config as C
from ..errors import ApiError, ErrorCode

REGIONS = ("shenyang", "tieling", "chaoyang", "jinzhou", "dandong", "dalian", "liaoning")
PRODUCTS = ("黄瓜", "甘蓝", "青椒", "尖椒", "土豆", "西红柿", "茄子", "大白菜")
# V3 契约：七地区 × 八商品 × 四种价格口径（新增官方监测均价 market_average）。
PRICE_LEVELS = ("wholesale", "supermarket", "retail_market", "market_average")
# V1/V2 历史发布仅含三种价格口径；保留只读兼容。
LEGACY_PRICE_LEVELS = ("wholesale", "supermarket", "retail_market")
V3_COLLECTION_STATUS = ("configured", "not_configured")
LEGACY_COLLECTION_STATUS = ("scheduled", "not_configured")
UNIT_V3 = "元/kg"
DAY_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}\Z")
TIME_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\Z")
URL_PATTERN = re.compile(r"https?://\S+\Z")


def _day(value: Any) -> bool:
    if not isinstance(value, str) or not DAY_PATTERN.fullmatch(value):
        return False
    try:
        return date.fromisoformat(value) <= datetime.now(timezone(timedelta(hours=8))).date()
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
    """Validate the complete publication before applying any optional query filters.

    Versioned contract:
      - "1" / "2": historical publications (3 price levels; either no availability
        block or ``scheduled``/``not_configured`` coverage). Read-only compatibility.
      - "3": the current strict local-observation contract — 4 price levels, an
        explicit ``published_at``, per-record ``unit``/``source`` identity and a
        coverage block whose ``collection_status`` is ``configured``/``not_configured``.
    """
    def members(value, expected):
        return (isinstance(value, list) and len(value) == len(expected)
                and all(isinstance(item, str) for item in value) and set(value) == set(expected))

    version = data.get("schema_version") if isinstance(data, dict) else None
    fields = {"schema_version", "products", "price_levels", "records"}
    if version == "2":
        fields |= {"missing", "coverage"}
    if version == "3":
        fields |= {"missing", "coverage", "published_at"}
    levels = PRICE_LEVELS if version == "3" else LEGACY_PRICE_LEVELS
    row_fields = {"region", "product", "price_level", "price",
                  "observation_date", "collectedAt", "change_percent", "history"}
    if version == "3":
        row_fields |= {"unit", "source"}
    if (not isinstance(data, dict) or set(data) != fields
            or version not in ("1", "2", "3")
            or not members(data.get("products"), PRODUCTS)
            or not members(data.get("price_levels"), levels)
            or not isinstance(data.get("records"), list)
            or (version == "1" and len(data["records"]) != len(REGIONS) * len(PRODUCTS) * len(LEGACY_PRICE_LEVELS))):
        raise ValueError("Incomplete market publication")
    if version == "3" and data.get("published_at") is not None and not _timestamp(data["published_at"]):
        raise ValueError("Invalid market publication time")
    seen = set()
    for row in data["records"]:
        if not isinstance(row, dict) or set(row) != row_fields:
            raise ValueError("Invalid market record")
        region, product, level = row.get("region"), row.get("product"), row.get("price_level")
        if (region not in REGIONS or product not in PRODUCTS or level not in levels
                or not _number(row.get("price"), True) or not _day(row.get("observation_date"))
                or not _timestamp(row.get("collectedAt")) or not _number(row.get("change_percent"))):
            raise ValueError("Invalid market fields")
        if version == "3":
            source = row.get("source")
            if (row.get("unit") != UNIT_V3 or not isinstance(source, dict)
                    or set(source) != {"id", "name", "url"}
                    or not all(isinstance(source[key], str) and source[key].strip() for key in source)
                    or not URL_PATTERN.fullmatch(source["url"])):
                raise ValueError("Invalid market record source")
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
    if version in ("2", "3"):
        missing, coverage = data.get("missing"), data.get("coverage")
        if not isinstance(missing, list) or not isinstance(coverage, dict) or set(coverage) != set(REGIONS):
            raise ValueError("Invalid observed-market availability")
        for row in missing:
            if (not isinstance(row, dict) or set(row) != {"region", "product", "price_level", "reason"}
                    or row["region"] not in REGIONS or row["product"] not in PRODUCTS
                    or row["price_level"] not in levels or row["reason"] != "no_local_observation"):
                raise ValueError("Invalid missing local observation")
            key = row["region"], row["product"], row["price_level"]
            if key in seen:
                raise ValueError("Duplicate observed/missing market cell")
            seen.add(key)
        if len(seen) != len(REGIONS) * len(PRODUCTS) * len(levels):
            raise ValueError("Incomplete observed-market availability")
        allowed_status = V3_COLLECTION_STATUS if version == "3" else LEGACY_COLLECTION_STATUS
        coverage_fields = {"collection_status", "available_records", "total_records", "latest_observation_date"}
        if version == "3":
            coverage_fields |= {"latest_collected_at"}
        for region, item in coverage.items():
            records = [row for row in data["records"] if row["region"] == region]
            if (not isinstance(item, dict) or set(item) != coverage_fields
                    or item["collection_status"] not in allowed_status
                    or type(item["available_records"]) is not int or item["available_records"] != len(records)
                    or item["total_records"] != len(PRODUCTS) * len(levels)
                    or item["latest_observation_date"] != max((r["observation_date"] for r in records), default=None)):
                raise ValueError("Market coverage differs from local observations")
            if version == "3":
                latest_collected = item["latest_collected_at"]
                if latest_collected is not None and not _timestamp(latest_collected):
                    raise ValueError("Invalid market coverage time")
                if latest_collected != max((r["collectedAt"] for r in records), default=None):
                    raise ValueError("Market coverage time differs from local observations")
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
    from agriscope_market_publication import resolve
    try:
        publication = resolve(C.RUNTIME_DIR)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise ApiError(503, ErrorCode.RESEARCH_UNAVAILABLE, "行情发布包校验未通过。") from exc
    if publication:
        path = publication['directory'] / 'display.json'
    elif os.environ.get('AGRISCOPE_MARKET_POLICY', 'observed') != 'competition':
        # A release has no verified current observation until the first worker publication.
        return empty_observed(region, product, price_level)
    else:
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
    if body["schema_version"] in ("2", "3"):
        body["missing"] = [row for row in body["missing"] if
                           (region is None or row["region"] == region)
                           and (product is None or row["product"] == product)
                           and (price_level is None or row["price_level"] == price_level)]
    if body.get("schema_version") == "3" and publication:
        # The immutable generation is idempotent (no wall clock in its content), so the
        # real successful publication time comes from the atomic manifest pointer.
        body["published_at"] = publication.get("published_at")
    return body


def empty_observed(region=None, product=None, price_level=None):
    """Legal V3 payload before the first verified worker publication.

    No cell has a local observation yet, so every region is ``not_configured`` until a
    real collector is configured and verified; availability is entirely in ``missing``.
    """
    body = {"schema_version": "3", "products": list(PRODUCTS), "price_levels": list(PRICE_LEVELS),
            "published_at": None,
            "records": [],
            "missing": [{"region": r, "product": p, "price_level": l, "reason": "no_local_observation"}
                        for r in REGIONS for p in PRODUCTS for l in PRICE_LEVELS
                        if (region is None or region == r) and (product is None or product == p) and (price_level is None or price_level == l)],
            "coverage": {r: {"collection_status": "not_configured",
                             "available_records": 0, "total_records": len(PRODUCTS) * len(PRICE_LEVELS),
                             "latest_observation_date": None, "latest_collected_at": None} for r in REGIONS}}
    return body


def reset_cache() -> None:
    _read.cache_clear()
