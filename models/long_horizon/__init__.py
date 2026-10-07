# -*- coding: utf-8 -*-
"""AgriScope Long-Horizon 研究层（Phase 7+）。

与冻结的 `decision_engine.final`（Final Model，7/14/30 点预测）**完全隔离**：
本包只读冻结数据与已验证的 PIT 特征，新增 30–180d 的长期 target、baseline、
LLM context packet 与回测；不重训、不修改 Final 的算法/权重/产物。

设计约束（见 LONG_HORIZON_CONSTRUCTION_PLAN.md §0 全局门禁）：
  - 严格 point-in-time：任何 anchor 只见 <= anchor 的信息；
  - 数字全部由程序计算，禁止编造；
  - 样本不足一律如实标注（SCENARIO_ONLY / EXPLORATORY）。
"""
from __future__ import annotations

SEED = 42

__all__ = ["SEED"]