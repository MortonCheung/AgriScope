# -*- coding: utf-8 -*-
"""Meta 服务：版本矩阵（唯一真源汇合处）。

对外暴露 model / daily / runtime / backend 四组版本，供前端与运维核对，
避免把「运行时数据版本」误当成「模型版本」。
"""
from __future__ import annotations

import json
from typing import Any, Dict, Optional

from .. import config as C
from .. import runtime_snapshot as RS
from . import capability_service as CAPS
from . import daily_service as DAILY


def _daily_meta() -> Optional[Dict[str, Any]]:
    try:
        d = DAILY.latest("shenyang")
    except Exception:  # noqa: BLE001
        return None
    model = d.get("model") or {}
    return {
        "schema_version": d.get("schema_version"),
        "daily_pipeline_version": d.get("daily_pipeline_version"),
        "data_version": d.get("data_version"),
        "model_version": d.get("model_version"),
        "model_status": model.get("model_status"),
        "final_code_fingerprint": model.get("final_code_fingerprint"),
        "latest_data_date": d.get("latest_data_date"),
        "data_freshness": d.get("data_freshness"),
        "run_date": d.get("date"),
        "status": d.get("status"),
        "generated_at": d.get("generated_at"),
        "snapshot_hash": d.get("snapshot_hash"),
    }


def meta() -> Dict[str, Any]:
    st = RS.state()
    versions = RS.read_final_versions()
    return {
        "backend": {"api_version": C.API_VERSION, "title": C.API_TITLE},
        "final_model": {
            "model_version": versions["model_version"],
            "data_version": versions["data_version"],
            "code_fingerprint": versions["code_fingerprint"],
            "generated_at": versions["final_generated_at"],
            "contract_version_supported": "1",
        },
        "runtime": {
            "snapshot_policy": C.SNAPSHOT_POLICY,
            "snapshot_dir": st.get("snapshot_dir"),
            "runtime_data_status": st.get("runtime_data_status"),
            "runtime_data_version": st.get("runtime_data_version"),
            "source": st.get("source"),
            "reason": st.get("reason"),
            "inference_lock": C.INFERENCE_LOCK_ENABLED,
        },
        "daily": _daily_meta(),
        "cities": CAPS.capability_all(),
    }


def versions_flat() -> Dict[str, Any]:
    m = meta()
    return {
        "model_version": m["final_model"]["model_version"],
        "data_version": m["final_model"]["data_version"],
        "code_fingerprint": m["final_model"]["code_fingerprint"],
        "runtime_data_version": m["runtime"]["runtime_data_version"],
        "runtime_data_status": m["runtime"]["runtime_data_status"],
        "daily_pipeline_version": (m["daily"] or {}).get("daily_pipeline_version"),
        "daily_schema_version": (m["daily"] or {}).get("schema_version"),
    }