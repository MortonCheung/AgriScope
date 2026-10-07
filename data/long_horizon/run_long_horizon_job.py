# -*- coding: utf-8 -*-
"""Phase 18：Long-Horizon Forecast Job（**独立**于 Daily 采集逻辑；Option B 预生成）。

- 输入：冻结数据 + Registry 选定方法（`models/long_horizon/artifacts/LONG_HORIZON_REGISTRY.csv`）；
- 输出：`data/processed/long_horizon/snapshots/{as_of}.json` + `latest.json`（原子写、哈希、不倒退）；
- 严格只读，不触发抓取；LLM 失败不影响本 Job（本轮 LLM 不参与数值链路）。

确定性：固定 seed；`snapshot_hash` 剔除 `generated_at` 等易变字段。
"""
from __future__ import annotations
import json
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from decision_engine.common import ROOT, ensure_dir
from long_horizon.common import (load_frozen_dataset, LONG_HORIZONS, CROPS,
                                 LH_ARTIFACTS, now_iso)
from long_horizon.baselines import rowwise_baselines, trained_factories
from long_horizon.targets import add_long_horizon_targets
from long_horizon.target_definition import primary_target_col
from llm.common import stable_hash

SNAPSHOT_DIR = ROOT / "data" / "processed" / "long_horizon" / "snapshots"
SCHEMA = "lh_forecast_v1"

SEASONAL_METHODS = {"b_seaonal_naive_365", "b_seasonal_naive_365",
                    "b_same_season_mean", "b_same_season_median", "b_last_value"}


# ---------------------------------------------------------------- 预测器
def _registry() -> pd.DataFrame:
    p = LH_ARTIFACTS / "LONG_HORIZON_REGISTRY.csv"
    if not p.exists():
        raise FileNotFoundError(f"缺少 Registry：{p}")
    return pd.read_csv(p)


_RB_CACHE: Dict[int, pd.DataFrame] = {}


def _rb(horizon: int, full: pd.DataFrame) -> pd.DataFrame:
    """rowwise baseline 全表（逐 horizon 只算一次；每行只用自己的过去，无泄漏）。"""
    if horizon not in _RB_CACHE:
        _RB_CACHE[horizon] = rowwise_baselines(full, horizon)
    return _RB_CACHE[horizon]


def _rowwise_at(full: pd.DataFrame, crop: str, horizon: int, method: str,
                anchor: pd.Timestamp) -> Optional[float]:
    rb = _rb(horizon, full)
    row = rb[(rb["crop"] == crop) & (rb["date"] == anchor)]
    if not len(row):
        return None
    v = row.iloc[0].get(method)
    return float(v) if v is not None and pd.notna(v) else None


def _fit_predict(df_hist: pd.DataFrame, full: pd.DataFrame, crop: str, horizon: int,
                 method: str, anchor: pd.Timestamp) -> Optional[float]:
    """按 Registry 选定方法给出 anchor 处的点预测（只使用 <= anchor 的数据）。"""
    if method.startswith("b_"):
        return _rowwise_at(full, crop, horizon, method, anchor)
    if method.startswith("m_"):
        key = method[2:]
        facs = trained_factories()
        if key not in facs:
            return None
        tcol = primary_target_col(horizon)
        sub = df_hist[(df_hist["crop"] == crop) & (df_hist[tcol].notna())]
        sub = sub[sub["date"] <= anchor]
        row = df_hist[(df_hist["crop"] == crop) & (df_hist["date"] == anchor)]
        if len(sub) < 200 or not len(row):
            return None
        from decision_engine.final.models import FINAL_FEATURE_COLS
        m = facs[key]()
        m.fit(sub[FINAL_FEATURE_COLS], sub[tcol])
        return float(m.predict(row[FINAL_FEATURE_COLS])[0])
    return None


def _dev_ratio_band(full: pd.DataFrame, crop: str, horizon: int,
                    method: str) -> Optional[Dict[str, float]]:
    """场景区间带：用 **development 折（fold1=2024）** 的残差比 [q10,q90]。"""
    from decision_engine.models.backtest import FOLDS, fold_mask
    tcol = primary_target_col(horizon)
    ds = add_long_horizon_targets(full, horizons=[horizon])
    if method.startswith("b_"):
        rb = _rb(horizon, full)
        sub = rb[rb["crop"] == crop][["date", method]]
        sub = sub.merge(ds.loc[ds["crop"] == crop, ["date", tcol]], on="date", how="inner")
        preds_all = sub.rename(columns={method: "prediction"})
        preds_all = preds_all[preds_all["prediction"].notna()]
        # rowwise baseline 对每行都有值；用 fold1 的测试窗作为 dev
        _, te = fold_mask(ds[ds["crop"] == crop], FOLDS[0])
        dates = set(pd.to_datetime(ds[ds["crop"] == crop][te]["date"]))
        dev = preds_all[preds_all["date"].isin(dates)]
    else:
        # 训练型：用 fold1 的 OOT 预测（与 Registry 同口径）
        dev = _trained_dev_predictions(ds, crop, horizon, method)

    dev = dev[dev["prediction"].notna() & (dev["prediction"] > 0)]
    if len(dev) < 20:
        return None
    ratio = dev[tcol].values / dev["prediction"].values
    # 保证区间包含点值（点=预测值本身）：比值带必须跨过 1.0
    return {"q10": float(min(np.percentile(ratio, 10), 1.0)),
            "q90": float(max(np.percentile(ratio, 90), 1.0)),
            "n_dev": int(len(dev))}


def _trained_dev_predictions(ds: pd.DataFrame, crop: str, horizon: int,
                             method: str) -> pd.DataFrame:
    from decision_engine.models.backtest import FOLDS, fold_mask
    from decision_engine.final.models import FINAL_FEATURE_COLS
    tcol = primary_target_col(horizon)
    key = method[2:]
    facs = trained_factories()
    if key not in facs:
        return pd.DataFrame(columns=["date", tcol, "prediction"])
    sub = ds[ds["crop"] == crop]
    fold = FOLDS[0]
    tr_all, te_all = fold_mask(sub, fold)
    tr = sub[tr_all.loc[sub.index] & sub[tcol].notna()]
    te = sub[te_all.loc[sub.index] & sub[tcol].notna()]
    if len(tr) < 200 or not len(te):
        return pd.DataFrame(columns=["date", tcol, "prediction"])
    m = facs[key]()
    m.fit(tr[FINAL_FEATURE_COLS], tr[tcol])
    return pd.DataFrame({"date": pd.to_datetime(te["date"]).values, tcol: te[tcol].values,
                         "prediction": m.predict(te[FINAL_FEATURE_COLS])})


# ---------------------------------------------------------------- 主构建
def build(as_of: Optional[str] = None) -> Dict[str, Any]:
    ds = load_frozen_dataset()
    reg = _registry()
    cutoffs = ds.groupby("crop")["date"].max()
    default_anchor = pd.Timestamp(cutoffs.max())
    anchor_by_crop = {c: pd.Timestamp(v) for c, v in cutoffs.items()}
    as_of = as_of or str(default_anchor.date())

    ds_h = {h: add_long_horizon_targets(ds, horizons=[h]) for h in LONG_HORIZONS}

    entries: List[Dict[str, Any]] = []
    for crop in CROPS:
        anchor = anchor_by_crop[crop]
        hist = ds[ds["date"] <= anchor]
        for h in LONG_HORIZONS:
            r = reg[(reg["crop"] == crop) & (reg["horizon"] == h)]
            if not len(r):
                continue
            r = r.iloc[0]
            method = str(r["method"])
            point = _fit_predict(ds_h[h][ds_h[h]["date"] <= anchor], ds, crop, h, method, anchor)
            band = _dev_ratio_band(ds, crop, h, method)
            entry: Dict[str, Any] = {
                "crop": crop, "horizon": h, "method": method,
                "production_status": r["production_status"],
                "confidence": r["confidence"], "range_type": r["range_type"],
                "unit": "CNY/kg",
                "point_forecast": round(point, 4) if point is not None else None,
                "anchor_observation_date": str(anchor.date()),
                "available": bool(point is not None),
                "reason": (None if point is not None else "model_unavailable_at_cutoff"),
            }
            if point is not None and band:
                entry.update({
                    "range_low": round(point * band["q10"], 4),
                    "range_high": round(point * band["q90"], 4),
                    "range_band_source": "dev_fold1_residual_ratio_q10_q90",
                    "range_dev_n": band["n_dev"],
                })
            else:
                entry.update({"range_low": None, "range_high": None})
            # 模型分歧（程序计算：与 last_value / 同季均值 的相对离散）
            lv = _rowwise_at(ds, crop, h, "b_last_value", anchor)
            sm = _rowwise_at(ds, crop, h, "b_same_season_mean", anchor)
            vals = [v for v in [point, lv, sm] if v is not None]
            entry["model_disagreement_pct"] = (round(float(np.std(vals) / np.mean(vals) * 100), 3)
                                               if len(vals) >= 2 and np.mean(vals) else None)
            entry["fallback_used"] = False
            entry["forecast_source"] = ("scenario_only"
                                        if r["production_status"] != "PRODUCTION_POINT"
                                        else ("seasonal" if method in SEASONAL_METHODS
                                              else "long_horizon_model"))
            entries.append(entry)

    snap: Dict[str, Any] = {
        "schema_version": SCHEMA, "city": "沈阳", "as_of": as_of,
        "market_as_of": as_of, "cutoff": as_of,
        "model_version": "long_horizon_v1",
        "data_version": "final_v1",
        "unit": "CNY/kg",
        "horizons": LONG_HORIZONS,
        "n_entries": len(entries),
        "entries": entries,
        "notes": [
            "Long-Horizon 输出为 N 天窗口均价的情景化估计（target=full），不是第 N 天点位。",
            "range_type=scenario_range 表示未经校准，不得称 prediction interval。",
            "150/180 为探索级。LLM 不参与本快照数值。",
            "本快照基于冻结 Final 数据（anchor=冻结数据最新观测日）；Daily 更新后需重跑本 Job 才能同步。",
            "本 Job 独立于 Daily 采集链路；LLM 不可用不影响本快照生成。",
        ],
    }
    snap["snapshot_hash"] = stable_hash(snap, n=32)
    return snap


def write_snapshot(snap: Dict[str, Any]) -> Dict[str, Any]:
    ensure_dir(SNAPSHOT_DIR)
    payload = dict(snap)
    payload["generated_at"] = now_iso()
    target = SNAPSHOT_DIR / f"{snap['as_of']}.json"
    # 原子写
    fd, tmp = tempfile.mkstemp(dir=str(SNAPSHOT_DIR), suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp, target)
    # latest.json 不倒退
    latest = SNAPSHOT_DIR / "latest.json"
    write_latest = True
    if latest.exists():
        try:
            cur = json.loads(latest.read_text(encoding="utf-8"))
            write_latest = str(payload["as_of"]) >= str(cur.get("as_of", ""))
        except Exception:  # noqa: BLE001
            write_latest = True
    if write_latest:
        fd, tmp = tempfile.mkstemp(dir=str(SNAPSHOT_DIR), suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        os.replace(tmp, latest)
    return {"path": str(target), "latest_written": write_latest,
            "snapshot_hash": snap["snapshot_hash"], "n_entries": snap["n_entries"]}


if __name__ == "__main__":
    s = build()
    print(write_snapshot(s))
    print("entries:", s["n_entries"], "| hash:", s["snapshot_hash"])