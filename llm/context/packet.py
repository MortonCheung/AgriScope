# -*- coding: utf-8 -*-
"""Phase 9：ForecastContextPacket 构建（所有数值由程序计算，LLM 不参与输入构造）。

严格 point-in-time：只读 `date <= cutoff` 的冻结数据；`cutoff` 之后的一切不进入 packet。
`context_hash = stable_hash(packet)`，packet 不含 `generated_at` 等易变字段 → 同输入同哈希。
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from long_horizon.common import load_frozen_dataset
from llm.common import UNIT, PRICE_LEVEL, stable_hash

CITY = "沈阳"
SEASON_WINDOW_DAYS = 30

DEFAULT_CONFIG: Dict[str, Any] = {
    "season_window_days": SEASON_WINDOW_DAYS,
    "rolling_windows": [7, 14, 30, 60, 90],
    "return_lags_days": [7, 14, 30, 60, 90],
    "short_model_horizons": [7, 14, 30],
    "price_level": PRICE_LEVEL,
    "unit": UNIT,
    "calendar": "gregorian",
    "time_index": "relative",       # blind 用相对索引；context 模式仍保留日期
}


def _prev_year_same_period(sub: pd.DataFrame, cutoff: pd.Timestamp, days: int) -> Optional[float]:
    """上一年同期窗口均值，严格早于 cutoff（PIT）。"""
    lo = cutoff - pd.Timedelta(days=365 + days)
    hi = cutoff - pd.Timedelta(days=365)
    w = sub[(sub["date"] > lo) & (sub["date"] <= hi)]["price_per_kg"]
    return float(w.mean()) if len(w) else None


def _short_model(sub: pd.DataFrame, row: pd.Series, crop: str,
                 horizons: List[int]) -> Dict[str, Any]:
    """现有 Final 短期模型输出（只读加载冻结 artifacts；缺失则如实降级标注）。"""
    out: Dict[str, Any] = {}
    try:
        from decision_engine.final.artifacts import predict as _predict
    except Exception:  # noqa: BLE001
        _predict = None
    for h in horizons:
        val, src = None, "unavailable"
        if _predict is not None:
            try:
                val = _predict(CITY, crop, h, row)
                if val is not None:
                    src = "final_model_artifact"
            except Exception:  # noqa: BLE001
                val = None
        if val is None:
            # 规则式 baseline（last value / 去年同期）；如实标注，不冒充模型
            lv = float(row["price_per_kg"])
            py = _prev_year_same_period(sub, pd.Timestamp(row["date"]), h)
            val = py if py is not None else lv
            src = "rule_baseline_fallback"
        out[f"d{h}"] = {"value": float(val), "source": src}
    return out


def build_packet(crop: str, cutoff: str, horizon: int,
                 config: Optional[Dict[str, Any]] = None,
                 dataset: Optional[pd.DataFrame] = None) -> Dict[str, Any]:
    """构建一个 ForecastContextPacket（context 模式，含真实日期）。"""
    cfg = dict(DEFAULT_CONFIG)
    if config:
        cfg.update(config)
    ds = dataset if dataset is not None else load_frozen_dataset()
    cut = pd.Timestamp(cutoff)
    sub = ds[(ds["crop"] == crop) & (ds["date"] <= cut)].sort_values("date")
    if not len(sub):
        raise ValueError(f"cutoff={cutoff} 之前无 {crop} 观测")
    row = sub.iloc[-1]
    last_date = pd.Timestamp(row["date"])

    # ---- 历史同月序列（严格更早日期，PIT）
    same_month = sub[sub["date"].dt.month == cut.month]["price_per_kg"].astype(float).tolist()
    # ---- 多年季节轮廓（逐月历史均值，仅 <= cutoff）
    profile = (sub.groupby(sub["date"].dt.month)["price_per_kg"].mean()
               .round(4).to_dict())
    profile = {int(k): float(v) for k, v in profile.items()}

    span_days = (last_date - pd.Timestamp(sub["date"].min())).days
    n_obs = int(len(sub))
    expected_days = span_days + 1
    missing_pct = round(100.0 * (1 - n_obs / expected_days), 3) if expected_days > 0 else None

    packet: Dict[str, Any] = {
        "schema_version": "lh_context_v1",
        "city": CITY,
        "crop": crop,
        "cutoff": str(cut.date()),
        "anchor_observation_date": str(last_date.date()),
        "horizon": int(horizon),
        "unit": cfg["unit"],
        "price_level": cfg["price_level"],
        "current_price": float(row["price_per_kg"]),
        "returns": {f"d{w}": (float(row[f"price_return_{w}"])
                              if pd.notna(row.get(f"price_return_{w}")) else None)
                    for w in cfg["return_lags_days"]},
        "rolling": {
            "mean_30": float(row["price_ma30"]),
            "median_30": float(row["price_median30"]),
            "volatility_30": float(row["volatility_30"]),
            "drawdown_30": float(row["drawdown_30"]),
            "max_drawdown_90": float(row["max_drawdown_90"]),
        },
        "seasonality": {
            "same_month_history": [round(float(v), 4) for v in same_month],
            "same_month_count": len(same_month),
            "seasonal_percentile": (float(row["same_month_price_percentile"])
                                    if pd.notna(row.get("same_month_price_percentile")) else None),
            "seasonal_p10": (float(row["seasonal_p10"]) if pd.notna(row.get("seasonal_p10")) else None),
            "seasonal_p50": (float(row["seasonal_p50"]) if pd.notna(row.get("seasonal_p50")) else None),
            "seasonal_p90": (float(row["seasonal_p90"]) if pd.notna(row.get("seasonal_p90")) else None),
            "historical_profile": profile,
        },
        "short_model": _short_model(sub, row, crop, cfg["short_model_horizons"]),
        "risk": {
            "hri": {"available": False, "reason": "NO_PIT_PER_CUTOFF_SOURCE"},
            "market_risk": {"available": False, "reason": "NO_PIT_PER_CUTOFF_SOURCE"},
            "climate_exposure": {"available": False, "reason": "WEATHER_NOT_WIRED"},
            "program_proxy": {
                "drawdown_30": float(row["drawdown_30"]),
                "volatility_30": float(row["volatility_30"]),
                "expanding_price_percentile": (float(row["expanding_price_percentile"])
                                               if pd.notna(row.get("expanding_price_percentile")) else None),
            },
        },
        "supply": {"available": False, "reason": "NO_STRUCTURED_SOURCE_FOR_CROP"},
        "production": {"available": False, "reason": "NO_STRUCTURED_SOURCE_FOR_CROP"},
        "events": [],
        "events_available": False,
        "data_quality": {
            "n_obs": n_obs,
            "first_date": str(pd.Timestamp(sub["date"].min()).date()),
            "last_date": str(last_date.date()),
            "missing_calendar_days_pct": missing_pct,
            "n_years": int(sub["date"].dt.year.nunique()),
            "source": "frozen Final dataset（data/model_ready/ shenyang_core market_daily, wholesale）",
        },
        "config": cfg,
    }
    return packet


def build_blind_packet(crop: str, cutoff: str, horizon: int,
                       config: Optional[Dict[str, Any]] = None,
                       dataset: Optional[pd.DataFrame] = None) -> Dict[str, Any]:
    """blind 模式：匿名化真实年份/日期，使用相对时间索引 T-k，降低 pretrained 记忆泄漏。"""
    p = build_packet(crop, cutoff, horizon, config=config, dataset=dataset)
    cut = pd.Timestamp(cutoff)
    first = pd.Timestamp(p["data_quality"]["first_date"])
    last = pd.Timestamp(p["anchor_observation_date"])

    p["mode"] = "blind"
    p["city"] = "CITY_A"
    p["crop"] = f"CROP_{stable_hash(crop)[:4]}"      # 确定性匿名 ID（禁用内置 hash）
    p["cutoff"] = f"T+{(cut - last).days}d"          # 相对 anchor 的偏移
    p["anchor_observation_date"] = "T0"
    p["data_quality"]["first_date"] = f"T-{(last - first).days}d"
    p["data_quality"]["last_date"] = "T0"
    p["data_quality"]["n_years"] = None
    p["config"]["time_index"] = "relative"
    p["config"]["calendar"] = "relative_index"
    p["seasonality"]["historical_profile"] = {
        f"M{k}": v for k, v in p["seasonality"]["historical_profile"].items()}
    return p


def packet_hash(packet: Dict[str, Any]) -> str:
    """确定性哈希：与 `packet_hash` 前先剔除易变字段（本实现本身不含 generated_at）。"""
    p = {k: v for k, v in packet.items() if k != "generated_at"}
    return stable_hash(p)


__all__ = ["build_packet", "build_blind_packet", "packet_hash", "DEFAULT_CONFIG", "CITY"]