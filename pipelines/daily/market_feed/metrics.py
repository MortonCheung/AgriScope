# -*- coding: utf-8 -*-
"""行情指标：最新有效价、前一有效观测、涨跌幅、7/30 日变化、新鲜度。

所有变化只在**同系列**（区域+市场+来源+品种+规格+口径）内计算；
缺少历史则为 None，绝不写 0；前一有效观测不是昨天时不得称「较昨日」。
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Optional

from . import config as C
from .clock import age_days, parse_date


def _pct(new: float, old: float) -> Optional[float]:
    if old in (None, 0):
        return None
    return round((new - old) / old * 100.0, 4)


def _value_at_or_before(days: dict[str, float], target: date) -> tuple[str, float] | None:
    best = None
    for d, v in days.items():
        dd = parse_date(d)
        if dd is not None and dd <= target:
            if best is None or d > best[0]:
                best = (d, v)
    return best


def build_series(rows, ref_date: date | None = None) -> list[dict]:
    """把一行行观测聚成系列并计算指标。rows 需含 price_per_kg 非空的记录。"""
    ref = ref_date or date.today()
    groups: dict[tuple, dict] = defaultdict(lambda: {"days": {}, "meta": {}})
    for r in rows:
        key = (r["market_id"], r["source_id"], r["product_standard"],
               r["product_specification"] or "", r["price_level"])
        d = r["observation_date"]
        price = float(r["price_per_kg"])
        g = groups[key]
        g["days"].setdefault(d, price)
        g["meta"] = {
            "regionId": r["region_id"],
            "productStandard": r["product_standard"],
            "productRaw": r["product_raw"],
            "productSpecification": r["product_specification"] or "",
            "marketId": r["market_id"],
            "sourceId": r["source_id"],
            "sourceName": r["source_name"],
            "sourceUrl": r["source_url"],
            "priceLevel": r["price_level"],
            "priceLevelCn": C.PRICE_LEVEL_CN.get(r["price_level"], r["price_level"]),
            "unit": "元/kg",
        }

    series = []
    for (market, source, crop, spec, level), g in groups.items():
        days = {d: v for d, v in g["days"].items() if v is not None}
        if not days:
            continue
        ordered = sorted(days.items())
        last_date, last_price = ordered[-1]
        prev = ordered[-2] if len(ordered) >= 2 else None
        wk = _value_at_or_before(days, (parse_date(last_date) or ref) - timedelta(days=7))
        mo = _value_at_or_before(days, (parse_date(last_date) or ref) - timedelta(days=30))
        age = age_days(last_date, ref)
        item = dict(g["meta"])
        item.update({
            "latestObservationDate": last_date,
            "latestPricePerKg": round(last_price, 4),
            "previousObservationDate": prev[0] if prev else None,
            "previousPricePerKg": round(prev[1], 4) if prev else None,
            # 是否「较前一有效观测」——绝不写成「较昨日」除非确实相隔一天
            "previousIsYesterday": bool(prev and (parse_date(last_date) - parse_date(prev[0])).days == 1),
            "changePct": _pct(last_price, prev[1]) if prev else None,
            "change7dPct": _pct(last_price, wk[1]) if wk and wk[0] != last_date else None,
            "change30dPct": _pct(last_price, mo[1]) if mo and mo[0] != last_date else None,
            "observationCount": len(ordered),
            "history": [{"date": d, "pricePerKg": round(v, 4)} for d, v in ordered],
            "freshness": C.freshness_for_age(age),
            "ageDays": age,
        })
        series.append(item)
    series.sort(key=lambda s: (s["productStandard"], s["marketId"]))
    return series


def region_freshness(latest_date: Optional[str], ref_date: date | None = None) -> dict:
    age = age_days(latest_date, ref_date) if latest_date else None
    return {"latestObservationDate": latest_date, "ageDays": age,
            "freshness": C.freshness_for_age(age)}
