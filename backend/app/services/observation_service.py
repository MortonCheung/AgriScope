# -*- coding: utf-8 -*-
"""V4 六城观测摘要：只读取已发布 runtime，不修改研究口径或提供未来预测。"""
from __future__ import annotations

import ast
import calendar
import csv
import json
import math
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from .. import config as C
from ..dependencies import CITY_SLUG_TO_SHORT
from ..errors import ApiError, ErrorCode

RESEARCH_CITIES = ("shenyang", "tieling", "chaoyang", "jinzhou", "dandong", "dalian")
PRODUCT_ROOT = C.RUNTIME_DIR / "research" / "product"
CLIMATE_PATH = C.RUNTIME_DIR / "data" / "model_ready" / "climate" / "climate_daily.parquet"
# 当前发布气候资产的 2026 年止于 09-14。只提供已经完整的 2010–2025 年。
CLIMATE_FIRST_YEAR = 2010
CLIMATE_LAST_COMPLETE_YEAR = 2025


def _source(path: Path) -> str:
    return path.relative_to(C.RUNTIME_DIR).as_posix()


def _number(raw: Any) -> Optional[float]:
    try:
        value = float(raw)
    except (ValueError, TypeError, OverflowError):
        return None
    return value if math.isfinite(value) else None


def _csv(path: Path) -> List[Dict[str, str]]:
    try:
        with path.open(encoding="utf-8-sig", newline="") as handle:
            return list(csv.DictReader(handle))
    except (OSError, UnicodeError, csv.Error):
        return []


def _production_period(city: str) -> tuple[Optional[int], Optional[int], List[str]]:
    path = PRODUCT_ROOT / "cross_city" / "tables" / "cross_city_production_concentration.csv"
    for row in _csv(path):
        if row.get("city") != CITY_SLUG_TO_SHORT[city]:
            continue
        try:
            years = ast.literal_eval(row.get("years", ""))
            if (isinstance(years, list) and len(years) == 2
                    and all(type(year) is int and 1900 <= year <= 2100 for year in years)
                    and years[0] <= years[1]):
                return years[0], years[1], [_source(path)]
        except (ValueError, SyntaxError):
            pass
    # 发布文章是同一研究的元数据；不根据文件修改时间猜数据年。
    path = PRODUCT_ROOT / city / "articles" / "A07.json"
    try:
        article = json.loads(path.read_text(encoding="utf-8"))
        match = re.search(r"\b(20\d{2})[–-](20\d{2})\b", str(article.get("frontend_summary", "")))
        if match:
            return int(match[1]), int(match[2]), [_source(path)]
    except (OSError, ValueError, AttributeError):
        pass
    return None, None, []


def _production(city: str) -> Dict[str, Any]:
    path = PRODUCT_ROOT / city / "tables" / (
        "A07_change_2018_2024.csv" if city == "shenyang" else "A07_crop_structure.csv")
    result: Dict[str, Any] = {
        "available": False, "period_start": None, "period_end": None, "latest_year": None,
        "scope": "eight_agricultural_districts" if city == "shenyang" else "eight_crop_categories",
        "unit": "ha", "items": [], "source_paths": [_source(path)], "limitations": [],
    }
    if city == "shenyang":
        grouped: Dict[str, float] = {}
        # 选用互不重叠的主要类别。粮食/谷物/豆类等包含项不与其子项混合展示。
        selected = {"玉米", "稻谷", "大豆", "蔬菜及食用菌", "瓜果"}
        seen = set()
        for row in _csv(path):
            crop = row.get("crop", "")
            value = _number(row.get("area_2024"))
            key = (crop, row.get("district"))
            if crop in selected and value is not None and value >= 0 and key not in seen:
                grouped[crop] = grouped.get(crop, 0.0) + value
                seen.add(key)
        result["items"] = [{"crop": crop, "area_ha": value, "share": None}
                           for crop, value in sorted(grouped.items(), key=lambda item: -item[1])]
        result.update({"period_start": 2018, "period_end": 2024, "latest_year": 2024})
        result["limitations"] = [
            "8 个农业区县合计，不等于沈阳市全市合计。",
            "仅展示已覆盖的主要类别；未将粮食、谷物等包含项与其子项相加，不计算全作物份额。",
        ]
    else:
        first, last, metadata_sources = _production_period(city)
        result.update({"period_start": first, "period_end": last, "latest_year": last})
        result["source_paths"].extend(metadata_sources)
        for row in _csv(path):
            area, share = _number(row.get("area_kha")), _number(row.get("area_share"))
            crop = (row.get("crop") or "").strip()
            if crop and area is not None and area >= 0 and share is not None and 0 <= share <= 1:
                result["items"].append({"crop": crop, "area_ha": area * 1000, "share": share})
        result["limitations"] = [
            "播种面积来源为城市级年鉴；份额仅针对已覆盖的 8 类作物，不是所有农作物结构。",
            "结构集中不等于农户跟风行为；生产分类与市场价格品类不完全对应。",
        ]
    result["available"] = bool(result["items"]) and result["latest_year"] is not None
    if not result["available"]:
        result["items"] = []
        result.update({"period_start": None, "period_end": None, "latest_year": None})
        result["limitations"].append("本城已发布生产表或数据年份不可用，不使用其他城市代替。")
    return result


def _climate_row(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    year_value = _number(row.get("year"))
    if year_value is None or not year_value.is_integer():
        return None
    year = int(year_value)
    if not CLIMATE_FIRST_YEAR <= year <= CLIMATE_LAST_COMPLETE_YEAR:
        return None
    pairs = {
        "precipitation_mm": "precip_ann", "mean_temp_c": "tmean_ann",
        "growing_season_precipitation_mm": "precip_gs", "growing_season_mean_temp_c": "tmean_gs",
    }
    values = {key: _number(row.get(column)) for key, column in pairs.items()}
    if any(value is None for value in values.values()):
        return None
    if values["precipitation_mm"] < 0 or values["growing_season_precipitation_mm"] < 0:
        return None
    return {"year": year, **values}


@lru_cache(maxsize=1)
def _shenyang_climate() -> List[Dict[str, Any]]:
    """沈阳无已发布年汇总 CSV；从同一 runtime 日值做明确的只读汇总。"""
    try:
        import pandas as pd
        data = pd.read_parquet(CLIMATE_PATH, columns=[
            "city", "date", "temperature_2m_mean", "precipitation_sum"])
        data = data[data["city"] == "沈阳"].copy()
        data["date"] = pd.to_datetime(data["date"], errors="coerce")
        for column in ["temperature_2m_mean", "precipitation_sum"]:
            data[column] = pd.to_numeric(data[column], errors="coerce")
        rows = []
        for year, group in data.groupby(data["date"].dt.year):
            if not CLIMATE_FIRST_YEAR <= year <= CLIMATE_LAST_COMPLETE_YEAR:
                continue
            expected = 366 if calendar.isleap(int(year)) else 365
            if (len(group) != expected or group["date"].nunique() != expected
                    or group[["temperature_2m_mean", "precipitation_sum"]].isna().any().any()):
                continue
            gs = group[group["date"].dt.month.between(4, 9)]
            row = _climate_row({
                "year": year, "precip_ann": group["precipitation_sum"].sum(),
                "tmean_ann": group["temperature_2m_mean"].mean(),
                "precip_gs": gs["precipitation_sum"].sum(), "tmean_gs": gs["temperature_2m_mean"].mean(),
            })
            if row:
                rows.append(row)
        return rows
    except (OSError, ValueError, KeyError, ImportError):
        return []


def _climate(city: str) -> Dict[str, Any]:
    if city == "shenyang":
        path = CLIMATE_PATH
        series = _shenyang_climate()
    else:
        path = PRODUCT_ROOT / city / "tables" / "A09_climatology.csv"
        series = [parsed for row in _csv(path) if (parsed := _climate_row(row)) is not None]
    series = sorted(series, key=lambda row: row["year"])
    limitations = [
        "ERA5 再分析网格资料，非气象站实测；历史气候不等于未来天气或灾害损失预测。",
        "生长季口径为 4–9 月；2026 年资料不完整，未用于全年比较。",
    ]
    if not series:
        limitations.append("本城完整年度气候资料不可用，不使用其他城市代替。")
    return {
        "available": bool(series), "period_start": series[0]["year"] if series else None,
        "period_end": series[-1]["year"] if series else None,
        "complete_year": series[-1]["year"] if series else None,
        "series": series, "source_paths": [_source(path)], "limitations": limitations,
    }


@lru_cache(maxsize=6)
def city_observation(city: str) -> Dict[str, Any]:
    if city not in RESEARCH_CITIES:
        raise ApiError(422, ErrorCode.UNSUPPORTED_CITY, "该城市不在六城研究区内。", {"city_id": city})
    return {
        "contract_version": "1", "scope": "city", "city_id": city,
        "city_name": CITY_SLUG_TO_SHORT[city], "production": _production(city), "climate": _climate(city),
    }


def observations(city: Optional[str] = None) -> Dict[str, Any]:
    if city is not None:
        return city_observation(city)
    cities = [city_observation(city_id) for city_id in RESEARCH_CITIES]
    common_years = set.intersection(*[
        {row["year"] for row in item["climate"]["series"]} for item in cities])
    common_year = max(common_years) if common_years else None
    climate_rows = [next(row for row in item["climate"]["series"] if row["year"] == common_year)
                    for item in cities] if common_year is not None else []

    def spread(key: str) -> Optional[Dict[str, float]]:
        values = [row[key] for row in climate_rows]
        return {"min": min(values), "max": max(values)} if values else None

    return {
        "contract_version": "1", "scope": "six_city_research_area", "cities": cities,
        "summary": {"city_count": len(cities), "climate_year": common_year,
                    "precipitation_range_mm": spread("precipitation_mm"), "mean_temp_range_c": spread("mean_temp_c")},
        "limitations": [
            "此摘要仅覆盖六城研究区，不能代表辽宁全省农业总量或全省市场均价。",
            "生产数据年份与地理范围不同，未合并播种面积、产量或作物份额。",
            "气候范围为六城同一完整年度的城市值范围，不是全省面积加权平均。",
        ],
    }


def reset_cache() -> None:
    """测试或运行资产重新发布后清空；服务部署通常通过重启读取新快照。"""
    city_observation.cache_clear()
    _shenyang_climate.cache_clear()
