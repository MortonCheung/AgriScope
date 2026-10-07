# -*- coding: utf-8 -*-
"""Long-Horizon 一键重建入口（Phase 7 → 17，只读/可复算；不训练 Final、不改冻结产物）。

用法：
  PYTHONPATH=models/src:models:. python3 -m long_horizon.run_long_horizon

阶段：
  1. target_study   Phase 7 目标研究（含端点/窗口口径对照）
  2. baselines      Phase 8 + 15 长期 baseline 与 walk-forward 指标
  3. crop_profile   作物画像 + pilot 作物程序化选择
  4. registry       Phase 17 Production Selection + Registry + Method Map
  5. llm_pilot      Phase 11-13/16 LLM harness（无 key 时自动用 stub，标注未评估）
  6. job            Phase 18 预生成长期快照

幂等：同一数据 + 同 seed → 相同输出（快照 snapshot_hash 可复现）。
"""
from __future__ import annotations
import sys
from typing import List


def run(stages: List[str] | None = None) -> dict:
    stages = stages or ["target_study", "baselines", "crop_profile", "registry", "llm_pilot", "job"]
    out = {}
    if "target_study" in stages:
        from .target_study import run_study
        out["target_study"] = run_study()["winner"]
        print("[1/6] target_study ->", out["target_study"], flush=True)
    if "baselines" in stages:
        from .run_baselines import run as rb
        out["baselines"] = rb()
        print("[2/6] baselines ->", out["baselines"]["metrics_rows"], "rows", flush=True)
    if "crop_profile" in stages:
        from .crop_profile import crop_profiles, select_pilot_crops, pilot_crop_list
        prof = crop_profiles()
        from .common import write_csv_artifact
        write_csv_artifact(prof, "crop_profiles.csv")
        out["pilot"] = select_pilot_crops(prof)
        out["pilot_list"] = pilot_crop_list(prof)
        print("[3/6] crop_profile -> pilot", out["pilot_list"], flush=True)
    if "registry" in stages:
        from .registry import build_registry
        out["registry"] = build_registry()["rows"]
        print("[4/6] registry ->", out["registry"], "rows", flush=True)
    if "llm_pilot" in stages:
        from llm.run_pilot import run_all as pilot
        r = pilot()
        out["llm_provider"] = r["provider"]
        print("[5/6] llm_pilot -> provider", r["provider"], flush=True)
    if "job" in stages:
        from data.long_horizon.run_long_horizon_job import build, write_snapshot
        out["job"] = write_snapshot(build())
        print("[6/6] job ->", out["job"], flush=True)
    return out


if __name__ == "__main__":
    args = sys.argv[1:]
    print(run(args or None))