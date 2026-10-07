# -*- coding: utf-8 -*-
"""Backend 配置：路径、版本、CORS。

硬约束：
  - ROOT 由本文件位置推导（可用 AGRISCOPE_ROOT 覆盖），禁止硬编码 Mac 路径；
  - canonical 数据（models/data/**、data/model_ready/**）只读；
  - 不做任何数据改写。

对应任务文档 §63（禁止硬编码本机路径）。
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import List


def _resolve_root() -> Path:
    env = os.environ.get("AGRISCOPE_ROOT")
    if env:
        return Path(env).resolve()
    # backend/app/config.py -> parents[0]=app, [1]=backend, [2]=项目根
    return Path(__file__).resolve().parents[2]


ROOT = _resolve_root()

# ---------------------------------------------------------------- 只读输入
MODELS_DIR = ROOT / "models"
MODEL_SRC = MODELS_DIR / "src"                                  # decision_engine 包所在目录
FINAL_REPORTS_DIR = MODELS_DIR / "reports" / "final"            # 冻结报告（只读）
FINAL_RUN_META = FINAL_REPORTS_DIR / "FINAL_RUN_META.json"
FINAL_MODELS_DIR = MODELS_DIR / "models" / "final"              # 冻结 pkl（只读）
FINAL_SNAPSHOT_DIR = MODELS_DIR / "data" / "snapshots" / "final_v1"

# Daily 冻结产物（只读）
DAILY_PROCESSED_DIR = ROOT / "data" / "processed" / "daily"
DAILY_SNAPSHOT_DIR = DAILY_PROCESSED_DIR / "snapshots"
DAILY_LATEST = DAILY_SNAPSHOT_DIR / "latest.json"
DAILY_MONITOR = DAILY_PROCESSED_DIR / "monitor" / "status.json"

# Daily 持有的「冻结模型 + 实时输入」快照工作区（运行时优先）
EXTENDED_SNAPSHOT_DIR = DAILY_PROCESSED_DIR / "final_input" / "extended_snapshot"
EXTENDED_FINGERPRINT = EXTENDED_SNAPSHOT_DIR / ".source_fingerprint.json"

# Long-Horizon（独立预测 Job 的预生成产物，只读；由 data/long_horizon 生成）
LH_PROCESSED_DIR = ROOT / "data" / "processed" / "long_horizon"
LH_SNAPSHOT_DIR = LH_PROCESSED_DIR / "snapshots"
LH_LATEST = LH_SNAPSHOT_DIR / "latest.json"
LH_REGISTRY = ROOT / "LONG_HORIZON_V2_REGISTRY.csv"

# ---------------------------------------------------------------- 服务参数
API_TITLE = "AgriScope Decision API"
API_VERSION = "1.0.0"
API_DESCRIPTION = (
    "AgriScope 后端：把已冻结的 Final Model（推理）与 Daily（市场脉搏）"
    "收口为前端可直接调用的 HTTP 契约。只读 canonical 数据，不改算法、不重训。"
)

DEFAULT_HOST = os.environ.get("AGRISCOPE_API_HOST", "127.0.0.1")
DEFAULT_PORT = int(os.environ.get("AGRISCOPE_API_PORT", "8000"))

# 推理串行化：单 worker + 全局锁（Final 引擎使用模块级/类级缓存，禁止请求级改写全局）
INFERENCE_LOCK_ENABLED = os.environ.get("AGRISCOPE_INFERENCE_LOCK", "1") != "0"

# 运行时快照策略：auto = 优先 extended_snapshot（指纹兼容），否则冻结 final_v1
SNAPSHOT_POLICY = os.environ.get("AGRISCOPE_SNAPSHOT_POLICY", "auto")  # auto | frozen


def allowed_origins() -> List[str]:
    raw = os.environ.get("ALLOWED_ORIGINS", "")
    return [o.strip() for o in raw.split(",") if o.strip()]
