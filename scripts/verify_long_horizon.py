#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Long-Horizon 一致性门禁（只读；不训练、不改冻结产物）。

校验：
  1. Registry 行数 = 6 horizon × 10 作物，状态属登记枚举，150/180 必为探索级；
  2. 快照条目数一致，`low <= point <= high`，单位固定 CNY/kg，source 属登记枚举；
  3. 报告与交付物齐备（§41 的 7 份）。
缺失时给出**修复命令**（运行 Long-Horizon 预测 Job）而不是静默通过。
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REG = ROOT / "models" / "long_horizon" / "artifacts" / "LONG_HORIZON_REGISTRY.csv"
SNAP = ROOT / "data" / "processed" / "long_horizon" / "snapshots" / "latest.json"
DELIVERABLES = [
    "LONG_HORIZON_TARGET_STUDY.md",
    "LONG_HORIZON_MODEL_REPORT.md", "LONG_HORIZON_METRICS.csv", "LONG_HORIZON_REGISTRY.csv",
    "LLM_FORECAST_REPORT.md", "LLM_ABLATION_REPORT.md", "HYBRID_REPORT.md",
    "LONG_HORIZON_FREEZE_GATE.md",
]
STATUSES = {"PRODUCTION_POINT", "SCENARIO_ONLY", "EXPLORATORY_SCENARIO_ONLY"}
SOURCES = {"seasonal", "long_horizon_model", "scenario_only"}
HORIZONS = [30, 60, 90, 120, 150, 180]

problems: list[str] = []


def main() -> int:
    if not REG.exists() or not SNAP.exists():
        print("[verify_long_horizon] FAIL: 缺少 Registry 或快照。")
        print("  修复：PROJECT_ROOT=$PWD PYTHONPATH=models/src:models:. "
              "python3 -m long_horizon.run_long_horizon")
        return 1

    import pandas as pd  # noqa: PLC0415
    reg = pd.read_csv(REG)
    if len(reg) != len(HORIZONS) * 10:
        problems.append(f"Registry 行数 {len(reg)} != {len(HORIZONS) * 10}")
    if set(reg["production_status"]) - STATUSES:
        problems.append(f"Registry 出现未登记状态：{set(reg['production_status']) - STATUSES}")
    if set(reg["range_type"]) - {"scenario_range", "prediction_interval"}:
        problems.append("Registry 出现未登记 range_type")
    for h in (150, 180):
        sub = reg[reg["horizon"] == h]
        if len(sub) and set(sub["production_status"]) != {"EXPLORATORY_SCENARIO_ONLY"}:
            problems.append(f"horizon={h} 未标记为探索级")

    snap = json.loads(SNAP.read_text(encoding="utf-8"))
    entries = snap.get("entries", [])
    if snap.get("n_entries") != len(entries):
        problems.append("快照 n_entries 与 entries 长度不一致")
    if len(entries) != len(reg):
        problems.append(f"快照条目 {len(entries)} != Registry {len(reg)}")
    for e in entries:
        if e.get("unit") != "CNY/kg":
            problems.append(f"{e.get('crop')}@{e.get('horizon')} 单位非 CNY/kg")
        if e.get("forecast_source") not in SOURCES:
            problems.append(f"{e.get('crop')}@{e.get('horizon')} source 未登记")
        lo, hi, pt = e.get("range_low"), e.get("range_high"), e.get("point_forecast")
        if None not in (lo, hi, pt) and not (lo <= pt <= hi):
            problems.append(f"{e.get('crop')}@{e.get('horizon')} 区间不含点值")

    missing = [n for n in DELIVERABLES if not (ROOT / n).exists()]
    if missing:
        problems.append(f"缺少交付物：{missing}")

    if problems:
        print("[verify_long_horizon] FAIL")
        for p in problems:
            print("  -", p)
        return 1
    print(f"[verify_long_horizon] PASS :: registry={len(reg)} entries={len(entries)} "
          f"hash={snap.get('snapshot_hash')} as_of={snap.get('as_of')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())