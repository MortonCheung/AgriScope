"""Fail-closed audit of observation, feature and externally published context."""
from __future__ import annotations

import re
from typing import Any, Dict
import pandas as pd
import numpy as np

from llm.common import canonical_json


def audit_packet(packet: Dict[str, Any], dataset: pd.DataFrame | None = None,
                 host_metadata: dict | None = None) -> Dict[str, Any]:
    blind = packet.get("mode") == "blind"
    result = {"mode": packet.get("mode", "context"), "checks": {},
              "violations": [], "passed": True}

    def check(kind, ok, detail):
        result["checks"][kind] = {"ok": bool(ok), "detail": detail}
        if not ok:
            result["violations"].append({"kind": kind, "detail": detail})
            result["passed"] = False

    cut = pd.Timestamp(host_metadata["cutoff"]) if blind and host_metadata else (
        None if blind else pd.Timestamp(packet["cutoff"]))
    if blind:
        check("anonymous_identity", packet.get("city") == "CITY_A" and packet.get("crop") == "CROP_A",
              "generic case identifiers only")
        text = canonical_json(packet)
        check("anonymous_source", not re.search(r"沈阳|shenyang|西红柿|土豆|20\d{2}-\d{2}-\d{2}", text, re.I),
              "no real region/crop/source date")
        check("relative_price", packet.get("unit") == "ratio_to_current_price" and packet.get("current_price") == 1.,
              "all prices use current=1 ratio")
        check("relative_time", packet.get("anchor_observation_date") == "T0" and
              bool(re.fullmatch(r"T\+\d+d", str(packet.get("cutoff")))) and
              packet.get("feature_available_at") == "T0", "relative cutoff and feature timestamp")
        check("blind_external_context", not packet.get("events") and not packet.get("production", {}).get("available"),
              "blind benchmark has no real event/production context")
    else:
        anchor = pd.Timestamp(packet["anchor_observation_date"])
        check("price_observation", anchor <= cut, "anchor <= cutoff")
        check("feature", pd.Timestamp(packet.get("feature_available_at", packet["anchor_observation_date"])) <= cut,
              "feature timestamp <= cutoff")
    history = packet.get("history", [])
    check("historical_relative_offsets", bool(history) and all(
        isinstance(row.get("day_offset"), int) and row["day_offset"] <= 0 and
        np.isfinite(row.get("price", np.nan)) and row.get("price", 0) > 0 for row in history),
        "only observed prices with offsets <= 0")

    publications = list(packet.get("events", []))
    for key in ("production", "supply", "climate"):
        value = packet.get(key, {})
        if isinstance(value, dict) and value.get("available"):
            publications.append(value)
    for key in ("hri", "market_risk", "climate_exposure"):
        value = packet.get("risk", {}).get(key, {})
        if isinstance(value, dict) and value.get("available"):
            publications.append(value)
    for i, event in enumerate(publications):
        try:
            published = pd.Timestamp(event["publication_date"])
            ok = bool(cut is not None and pd.notna(published) and published <= cut and
                      event.get("source") and event.get("available_at_cutoff") is True)
        except (KeyError, ValueError, TypeError):
            ok = False
        check(f"publication_{i}", ok, "source + publication_date <= cutoff + available_at_cutoff required")

    if dataset is not None and (not blind or host_metadata):
        crop = host_metadata["crop"] if host_metadata else packet["crop"]
        sub = dataset.loc[(dataset.crop == crop) & (pd.to_datetime(dataset.date) <= cut)].sort_values("date")
        scale = host_metadata["scale"] if host_metadata else 1.
        prices = np.asarray([row["price"] for row in history], float)
        raw = sub.price_per_kg.to_numpy(float) / scale
        check("dataset_pit_reconstruction", len(raw) == len(prices) and
              bool(len(raw)) and np.allclose(raw, prices, rtol=1e-10, atol=1e-10),
              "provider history equals host cutoff-sliced prices")
    return result


__all__ = ["audit_packet"]
