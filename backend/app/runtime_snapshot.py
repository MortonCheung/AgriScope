# -*- coding: utf-8 -*-
"""运行时快照绑定（安全集成方式）。

背景（审计发现的两处风险）：
  R1. `decision_engine/common.py` 的 ROOT 为本机绝对路径 → 服务器上路径错误。
  R2. Final 引擎使用**模块级** SNAPSHOT_DIR 与**类级/模块级**缓存
      （inference._Data.*、artifacts._CACHE）。若在请求级改写全局 → 并发不安全。

本模块的解法（零改动冻结代码）：
  1. 先 import `decision_engine.common`，若是外部 ROOT 则校正 cm.ROOT / cm.DE，
     **再** import `decision_engine.final.*`，使其派生的路径常量一次性正确。
  2. 在**进程启动时绑定一次**运行时快照目录，并把它写入所有 final 子模块的
     SNAPSHOT_DIR。之后不再改动 → 请求级只读，天然并发安全。
  3. 快照选择：优先 Daily 的 extended_snapshot（其 .source_fingerprint.json 需与
     当前 Final 的 code_fingerprint / model_version 兼容）；否则回退冻结 final_v1，
     并标记 runtime_data_status=FROZEN_FALLBACK。

Daily 更新后需由进程管理器（systemd）重启后端以重新绑定。
"""
from __future__ import annotations

import json
import sys
from typing import Any, Dict, Optional

from . import config as C

_STATE: Dict[str, Any] = {
    "bound": False,
    "snapshot_dir": None,
    "runtime_data_status": "UNBOUND",
    "runtime_data_version": None,
    "source": None,
    "reason": None,
    "final_versions": {},
}


def _ensure_model_src() -> None:
    if str(C.MODEL_SRC) not in sys.path:
        sys.path.insert(0, str(C.MODEL_SRC))


def read_final_versions() -> Dict[str, Any]:
    """从冻结 RUN_META 读取真实版本（禁止硬编码）。"""
    try:
        meta = json.loads(C.FINAL_RUN_META.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        meta = {}
    return {
        "model_version": meta.get("model_version") or "UNKNOWN",
        "data_version": meta.get("data_version") or "UNKNOWN",
        "code_fingerprint": meta.get("code_fingerprint") or "UNKNOWN",
        "final_generated_at": meta.get("generated_at"),
    }


def _extended_fingerprint() -> Optional[Dict[str, Any]]:
    try:
        return json.loads(C.EXTENDED_FINGERPRINT.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return None


def _extended_compatible(cur: Dict[str, Any]) -> bool:
    """extended_snapshot 必须由**当前**冻结 Final 生成（指纹/版本一致）。"""
    fp = _extended_fingerprint()
    if not fp:
        return False
    if not C.EXTENDED_SNAPSHOT_DIR.exists():
        return False
    return (fp.get("code_fingerprint") == cur.get("code_fingerprint")
            and fp.get("model_version") == cur.get("model_version"))


def _choose_snapshot(cur: Dict[str, Any]):
    if C.SNAPSHOT_POLICY == "frozen":
        return C.FINAL_SNAPSHOT_DIR, "FROZEN_FALLBACK", "policy=frozen"
    if _extended_compatible(cur):
        return C.EXTENDED_SNAPSHOT_DIR, "LIVE", None
    reason = "extended_snapshot 缺失或指纹与当前 Final 不兼容"
    return C.FINAL_SNAPSHOT_DIR, "FROZEN_FALLBACK", reason


def _patch_snapshot_dir(snapshot_dir) -> int:
    """把 SNAPSHOT_DIR 写入所有已加载的 decision_engine.final 子模块（只做一次）。"""
    n = 0
    for name, module in list(sys.modules.items()):
        if name.startswith("decision_engine.final") and module is not None \
                and hasattr(module, "SNAPSHOT_DIR"):
            setattr(module, "SNAPSHOT_DIR", snapshot_dir)
            n += 1
    return n


def _runtime_data_version(snapshot_dir, status: str) -> str:
    if status == "LIVE":
        fp = _extended_fingerprint() or {}
        return fp.get("data_version") or "LIVE_SNAPSHOT"
    return "final_v1"


def bind() -> Dict[str, Any]:
    """启动时绑定一次运行时快照。幂等。"""
    if _STATE["bound"]:
        return dict(_STATE)

    _ensure_model_src()

    # 1) 先校正 common.ROOT / DE，再 import final.*（保证派生路径一次正确）
    #    ROOT 指向 runtime/（fcommon 的 ROOT/"data"/... 因此解析到 runtime/data）
    import decision_engine.common as cm  # noqa: PLC0415
    if str(cm.ROOT) != str(C.RUNTIME_DIR):
        cm.ROOT = C.RUNTIME_DIR
        cm.DE = C.MODELS_DIR

    from decision_engine.final import fcommon  # noqa: F401,PLC0415
    import decision_engine.final.inference  # noqa: F401,PLC0415
    import decision_engine.final.artifacts  # noqa: F401,PLC0415
    import decision_engine.final.capabilities  # noqa: F401,PLC0415
    import decision_engine.final.risk  # noqa: F401,PLC0415
    import decision_engine.final.score  # noqa: F401,PLC0415
    import decision_engine.final.optimize  # noqa: F401,PLC0415  # 压力情景用其原生 _scenario_profit

    cur = read_final_versions()
    snapshot_dir, status, reason = _choose_snapshot(cur)
    patched = _patch_snapshot_dir(snapshot_dir)

    _STATE.update({
        "bound": True,
        "snapshot_dir": str(snapshot_dir),
        "runtime_data_status": status,
        "runtime_data_version": _runtime_data_version(snapshot_dir, status),
        "source": "extended_snapshot" if status == "LIVE" else "final_v1_frozen",
        "reason": reason,
        "final_versions": cur,
        "modules_patched": patched,
    })
    return dict(_STATE)


def state() -> Dict[str, Any]:
    if not _STATE["bound"]:
        return bind()
    return dict(_STATE)


def snapshot_dir():
    return _STATE["snapshot_dir"]