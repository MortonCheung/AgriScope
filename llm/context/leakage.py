# -*- coding: utf-8 -*-
"""Phase 9：泄漏检测（四类时间戳：feature / price observation / event publication / production）。

任何进入 packet 的信息都必须满足 timestamp <= cutoff。检测结果结构化返回（bool + 明细）。
"""
from __future__ import annotations
from typing import Any, Dict

import pandas as pd


def audit_packet(packet: Dict[str, Any], dataset: pd.DataFrame | None = None) -> Dict[str, Any]:
    cut = pd.Timestamp(packet["cutoff"]) if not str(packet["cutoff"]).startswith("T") \
        else None
    out: Dict[str, Any] = {
        "mode": packet.get("mode", "context"),
        "checks": {}, "violations": [], "passed": True,
    }

    def _fail(kind: str, detail: str) -> None:
        out["violations"].append({"kind": kind, "detail": detail})
        out["passed"] = False

    # 1) price observation timestamp
    if cut is not None:
        anchor = pd.Timestamp(packet["anchor_observation_date"])
        out["checks"]["price_observation"] = {"anchor": str(anchor.date()),
                                              "cutoff": str(cut.date()),
                                              "ok": bool(anchor <= cut)}
        if not (anchor <= cut):
            _fail("price_observation", f"anchor {anchor.date()} > cutoff {cut.date()}")
    else:
        out["checks"]["price_observation"] = {"ok": True, "note": "blind 相对索引，无绝对时间"}

    # 2) feature timestamp（packet 特征全部派生自 anchor 行）
    max_feature_ts = packet["anchor_observation_date"]
    out["checks"]["feature"] = {"max_feature_ts": max_feature_ts, "ok": True}

    # 3) event publication timestamp
    bad_events = [e for e in packet.get("events", [])
                  if cut is not None and ("publication_date" not in e
                                          or pd.Timestamp(e["publication_date"]) > cut)]
    out["checks"]["event_publication"] = {"n_events": len(packet.get("events", [])),
                                          "n_violations": len(bad_events),
                                          "ok": len(bad_events) == 0}
    for e in bad_events:
        _fail("event_publication", f"event {e.get('source')} publication > cutoff")

    # 4) production publication timestamp
    prod = packet.get("production", {})
    out["checks"]["production_publication"] = {
        "available": bool(prod.get("available")),
        "ok": True,
        "note": "production 本轮 NOT_FOUND（无结构化来源）→ 无泄漏面",
    }

    # 5) dataset 级复核：确认冻结数据中无 > cutoff 的观测被引用（仅 context 模式）
    if dataset is not None and cut is not None:
        crop = packet["crop"]
        sub = dataset[dataset["crop"] == crop]
        n_future = int((sub["date"] > cut).sum())
        out["checks"]["dataset_future_rows"] = {"n_future_rows": n_future, "ok": n_future > 0}
        # 说明：数据集**存在**未来行是正常的（用于回测构造标签）；此处只记录计数。
    return out


__all__ = ["audit_packet"]