# -*- coding: utf-8 -*-
"""时间工具：统一 Asia/Shanghai。observation_date（官方监测日）与 collected_at 分离。"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from . import config as C

try:
    from zoneinfo import ZoneInfo
    TZ = ZoneInfo(C.TZ_NAME)
except Exception:  # pragma: no cover - 无 tzdata 时退化
    TZ = timezone(timedelta(hours=8))


def now() -> datetime:
    return datetime.now(TZ)


def now_str() -> str:
    return now().isoformat(timespec="seconds")


def today() -> date:
    return now().date()


def today_str() -> str:
    return today().isoformat()


def days_ago(n: int) -> date:
    return today() - timedelta(days=n)


def parse_date(text: str) -> date | None:
    text = (text or "").strip()
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%Y年%m月%d日", "%Y%m%d"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def age_days(observation_date: str, ref: date | None = None) -> int | None:
    """官方监测日距参考日（默认今天）的天数。"""
    d = parse_date(observation_date)
    if d is None:
        return None
    return ((ref or today()) - d).days
