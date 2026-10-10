# -*- coding: utf-8 -*-
"""Official, comparable market history from the already bound runtime snapshot.

Never joins cities, markets, price levels, products or sources. Calendar gaps
are retained and conflicting same-day prices are omitted rather than averaged.
"""
from __future__ import annotations

import hashlib
import math
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Optional

from .. import runtime_snapshot as RS
from ..dependencies import CITY_SLUG_TO_SHORT
from ..errors import ApiError, ErrorCode

RESEARCH_CITIES = {"shenyang", "tieling", "chaoyang", "jinzhou", "dandong", "dalian"}
MARKETS = {
    "shenyang": ("shenyang_core", "wholesale", {"沈阳菜篮子信息发布平台（批发口径）"}),
    "chaoyang": ("chaoyang_extended", "market_average", {"朝阳市监测点平均"}),
    "jinzhou": ("jinzhou_extended", "market_average", {"全市均价", "锦州市监测点平均"}),
}
SOURCE_NAMES = {
    "shenyang": {"沈阳市发展和改革委员会 沈阳菜篮子信息发布平台"},
    "chaoyang": {"朝阳市发改委 主要菜篮子产品每日价情(全市平均价格)", "辽宁省发改委(朝阳价格监测)"},
    "jinzhou": {"锦州市菜篮子信息发布平台（图片经 macOS Vision OCR 转录）", "锦州市菜篮子信息发布平台", "辽宁省发改委(锦州价格监测)"},
}
# Only mass units with a documented mathematical kg conversion are comparable.
# ml/L, missing units and '(默认)' inferred units are deliberately excluded.
MASS_UNITS = {"元/斤", "元/500克", "元/500g", "元/公斤", "元/千克", "元/kg", "元/250g"}
COLUMNS = ["city", "market_name", "crop_standard", "crop_raw", "price_per_kg", "unit_original",
           "price_level_canonical", "observation_date", "source_name", "source_url",
           "is_proxy", "is_derived", "processing_state", "quality_grade"]


def _text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return "" if text.lower() in {"nan", "none", "nat", "<na>"} else text


def _flag(value: Any) -> bool:
    return _text(value).lower() in {"true", "1"}


@lru_cache(maxsize=8)
def _read(path: str, modified: int, size: int, city: str):
    import pandas as pd
    bucket, level, markets = MARKETS[city]
    try:
        frame = pd.read_parquet(path, columns=COLUMNS)
    except (OSError, ValueError, KeyError) as exc:
        raise ApiError(503, ErrorCode.RESEARCH_UNAVAILABLE, "本城市场观测文件不可读取。") from exc
    grouped: Dict[Any, Dict[str, Any]] = {}
    for row in frame.to_dict("records"):
        crop, market, source = (_text(row[key]) for key in ["crop_standard", "market_name", "source_name"])
        if (_text(row["city"]) != CITY_SLUG_TO_SHORT[city] or market not in markets
                or row["price_level_canonical"] != level or not crop or source not in SOURCE_NAMES[city]
                or _text(row["unit_original"]).lower() not in MASS_UNITS
                or _flag(row["is_proxy"]) or _flag(row["is_derived"])
                or _text(row["processing_state"]) not in {"", "unprocessed", "raw"}
                or _text(row["quality_grade"]) not in {"", "A", "B"}):
            continue
        try:
            price = float(row["price_per_kg"])
            timestamp = pd.to_datetime(row["observation_date"], errors="coerce")
            if pd.isna(timestamp):
                continue
            day = timestamp.date()
            if not math.isfinite(price) or price <= 0 or day > date.today():
                continue
        except (ValueError, TypeError, OverflowError):
            continue
        # Raw product identity avoids e.g. merging piglets and hogs as 生猪.
        product = _text(row["crop_raw"]) or crop
        key = (crop, market, source, product)
        item = grouped.setdefault(key, {"days": {}, "urls": {}})
        item["days"].setdefault(day.isoformat(), set()).add(price)
        url = _text(row["source_url"])
        if url.startswith(("https://", "http://")):
            item["urls"][day.isoformat()] = url
    series = []
    for (crop, market, source, product), item in sorted(grouped.items()):
        observations = [{"date": day, "pricePerKg": next(iter(prices))}
                        for day, prices in sorted(item["days"].items()) if len(prices) == 1]
        if not observations:
            continue
        url = item["urls"].get(max(item["urls"])) if item["urls"] else None
        # The same official Shenyang source is explicitly registered in Daily.
        if url is None and city == "shenyang":
            from .daily_service import latest
            try:
                url = next((s.get("url") for s in latest(city).get("sources", [])
                            if s.get("name") == source and s.get("price_level") == level), None)
            except ApiError:
                pass
        omitted = sum(len(prices) > 1 for prices in item["days"].values())
        notes = []
        if "OCR" in source:
            notes.append("官方图片经 OCR 转录，保留原来源。")
        if omitted:
            notes.append(f"{omitted} 个同日冲突观测已省略。")
        series.append({
            "id": hashlib.sha256("\0".join([city, crop, market, level, source, product]).encode()).hexdigest()[:16],
            "crop": crop, "productName": product, "marketName": market, "priceLevel": level,
            "source": {"name": source, "url": url}, "observations": observations, "notes": notes,
        })
    digest = hashlib.sha256(Path(path).read_bytes()).hexdigest()[:16]
    return sorted({item["crop"] for item in series}), series, digest


def observations(city: str, crop: Optional[str] = None) -> Dict[str, Any]:
    if city not in RESEARCH_CITIES:
        raise ApiError(422, ErrorCode.UNSUPPORTED_CITY, "该城市不在六城研究区内。")
    result = {"cityId": city, "cityName": CITY_SLUG_TO_SHORT[city], "unit": "元/kg",
              "available": False, "selectedCrop": None, "snapshotVersion": None, "crops": [], "series": []}
    if city not in MARKETS:
        return result
    path = Path(RS.state()["snapshot_dir"]) / "model_ready" / MARKETS[city][0] / "market_daily.parquet"
    if not path.is_file():
        return result
    stat = path.stat()
    crops, series, version = _read(str(path), stat.st_mtime_ns, stat.st_size, city)
    if crop is not None and crop not in crops:
        raise ApiError(422, ErrorCode.BAD_REQUEST, "本城没有该品种的可比较市场观测。", {"crop": crop})
    selected = crop or ("土豆" if "土豆" in crops else next(iter(crops), None))
    result.update({"available": bool(crops), "selectedCrop": selected, "snapshotVersion": version,
                   "crops": crops, "series": [item for item in series if item["crop"] == selected]})
    return result


def reset_cache() -> None:
    _read.cache_clear()
