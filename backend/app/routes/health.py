# -*- coding: utf-8 -*-
"""健康检查：/health（存活）与 /health/ready（真实就绪检查）。"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter, Request

from .. import config as C
from .. import runtime_snapshot as RS
from ..services import daily_service as DAILY

router = APIRouter(tags=["health"])


@router.get("/health", summary="存活探针")
def health(request: Request) -> Dict[str, Any]:
    return {"status": "ok", "request_id": request.state.request_id}


@router.get("/health/ready", summary="就绪探针（真检查）")
def ready(request: Request):
    checks: Dict[str, Any] = {}
    ok = True

    st = RS.state()
    snap = st.get("snapshot_dir")
    snap_ok = bool(snap) and Path(snap).exists()
    checks["runtime_snapshot"] = {
        "ok": snap_ok, "dir": snap, "status": st.get("runtime_data_status")}
    ok = ok and snap_ok

    docs = {}
    for city in ("沈阳", "朝阳"):
        p = Path(snap) / "datasets" / f"decision_dataset_{city}.parquet" if snap else None
        docs[city] = bool(p and p.exists())
    checks["datasets"] = {"ok": any(docs.values()), "detail": docs}
    ok = ok and any(docs.values())

    pkls = list(C.FINAL_MODELS_DIR.glob("*.pkl")) if C.FINAL_MODELS_DIR.exists() else []
    checks["model_artifacts"] = {"ok": len(pkls) > 0, "n": len(pkls)}
    checks["meta_files"] = {
        "ok": C.FINAL_RUN_META.exists(),
        "run_meta": C.FINAL_RUN_META.exists(),
        "price_model_selection": (C.FINAL_REPORTS_DIR / "tables" / "price_model_selection.csv").exists(),
    }
    ok = ok and checks["meta_files"]["ok"] and checks["meta_files"]["price_model_selection"]

    try:
        d = DAILY.latest("shenyang")
        checks["daily_latest"] = {"ok": True, "run_date": d.get("date"),
                                  "latest_data_date": d.get("latest_data_date")}
    except Exception as exc:  # noqa: BLE001
        checks["daily_latest"] = {"ok": False, "error": type(exc).__name__}
    ok = ok and checks["daily_latest"]["ok"]

    body = {"status": "ready" if ok else "not_ready",
            "request_id": request.state.request_id,
            "detail": checks}
    if not ok:
        from ..responses import SafeJSONResponse  # noqa: PLC0415
        return SafeJSONResponse(status_code=503, content=body)
    return body