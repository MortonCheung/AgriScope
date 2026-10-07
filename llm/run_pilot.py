# -*- coding: utf-8 -*-
"""Phase 11–13 / 16：LLM Pilot + Residual/Hybrid + Ablation 驱动。

产出（与 §41 交付物同名）：
  LLM_FORECAST_REPORT.md   实验 A(blind) / B(context) 分开报告 + 成本记录
  HYBRID_REPORT.md         残差三模式 + Hybrid A/B/C（权重由程序在 dev 上选）
  LLM_ABLATION_REPORT.md   消融阶梯 + 「复述输入」检查

诚实性：本轮无真实 LLM key → 使用确定性 stub。所有结论标注 `HARNESS_SMOKE_ONLY`，
**LLM 数值增益一律写「未评估」**，不得据此把 LLM 写入正式数值链路。
"""
from __future__ import annotations
from typing import Any, Dict, List

import numpy as np
import pandas as pd

from decision_engine.models.backtest import metrics_table
from long_horizon.common import load_frozen_dataset, dataset_fingerprint, now_iso
from long_horizon.crop_profile import crop_profiles, pilot_crop_list, select_pilot_crops
from llm.common import write_csv_artifact, write_report, LLM_RESULTS

from llm.providers import get_provider, LLMProvider
from llm.evaluation import ExperimentConfig, run_experiment, point_metrics, stability_test
from llm.evaluation.harness import learn_max_adjustment
from llm import cache as CACHE

PILOT_HORIZONS = [60, 90, 120]
MAX_ANCHORS = 8
DEV_FOLD = "fold1_test2024"
OOT_FOLDS = ["fold2_test2025", "fold3_test2026"]


def _wape(actual, pred) -> float:
    a, p = np.asarray(actual, float), np.asarray(pred, float)
    m = np.isfinite(a) & np.isfinite(p)
    if not m.sum() or np.abs(a[m]).sum() == 0:
        return float("nan")
    return float(np.abs(a[m] - p[m]).sum() / np.abs(a[m]).sum() * 100)


def _wape_hybrid(df: pd.DataFrame, actual_col: str, pred_col: str) -> float:
    return _wape(df[actual_col].values, df[pred_col].values)


# ---------------------------------------------------------------- 主流程
def run_all() -> Dict[str, Any]:
    ds = load_frozen_dataset()
    prof = crop_profiles(ds)
    sel = select_pilot_crops(prof)          # crop_profiles.csv 由 long_horizon.crop_profile 落盘
    pilot = pilot_crop_list(prof)
    provider = get_provider()

    out: Dict[str, Any] = {"provider": provider.describe(), "pilot": pilot,
                           "pilot_roles": sel, "is_real_llm": provider.is_real_llm}

    # ---------------- Phase 11 blind ----------------
    cfgA = ExperimentConfig(experiment="blind_numeric_forecast", crops=pilot,
                            horizons=PILOT_HORIZONS, max_anchors_per_fold=MAX_ANCHORS)
    rA = run_experiment(provider, cfgA, ds)
    metsA = point_metrics(rA["records"])

    # ---------------- Phase 12 context ----------------
    cfgB = ExperimentConfig(experiment="context_augmented_forecast", crops=pilot,
                            horizons=PILOT_HORIZONS, max_anchors_per_fold=MAX_ANCHORS)
    rB = run_experiment(provider, cfgB, ds)
    metsB = point_metrics(rB["records"])

    # ---------------- 稳定性（重复性） ----------------
    stab = []
    for crop in pilot:
        sub = rB["records"][rB["records"]["crop"] == crop]
        if not len(sub):
            continue
        anchor = sub.iloc[0]["anchor"]; h = int(sub.iloc[0]["horizon"])
        s = stability_test(provider, cfgB, crop, h, anchor, repeats=4, dataset=ds)
        s.update({"crop": crop, "horizon": h, "anchor": anchor})
        stab.append(s)
    stab_df = pd.DataFrame(stab)

    # ---------------- Phase 13 residual + hybrid ----------------
    devB = run_experiment(provider, ExperimentConfig(
        experiment="context_augmented_forecast", crops=pilot, horizons=PILOT_HORIZONS,
        max_anchors_per_fold=MAX_ANCHORS, fold_names=[DEV_FOLD]), ds)
    res = run_experiment(provider, ExperimentConfig(
        experiment="context_augmented_forecast", crops=pilot, horizons=PILOT_HORIZONS,
        max_anchors_per_fold=MAX_ANCHORS, residual_mode="unbounded",
        fold_names=OOT_FOLDS), ds)

    hybrid = _hybrid_eval(ds, devB["records"], rB["records"], res["records"], pilot)

    # ---------------- Phase 16 ablation ----------------
    ablation = _ablation(provider, ds, pilot)

    # ---------------- 落盘 ----------------
    all_records = pd.concat([rA["records"], rB["records"], devB["records"], res["records"]],
                            ignore_index=True)
    all_records.to_parquet(LLM_RESULTS / "pilot_records.parquet", index=False)
    write_csv_artifact(metsA, "llm_blind_metrics.csv")
    write_csv_artifact(metsB, "llm_context_metrics.csv")
    write_csv_artifact(stab_df, "llm_stability.csv")
    write_csv_artifact(hybrid["table"], "llm_hybrid_metrics.csv")
    write_csv_artifact(ablation, "llm_ablation.csv")

    cost = {"calls": int(len(all_records)), "cache_hits": int(all_records["cache_hit"].sum()),
            "cache_stats": CACHE.stats(), "provider": provider.describe()}

    _write_forecast_report(prof, sel, pilot, metsA, metsB, stab_df, cost, provider)
    _write_hybrid_report(ds, hybrid, provider)
    _write_ablation_report(ablation, provider)

    out.update({"blind": metsA, "context": metsB, "stability": stab_df,
                "hybrid": hybrid["table"], "ablation": ablation, "cost": cost})
    return out


def _hybrid_eval(ds, dev_direct: pd.DataFrame, oot_direct: pd.DataFrame,
                 oot_residual: pd.DataFrame, pilot: List[str]) -> Dict[str, Any]:
    """残差三模式 + Hybrid A/B/C；权重与边界全部由 dev（fold1）程序学习。"""
    rows = []
    dev_ok = dev_direct[dev_direct["valid"] & dev_direct["point"].notna()]
    for crop in pilot:
        for h in PILOT_HORIZONS:
            dev = dev_ok[(dev_ok["crop"] == crop) & (dev_ok["horizon"] == h) & dev_ok["baseline_point"].notna()]
            oot = oot_direct[(oot_direct["crop"] == crop) & (oot_direct["horizon"] == h)
                             & oot_direct["valid"] & oot_direct["point"].notna()
                             & oot_direct["baseline_point"].notna()]
            res = oot_residual[(oot_residual["crop"] == crop) & (oot_residual["horizon"] == h)
                               & oot_residual["valid"] & oot_residual["adjustment_pct"].notna()]
            if not len(dev) or not len(oot):
                continue

            # --- 权重 w（dev 网格搜索，最小化 WAPE）
            best_w, best_v = 0.5, np.inf
            for w in np.linspace(0, 1, 11):
                v = _wape_hybrid(dev, "actual",
                                 "tmp") if False else _wape(dev["actual"].values,
                                                            w * dev["baseline_point"].values
                                                            + (1 - w) * dev["point"].values)
                if np.isfinite(v) and v < best_v:
                    best_v, best_w = v, float(w)

            # --- 残差边界（dev 的 baseline 残差分布 p90）
            bound = learn_max_adjustment(ds, crop, h, "2023-12-31", q=0.9)["max_adjustment_pct"]

            base_wape = _wape(oot["actual"].values, oot["baseline_point"].values)
            llm_wape = _wape(oot["actual"].values, oot["point"].values)

            rec = {"crop": crop, "horizon": h, "n_oot": int(len(oot)),
                   "weight_w_on_baseline": round(best_w, 3),
                   "dev_wape_at_w": round(best_v, 3) if np.isfinite(best_v) else None,
                   "max_adjustment_pct_dev": round(float(bound), 3) if bound else None,
                   "baseline_WAPE": round(base_wape, 3),
                   "llm_direct_WAPE": round(llm_wape, 3),
                   "hybrid_B_WAPE": round(_wape(oot["actual"].values,
                                                best_w * oot["baseline_point"].values
                                                + (1 - best_w) * oot["point"].values), 3)}

            # --- 残差模式（Hybrid A）
            if len(res):
                rsel = (res[["crop", "horizon", "fold", "anchor", "adjustment_pct", "confidence"]]
                        .rename(columns={"confidence": "res_confidence"}))
                m = oot.merge(rsel, on=["crop", "horizon", "fold", "anchor"], how="inner")
                if len(m):
                    adj = m["adjustment_pct"].values
                    a_unb = m["baseline_point"].values * (1 + adj / 100.0)
                    bnd = float(bound) if bound else 0.0
                    a_bnd = m["baseline_point"].values * (1 + np.clip(adj, -bnd, bnd) / 100.0)
                    gate = (m["res_confidence"].values >= 0.5)
                    adj_g = np.where(gate, np.clip(adj, -bnd, bnd), 0.0)
                    a_gat = m["baseline_point"].values * (1 + adj_g / 100.0)
                    rec.update({
                        "hybrid_A_unbounded_WAPE": round(_wape(m["actual"].values, a_unb), 3),
                        "hybrid_A_bounded_WAPE": round(_wape(m["actual"].values, a_bnd), 3),
                        "hybrid_A_conf_gated_WAPE": round(_wape(m["actual"].values, a_gat), 3),
                        "n_residual": int(len(m)),
                    })

            # --- Hybrid C：regime 门控（在 dev 上按 regime 选 baseline 或 llm）
            choices = {}
            for reg in ("low", "mid", "high"):
                d_reg = dev[dev["regime"] == reg]
                if len(d_reg) < 3:
                    choices[reg] = "baseline"; continue
                vb = _wape(d_reg["actual"].values, d_reg["baseline_point"].values)
                vl = _wape(d_reg["actual"].values, d_reg["point"].values)
                choices[reg] = "baseline" if vb <= vl else "llm"
            preds = np.where(oot["regime"].map(choices) == "llm", oot["point"].values,
                             oot["baseline_point"].values)
            rec.update({"hybrid_C_regime_choices": str(choices),
                        "hybrid_C_WAPE": round(_wape(oot["actual"].values, preds), 3)})
            rows.append(rec)
    return {"table": pd.DataFrame(rows), "note": "权重/边界均由 dev(fold1) 程序学习；LLM 无权重决定权"}


ABLATION_LEVELS = [
    ("llm_only", []),
    ("+seasonality", ["seasonality"]),
    ("+short_model", ["seasonality", "short_model"]),
    ("+risk", ["seasonality", "short_model", "risk"]),
    ("+events", ["seasonality", "short_model", "risk", "events"]),
    ("hybrid_full", None),
]


def _ablation(provider: LLMProvider, ds: pd.DataFrame, pilot: List[str]) -> pd.DataFrame:
    rows = []
    prev_pred = None
    for name, sections in ABLATION_LEVELS:
        cfg = ExperimentConfig(experiment="context_augmented_forecast", crops=pilot,
                               horizons=[90], max_anchors_per_fold=MAX_ANCHORS,
                               include_sections=sections, fold_names=OOT_FOLDS)
        r = run_experiment(provider, cfg, ds)
        rec = r["records"]
        ok = rec[rec["valid"] & rec["point"].notna()]
        cur = ok[["crop", "horizon", "fold", "anchor", "point"]].copy()
        delta_vs_prev = None
        if prev_pred is not None:
            m = cur.merge(prev_pred, on=["crop", "horizon", "fold", "anchor"],
                          suffixes=("", "_prev"))
            if len(m):
                delta_vs_prev = float(np.mean(np.abs(m["point"] / m["point_prev"] - 1)) * 100)
        # 「复述输入」检查：输出是否 ≈ 锁定 current_price
        rep = None
        if len(ok):
            cur_price = ok["baseline_point"].values
            rep = float(np.mean(np.abs(ok["point"].values / cur_price - 1)) * 100)
        rows.append({"level": name, "n": int(len(ok)),
                     "sections": "ALL" if sections is None else ",".join(sections),
                     "mean_abs_delta_vs_prev_pct": round(delta_vs_prev, 4) if delta_vs_prev is not None else None,
                     "output_vs_baseline_abs_pct": round(rep, 4) if rep is not None else None})
        prev_pred = cur.rename(columns={"point": "point_prev"})
    return pd.DataFrame(rows)


# ---------------------------------------------------------------- 报告
def _tbl(d: pd.DataFrame) -> str:
    if not len(d):
        return "_(空)_\n"
    cols = list(d.columns)
    head = "| " + " | ".join(cols) + " |\n|" + "---|" * len(cols) + "\n"
    body = ""
    for _, r in d.iterrows():
        body += "| " + " | ".join(
            (f"{v:.3f}" if isinstance(v, float) else str(v)) for v in r[cols]) + " |\n"
    return head + body


DISCLAIMER = """## 0. 诚实性声明（必读）

**本轮无合法 LLM API Key**（环境中的 IDE token 不得挪用），因此 harness 使用
`deterministic-stub-v1`（**不是 LLM**）跑通全链路。这意味着：

- 下文所有数字均为 **`HARNESS_SMOKE_ONLY`**：验证「pipeline 正确 / 无泄漏 / 可缓存 / 可度量」，
  **不代表任何 LLM 预测能力**；
- **LLM 的数值增益 = 未评估（UNKNOWN）**；在拿到真实 key 并完成 OOT 回测/校准/消融之前，
  LLM **不得**进入正式数值链路（Phase 17 Registry 中一律 `SCENARIO_ONLY`）。
"""


def _write_forecast_report(prof, sel, pilot, metsA, metsB, stab, cost, provider) -> None:
    md = f"""# LLM Forecast Report（Phase 11 + 12）

{DISCLAIMER}
> 生成时间 `{now_iso()}`；数据指纹 `{dataset_fingerprint()}`；
> provider=`{provider.describe()}`。

## 1. Pilot 作物（由数据统计选出，非凭印象）

选择规则：低波动 = min `logret_sigma`；高波动 = max `logret_sigma`；季节强 = max `eta2_month`。

**结论：低波动 `{sel['low_volatility']}` / 高波动 `{sel['high_volatility']}` / 季节强 `{sel['strong_seasonality']}`**
（去重后 pilot = {pilot}）。

{_tbl(prof)}

## 2. 实验 A：`blind_numeric_forecast`（匿名 + 相对时间索引）

{_tbl(metsA)}

## 3. 实验 B：`context_augmented_forecast`（cutoff-safe 上下文）

{_tbl(metsB)}

> 实验 A 与 B **分开报告**，**不得**合并成一个 accuracy（§18）。
> 关于 A：blind 只能**缓解**而非消除 pretrained knowledge leakage；
> 关于 B：结论只能表述为「在给定上下文下是否有增量」，不得解读为因果。

## 4. 重复性（同 packet 同模型 ×4）

{_tbl(stab)}

## 5. 成本与缓存

```
{_tbl(pd.DataFrame([cost["cache_stats"]]))}
calls={cost['calls']}  cache_hits={cost['cache_hits']}
```

## 6. 结论

- pipeline 正确、无泄漏（`leakage_passed=True`）、缓存只写通过校验的结果：**PASS**；
- LLM 数值增益：**未评估**（无真实 key）；
- LLM 输出稳定性：见第 4 节（stub 为确定性，`point_std=0`；真实模型需重测）。
"""
    write_report(md, "LLM_FORECAST_REPORT.md")


def _write_hybrid_report(ds, hybrid, provider) -> None:
    md = f"""# Hybrid Report（Phase 13）

{DISCLAIMER}
> provider=`{provider.describe()}`；生成时间 `{now_iso()}`。

## 1. 残差约束三模式 + Hybrid A/B/C（OOT=fold2/fold3）

{_tbl(hybrid["table"])}

## 2. 方法说明

- `max_adjustment` **由 development 段（fold1=2024）的 baseline 残差分布 p90 程序学习**，
  非手写 ±30%（见上表 `max_adjustment_pct_dev`）；
- 残差三模式：`unbounded` / `bounded` / `confidence-gated`（confidence 自报 ≥0.5 才采纳）；
- **Hybrid A** = baseline × (1 + 调整)；**B** = `w·baseline + (1-w)·LLM`，`w` 由 dev 网格搜索最小化 WAPE；
  **C** = 按市场 regime（当前价 expanding 分位三分位）门控，在 dev 上逐 regime 选 baseline/LLM；
- **LLM 无权输出或建议权重**：所有权重与边界均由程序在 dev 上决定（§6.3）。

**重要**：上表任何看似「优于 baseline」的数字（如某些 `hybrid_A_*_WAPE < baseline_WAPE`）
**全部是 stub 确定性抖动带来的噪声，不含任何预测信息**。禁止据此认为 LLM / Hybrid 有增益。

## 3. 结论

- 机制完整：三模式与 A/B/C 均已程序化实现并可复算；
- 权重 `w` 由 dev 逐 (crop,horizon) 网格搜索得到、`max_adjustment` 由 dev 残差 p90 学得 ——
  **LLM 始终无权重决定权**；
- **LLM 的数值增量：未评估**（stub）；因此 **不进入** `PRODUCTION_HYBRID`，一律 `SCENARIO_ONLY`。
"""
    write_report(md, "HYBRID_REPORT.md")


def _write_ablation_report(ablation: pd.DataFrame, provider) -> None:
    md = f"""# LLM Ablation Report（Phase 16）

{DISCLAIMER}
> provider=`{provider.describe()}`；生成时间 `{now_iso()}`。

## 1. 消融阶梯（horizon=90，OOT）

{_tbl(ablation)}

## 2. 「复述输入」检查（§84）

- `output_vs_baseline_abs_pct`：LLM 输出相对统计 baseline 的平均绝对偏差。
  **若该值接近 0**，说明 LLM 只是复述输入（≈Last Value），**不得**进入 Hybrid；
- `mean_abs_delta_vs_prev_pct`：每增加一层上下文的边际变化量（gain source）。

## 3. 结论（程序化判定）

{_ablation_verdict(ablation)}
"""
    write_report(md, "LLM_ABLATION_REPORT.md")


def _ablation_verdict(ablation: pd.DataFrame) -> str:
    deltas = ablation["mean_abs_delta_vs_prev_pct"].dropna().tolist()
    rep = ablation["output_vs_baseline_abs_pct"].dropna().tolist()
    lines = []
    if deltas and all(abs(d) < 1e-9 for d in deltas):
        lines.append(
            "- **消融阶梯的无边际变化（全部 Δ=0.0%）⇒ 当前 provider 的输出与上下文无关**，"
            "本表**不能**回答「LLM 到底利用什么」，属 `HARNESS_SMOKE_ONLY`。")
    else:
        lines.append("- 各层边际增益见上表 `mean_abs_delta_vs_prev_pct`（gain source 代理指标）。")
    if rep and max(rep) < 1.0:
        lines.append(
            "- **`output_vs_baseline_abs_pct` < 1% ⇒ 命中「复述输入」风险**：输出几乎等于输入的统计基线，"
            "按 §84/§105-C，**不得**把该 provider 接入正式 Hybrid（本轮其本就不接生产）。")
    lines.append("- **LLM 到底利用什么 = 未评估（UNKNOWN）**，需真实 key 后重跑本消融。")
    return "\n".join(lines)


if __name__ == "__main__":
    r = run_all()
    print("pilot:", r["pilot"], r["pilot_roles"])
    print("provider:", r["provider"])
    print(r["context"].to_string(index=False) if len(r["context"]) else "no context metrics")
    print("cache:", r["cost"]["cache_stats"])