# -*- coding: utf-8 -*-
"""Phase 11–13：LLM 评估 harness。

在**同一批折、同一批 anchor**上与统计 baseline 比较：
  - 实验 A `blind_numeric_forecast`（匿名化 + 相对时间索引）
  - 实验 B `context_augmented_forecast`（cutoff-safe 上下文）
  - LLM Residual（unbounded / bounded / confidence-gated）
  - Hybrid A（baseline + LLM 残差）/ B（加权集成，权重由 dev OOT 程序选）/ C（regime 门控）

诚实性：本 harness 只负责「跑通与度量」。若 provider 不是真实 LLM（stub），
所有输出必须标记 `is_real_llm=false`，报告中 LLM 数值增益一律写「未评估」。
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from decision_engine.models.backtest import FOLDS, fold_mask, metrics_table
from long_horizon.common import load_frozen_dataset
from long_horizon.targets import add_long_horizon_targets
from long_horizon.target_definition import primary_target_col
from long_horizon.baselines import rowwise_baselines

from llm.common import (canonical_json, stable_hash, prompt_meta, read_prompt,
                        LLM_RESULTS, ensure_llm_dirs, write_json)
from llm.context import build_packet, build_blind_packet, packet_hash, audit_packet
from llm.schemas import validate_forecast, validate_residual, validate_critic, hard_bounds
from llm import cache as CACHE
from llm.providers import LLMProvider, LLMUnavailable

CROPS = ["土豆", "西红柿", "黄瓜", "韭菜", "青椒", "尖椒", "茄子", "芹菜", "芸豆", "甘蓝"]
LH_HORIZONS = [60, 90, 120]
PILOT_HORIZONS = [60, 90, 120]
MAX_ANCHORS_PER_FOLD = 8          # §46 控成本：pilot 阶段限制 cutoff 数


# ---------------------------------------------------------------- 统计 baseline
def _summary() -> pd.DataFrame:
    p = (__import__("long_horizon.common", fromlist=["LH_ARTIFACTS"])
         .LH_ARTIFACTS / "long_horizon_summary.csv")
    return pd.read_csv(p) if p.exists() else pd.DataFrame()


def best_rowwise_method(crop: str, horizon: int) -> str:
    s = _summary()
    if not len(s):
        return "b_last_value"
    sub = s[(s["crop"] == crop) & (s["horizon"] == horizon) & (s["family"] == "rowwise")]
    if not len(sub):
        return "b_last_value"
    return str(sub.sort_values("score").iloc[0]["method"])


def _baseline_series(dataset: pd.DataFrame, horizon: int) -> pd.DataFrame:
    return rowwise_baselines(dataset, horizon)


# ---------------------------------------------------------------- case grid
@dataclass
class ExperimentConfig:
    experiment: str = "blind_numeric_forecast"      # 或 context_augmented_forecast
    horizons: List[int] = field(default_factory=lambda: list(PILOT_HORIZONS))
    crops: List[str] = field(default_factory=lambda: list(CROPS))
    max_anchors_per_fold: int = MAX_ANCHORS_PER_FOLD
    temperature: float = 0.0
    repeats: int = 1
    residual_mode: Optional[str] = None             # unbounded|bounded|confidence_gated
    include_sections: Optional[List[str]] = None    # 消融用：限制进入 prompt 的上下文块
    fold_names: Optional[List[str]] = None          # 限定折（如仅 dev=fold1）


def case_grid(cfg: ExperimentConfig, dataset: pd.DataFrame) -> List[Dict[str, Any]]:
    cases = []
    for horizon in cfg.horizons:
        tcol = primary_target_col(horizon)
        for crop in cfg.crops:
            sub = dataset[(dataset["crop"] == crop) & (dataset[tcol].notna())]
            for fold in FOLDS:
                if cfg.fold_names is not None and fold["name"] not in cfg.fold_names:
                    continue
                _, te = fold_mask(sub, fold)
                anchors = sub[te].sort_values("date")
                if not len(anchors):
                    continue
                step = max(1, len(anchors) // cfg.max_anchors_per_fold)
                picks = anchors.iloc[::step].head(cfg.max_anchors_per_fold)
                for _, r in picks.iterrows():
                    cases.append({"crop": crop, "horizon": horizon, "fold": fold["name"],
                                  "anchor": str(pd.Timestamp(r["date"]).date()),
                                  "actual": float(r[tcol])})
    return cases


# ---------------------------------------------------------------- prompt 渲染
def _render(prompt_name: str, packet: Dict[str, Any], baseline_point: Optional[float],
            sections: Optional[List[str]] = None) -> Tuple[str, str]:
    text = read_prompt(prompt_name)
    system = text.split("## system", 1)[1].split("## user", 1)[0].strip()
    user_tpl = text.split("## user", 1)[1].strip() if "## user" in text else ""

    def block(name: str, value: Any) -> str:
        if sections is not None and name not in sections:
            return f"[{name}: omitted_in_ablation]"
        return canonical_json(value)

    fields = {
        "city": packet["city"], "crop": packet["crop"], "cutoff": packet["cutoff"],
        "horizon": packet["horizon"], "current_price": packet["current_price"],
        "returns": block("returns", packet["returns"]),
        "rolling": block("rolling", packet["rolling"]),
        "seasonal_percentile": packet["seasonality"]["seasonal_percentile"],
        "seasonal_p10": packet["seasonality"]["seasonal_p10"],
        "seasonal_p50": packet["seasonality"]["seasonal_p50"],
        "seasonal_p90": packet["seasonality"]["seasonal_p90"],
        "historical_profile": block("seasonality", packet["seasonality"]["historical_profile"]),
        "short_model": block("short_model", packet["short_model"]),
        "risk": block("risk", packet["risk"]),
        "events": block("events", packet.get("events", [])),
        "data_quality": block("data_quality", packet["data_quality"]),
        "sources": canonical_json({"baseline": baseline_point,
                                   "short_model": packet["short_model"]}),
    }
    fields["baseline_point"] = baseline_point
    user = user_tpl
    for k, v in fields.items():
        user = user.replace("{" + k + "}", str(v))
    return system, user


# ---------------------------------------------------------------- 单次调用
def _call_once(provider: LLMProvider, packet: Dict[str, Any], baseline_point: Optional[float],
               schema_name: str, cfg: ExperimentConfig) -> Dict[str, Any]:
    prompt_name = {"forecast": "forecast_v1.md", "residual": "residual_v1.md",
                   "critic": "critic_v1.md"}[schema_name]
    pm = prompt_meta(prompt_name)
    system, user = _render(prompt_name, packet, baseline_point, cfg.include_sections)
    chash = packet_hash(packet)
    key = CACHE.cache_key(chash, pm["prompt_hash"], provider.model)
    hit = CACHE.get(key)
    if hit is not None:
        return {"payload": hit["payload"], "cache_hit": True, "prompt_meta": pm,
                "context_hash": chash, "key": key, "valid": True, "errors": []}
    ctx = {"context_hash": chash, "baseline_point": baseline_point,
           "current_price": packet["current_price"], "horizon": packet["horizon"]}
    try:
        out = provider.complete_json(task=cfg.experiment, system=system, user=user,
                                     schema_name=schema_name, context=ctx,
                                     temperature=cfg.temperature, seed=42)
    except LLMUnavailable as e:
        return {"payload": None, "cache_hit": False, "prompt_meta": pm, "context_hash": chash,
                "key": key, "valid": False, "errors": [f"llm_unavailable:{e}"]}

    if schema_name == "forecast":
        v = validate_forecast(out, packet["horizon"], hard_bounds_placeholder(packet))
    elif schema_name == "residual":
        v = validate_residual(out)
    else:
        v = validate_critic(out)
    if v["ok"]:
        CACHE.put(key, out, {**pm, "provider": provider.describe(), "context_hash": chash,
                             "is_real_llm": provider.is_real_llm}, validated=True)
    return {"payload": out, "cache_hit": False, "prompt_meta": pm, "context_hash": chash,
            "key": key, "valid": v["ok"], "errors": v["errors"]}


_BOUNDS_CACHE: Dict[str, Tuple[float, float]] = {}
_DATASET_CACHE: Dict[str, pd.DataFrame] = {}


def hard_bounds_placeholder(packet: Dict[str, Any]) -> Tuple[float, float]:
    """用**该作物历史价格分布**推出的量级边界（程序化，非手写常数）。"""
    crop = packet["crop"]
    if crop not in _BOUNDS_CACHE:
        ds = _DATASET_CACHE.get("ds")
        if ds is None:
            return (0.0, float("inf"))
        _BOUNDS_CACHE[crop] = hard_bounds(ds, crop)
    return _BOUNDS_CACHE[crop]


# ---------------------------------------------------------------- 主运行
def run_experiment(provider: LLMProvider, cfg: ExperimentConfig,
                   dataset: Optional[pd.DataFrame] = None) -> Dict[str, Any]:
    ensure_llm_dirs()
    ds = dataset if dataset is not None else load_frozen_dataset()
    ds = add_long_horizon_targets(ds, horizons=cfg.horizons)
    _DATASET_CACHE["ds"] = ds

    cases = case_grid(cfg, ds)
    records: List[Dict[str, Any]] = []
    baseline_series: Dict[int, pd.DataFrame] = {}
    for h in cfg.horizons:
        baseline_series[h] = _baseline_series(ds, h)

    for c in cases:
        h = c["horizon"]
        crop = c["crop"]
        if cfg.experiment == "blind_numeric_forecast":
            packet = build_blind_packet(crop, c["anchor"], h, dataset=ds)
        else:
            packet = build_packet(crop, c["anchor"], h, dataset=ds)
        leak = audit_packet(packet, dataset=ds)

        bser = baseline_series[h]
        brow = bser[(bser["crop"] == crop) & (bser["date"] == pd.Timestamp(c["anchor"]))]
        bmethod = best_rowwise_method(crop, h)
        bpoint = float(brow.iloc[0][bmethod]) if len(brow) and pd.notna(brow.iloc[0][bmethod]) else None
        pct = (float(brow.iloc[0]["expanding_price_percentile"])
               if len(brow) and pd.notna(brow.iloc[0].get("expanding_price_percentile")) else None)
        regime = ("low" if (pct is not None and pct < 1 / 3)
                  else "high" if (pct is not None and pct > 2 / 3) else "mid")

        schema = "residual" if cfg.residual_mode else "forecast"
        call = _call_once(provider, packet, bpoint, schema, cfg)
        rec = {
            "crop": crop, "horizon": h, "fold": c["fold"], "anchor": c["anchor"],
            "experiment": cfg.experiment, "schema": schema,
            "actual": c["actual"], "baseline_method": bmethod, "baseline_point": bpoint,
            "price_percentile": pct, "regime": regime,
            "provider": provider.name, "is_real_llm": provider.is_real_llm,
            "context_hash": call["context_hash"], "prompt_version": call["prompt_meta"]["prompt_version"],
            "prompt_hash": call["prompt_meta"]["prompt_hash"], "cache_hit": call["cache_hit"],
            "valid": call["valid"], "errors": ";".join(call["errors"]),
            "leakage_passed": leak["passed"],
            "temperature": cfg.temperature, "residual_mode": cfg.residual_mode,
        }
        if call["valid"] and call["payload"]:
            p = call["payload"]
            if schema == "forecast":
                rec.update({"point": float(p["point_forecast"]), "low": float(p["range_low"]),
                            "high": float(p["range_high"]), "direction": p["direction"],
                            "confidence": float(p["confidence"])})
            else:
                rec.update({"adjustment_pct": float(p["adjustment_pct"]),
                            "confidence": float(p["confidence"])})
        records.append(rec)

    df = pd.DataFrame(records)
    return {"records": df, "cases": len(cases), "cases_with_response": int(df["valid"].sum()),
            "provider": provider.describe()}


# ---------------------------------------------------------------- 指标
def point_metrics(records: pd.DataFrame) -> pd.DataFrame:
    rows = []
    ok = records[records["valid"] & records["point"].notna()] if "point" in records else records
    for (exp, h), sub in ok.groupby(["experiment", "horizon"]):
        base = sub.dropna(subset=["baseline_point"])
        m_llm = metrics_table(sub["actual"].values, sub["point"].values)
        m_base = metrics_table(base["actual"].values, base["baseline_point"].values) if len(base) else {}
        rows.append({"experiment": exp, "horizon": int(h), "n": len(sub),
                     "llm_WAPE": m_llm["WAPE"], "llm_MAE": m_llm["MAE"],
                     "llm_sMAPE": m_llm["sMAPE"],
                     "baseline_WAPE": m_base.get("WAPE"),
                     "delta_WAPE": (m_base.get("WAPE") - m_llm["WAPE"]) if m_base else None})
    return pd.DataFrame(rows)


def stability_test(provider: LLMProvider, cfg: ExperimentConfig, crop: str, horizon: int,
                   anchor: str, repeats: int = 4, dataset: Optional[pd.DataFrame] = None) -> Dict[str, Any]:
    ds = dataset if dataset is not None else load_frozen_dataset()
    packet = (build_blind_packet if cfg.experiment == "blind_numeric_forecast" else build_packet)(
        crop, anchor, horizon, dataset=ds)
    pts, dirs, los, his = [], [], [], []
    for _ in range(repeats):
        c = _call_once(provider, packet, None, "forecast", cfg)
        if c["valid"]:
            p = c["payload"]
            pts.append(float(p["point_forecast"])); dirs.append(p["direction"])
            los.append(float(p["range_low"])); his.append(float(p["range_high"]))
    return {"repeats": repeats, "n_ok": len(pts),
            "point_std": float(np.std(pts)) if pts else None,
            "point_cv": float(np.std(pts) / np.mean(pts)) if pts and np.mean(pts) else None,
            "direction_unique": sorted(set(dirs)),
            "range_std": float(np.std(np.array(his) - np.array(los))) if len(los) else None}


# ---------------------------------------------------------------- 残差边界（dev 学习）
def learn_max_adjustment(dataset: pd.DataFrame, crop: str, horizon: int,
                         train_end: str, q: float = 0.9) -> Dict[str, Any]:
    """由 **development 段**（严格 <= train_end）的统计 baseline 残差分布推出调整上限。"""
    tcol = primary_target_col(horizon)
    ds = add_long_horizon_targets(dataset, horizons=[horizon])
    bser = rowwise_baselines(ds, horizon)
    bmethod = best_rowwise_method(crop, horizon)
    sub = bser[(bser["crop"] == crop) & (bser["date"] <= pd.Timestamp(train_end))]
    sub = sub[sub[tcol].notna() & sub[bmethod].notna()]
    if not len(sub):
        return {"crop": crop, "horizon": horizon, "n": 0, "max_adjustment_pct": None}
    resid = np.abs(sub[tcol].values / sub[bmethod].values - 1.0) * 100.0
    return {"crop": crop, "horizon": horizon, "n": int(len(sub)),
            "max_adjustment_pct": float(np.percentile(resid, q * 100)),
            "median_abs_resid_pct": float(np.median(resid))}


__all__ = ["ExperimentConfig", "case_grid", "run_experiment", "point_metrics",
           "stability_test", "learn_max_adjustment", "best_rowwise_method",
           "CROPS", "LH_HORIZONS", "PILOT_HORIZONS"]