# -*- coding: utf-8 -*-
"""冻结的正式 Long-Horizon Target 定义（由 Phase 7 程序化判定得出）。

判定依据：`reports/LONG_HORIZON_TARGET_STUDY.md`（5 种候选口径 × 4 个 horizon × 3 组 baseline）。
结论：`full` —— 未来 (t, t+N] 内已有观测的均价，**与现有 Final 短期目标
`target_mean_price_next_{N}d` 完全同口径**，是它向长期的自然延伸。

禁止在无新证据时改动本常量；改动必须重跑 target_study 并更新报告。
"""
from __future__ import annotations

from .targets import target_col_name

PRIMARY_TARGET_KIND = "full"          # Phase 7 程序化判定结果（decision_score 最低且显著）
PRIMARY_TARGET_WINDOW = None          # full 无尾窗


def primary_target_col(horizon: int) -> str:
    """正式长期 target 列名。"""
    return target_col_name(PRIMARY_TARGET_KIND, horizon, PRIMARY_TARGET_WINDOW)


__all__ = ["PRIMARY_TARGET_KIND", "PRIMARY_TARGET_WINDOW", "primary_target_col"]