"""Real-provider pilot on the RC2 target protocol. No post-evaluation artifacts.

2026 is a reused retrospective audit. No historical result can grant production.
Only price history enters the numeric benchmark; absent dated context stays NOT_FOUND.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
import numpy as np
import pandas as pd

from long_horizon import v2 as LH
from llm.context import build_case_context, restore_forecast, audit_packet
from llm.evaluation.harness import ExperimentConfig, _call_once
from llm.providers import LLMProvider, LLMUnavailable

HORIZONS = (60, 90, 120)
ABLATIONS = (
    ("llm_only", []), ("+seasonality", ["seasonality"]),
    ("+short_model_pit_proxy", ["seasonality", "short_model"]),
    ("+hri_market_risk", ["seasonality", "short_model", "risk"]),
    ("+climate", ["seasonality", "short_model", "risk", "climate"]),
    ("+events", ["seasonality", "short_model", "risk", "climate", "events"]),
    ("hybrid_full", None),
)


@dataclass
class PilotConfig:
    horizons: list[int] = field(default_factory=lambda: list(HORIZONS))
    crops: list[str] = field(default_factory=list)
    target_types: list[str] = field(default_factory=lambda: list(LH.TARGET_TYPES))
    phases: list[dict] = field(default_factory=lambda: list(LH.PHASES))
    max_anchors_per_phase: int = 1
    temperature: float = 0.
    seed: int | None = 42


class BudgetedProvider(LLMProvider):
    """A pilot has a hard new-call ceiling. It never auto-expands to a full backtest."""
    def __init__(self, provider: LLMProvider, max_calls: int):
        if max_calls < 1:
            raise ValueError("positive_call_budget_required")
        self.inner, self.max_calls, self.calls = provider, max_calls, 0
        self.last_call_attempted = False
        self.name, self.model = provider.name, provider.model
        self.is_real_llm, self.seed_supported = provider.is_real_llm, provider.seed_supported

    def is_available(self):
        return self.inner.is_available()

    def cache_config(self):
        return self.inner.cache_config()

    def call_metadata(self):
        return self.inner.call_metadata()

    def complete_json(self, **kwargs):
        self.last_call_attempted = False
        if self.calls >= self.max_calls:
            raise LLMUnavailable("pilot_call_budget_exhausted")
        self.calls += 1
        self.last_call_attempted = True
        return self.inner.complete_json(**kwargs)


def pilot_crops(history: pd.DataFrame, selection_end="2023-12-31") -> tuple[list[str], dict]:
    """Pilot roles are selected from development prices, never 2026 outcomes."""
    rows = []
    for crop, group in history[pd.to_datetime(history.date) <= pd.Timestamp(selection_end)].groupby("crop"):
        group = group.sort_values("date")
        price = group.price_per_kg.to_numpy(float)
        if len(price) < 30:
            continue
        month = pd.to_datetime(group.date).dt.month
        seasonal = group.groupby(month).price_per_kg.transform("mean").to_numpy()
        denom = np.sum((price - np.mean(price)) ** 2)
        rows.append({"crop": crop, "logret_sigma": float(np.std(np.diff(np.log(price)))),
                     "month_eta2": float(np.sum((seasonal - np.mean(price)) ** 2) / denom) if denom else 0.})
    if not rows:
        raise ValueError("insufficient_development_prices_for_pilot")
    table = pd.DataFrame(rows).sort_values("crop")
    roles = {"low_volatility": table.sort_values("logret_sigma").iloc[0].crop,
             "high_volatility": table.sort_values("logret_sigma").iloc[-1].crop,
             "strong_seasonality": table.sort_values("month_eta2").iloc[-1].crop}
    return list(dict.fromkeys(roles.values())), {"roles": roles, "selection_end": selection_end,
                                               "profiles": table.to_dict("records")}


def prepared_target(history: pd.DataFrame, horizon: int, target_type: str,
                    harvest_definition: str) -> tuple[pd.DataFrame, dict]:
    if target_type not in LH.TARGET_TYPES:
        raise ValueError("unsupported_target_type")
    spec = LH.target_spec("cycle_market_average" if target_type == "cycle_market_average"
                          else harvest_definition, horizon)
    frame = LH.add_seasonal_features(LH.add_targets(LH.build_base_features(history), spec), spec)
    frame["last_value"] = frame.price_per_kg
    return frame, spec


def _wape(actual, predicted):
    actual, predicted = np.asarray(actual, float), np.asarray(predicted, float)
    valid = np.isfinite(actual) & np.isfinite(predicted)
    return float(np.abs(actual[valid] - predicted[valid]).sum() / np.abs(actual[valid]).sum() * 100) if valid.any() and np.abs(actual[valid]).sum() else None


def learn_baseline(frame: pd.DataFrame, crop: str, train_end: str) -> dict:
    """Select among PIT rules using only labels fully matured at train_end."""
    train = frame[(frame.crop == crop) & LH.training_mask(frame, train_end)]
    common = train.dropna(subset=list(LH.BASELINES))
    common = common[(common[list(LH.BASELINES)] > 0).all(axis=1)]
    scores = {}
    for method in LH.BASELINES:
        rows = common if len(common) >= 30 else train[train[method].notna() & (train[method] > 0)] if method=="last_value" else train.iloc[0:0]
        if len(rows) >= 30:
            scores[method] = _wape(rows.actual, rows[method])
    scores = {method: score for method, score in scores.items() if score is not None}
    best = min(scores, key=lambda method: (scores[method], list(LH.BASELINES).index(method))) if scores else "last_value"
    return {"method": best, "train_end": train_end, "mature_training_n": len(train),
            "selection_scoring_n": len(common) if len(common)>=30 else len(train),
            "max_label_end": str(train.label_end.max().date()) if len(train) else None,
            "scores": scores}


def learn_adjustment_bounds(frame: pd.DataFrame, crop: str, train_end: str, method: str) -> dict:
    train = frame[(frame.crop == crop) & LH.training_mask(frame, train_end) &
                  frame[method].notna() & (frame[method] > 0)]
    if train.empty:
        return {"low_pct": 0., "high_pct": 0., "n": 0, "status": "NOT_FOUND",
                "train_end": train_end, "max_label_end": None}
    adjustment = 100 * (train.actual.to_numpy() / train[method].to_numpy() - 1)
    # Learned asymmetric limits retain positivity even for high-volatility crops.
    low, high = np.quantile(adjustment, [.05, .95])
    return {"low_pct": float(min(low, 0.)), "high_pct": float(max(high, 0.)),
            "n": len(train), "status": "DEVELOPMENT_MATURED_LABEL_QUANTILES",
            "train_end": train_end, "max_label_end": str(train.label_end.max().date())}


def run_v2_experiment(provider: LLMProvider, config: PilotConfig, history: pd.DataFrame,
                      harvest_definition: str, *, mode="blind", residual=False,
                      sections=None, ablation_level="full") -> pd.DataFrame:
    if not provider.is_real_llm:
        raise ValueError("REAL_LLM_PROVIDER_REQUIRED_NO_STUB_BENCHMARK")
    records = []
    experiment = "blind_numeric_forecast_v2" if mode == "blind" else "context_augmented_forecast_v2"
    call_config = ExperimentConfig(experiment=experiment, temperature=config.temperature,
                                   seed=config.seed, include_sections=sections)
    for horizon in config.horizons:
        for target in config.target_types:
            frame, spec = prepared_target(history, horizon, target, harvest_definition)
            for crop in config.crops:
                crop_frame = frame[frame.crop == crop]
                for phase in config.phases:
                    learning_end = min(phase["train_end"], "2023-12-31")
                    selection = learn_baseline(frame, crop, learning_end)
                    bounds = learn_adjustment_bounds(frame, crop, learning_end, selection["method"])
                    eligible = crop_frame[LH.evaluation_mask(crop_frame, phase)]
                    anchors = LH.exposure_rows(eligible, spec["exposure_spacing_days"]).head(config.max_anchors_per_phase)
                    for _, row in anchors.iterrows():
                        anchor = str(pd.Timestamp(row.date).date())
                        packet, host = build_case_context(crop, anchor, horizon, mode=mode, dataset=history)
                        packet["target_type"] = target
                        packet["target_window"] = {key: spec[key] for key in (
                            "name", "start_offset", "end_offset", "end_exclusive_offset", "calendar_days")}
                        packet["climate"] = {"available": False, "status": "NOT_FOUND",
                                             "reason": "NO_PIT_DATED_CLIMATE_SOURCE"}
                        audit = audit_packet(packet, history, host)
                        if not audit["passed"]:
                            raise ValueError("packet_leakage_audit_failed")
                        baseline = float(row[selection["method"]])
                        fallback = not np.isfinite(baseline) or baseline <= 0
                        if fallback:
                            baseline = float(row.price_per_kg)
                        call = _call_once(provider, packet, baseline / host["scale"] if residual else None,
                                          "residual" if residual else "forecast", call_config, host_metadata=host)
                        rec = {"crop": crop, "horizon": horizon, "target_type": target,
                               "target_definition": spec["name"], "label_start": str(row.label_start.date()),
                               "label_end": str(row.label_end.date()), "anchor": anchor,
                               "phase": phase["name"], "experiment": experiment,
                               "schema": "residual" if residual else "forecast", "ablation_level": ablation_level,
                               "actual": float(row.actual), "current_price": float(row.price_per_kg),
                               "baseline_point": baseline, "baseline_method": selection["method"],
                               "baseline_fallback_used": fallback, "baseline_selection": selection,
                               "mase_scale": float(crop_frame.loc[crop_frame.date <= pd.Timestamp(learning_end), "price_per_kg"].diff().abs().mean()),
                               "seasonal_point": float(row.seasonal_naive) if pd.notna(row.seasonal_naive) else baseline,
                               "adjustment_bounds": bounds, "provider": provider.name, "model_id": provider.model,
                               "is_real_llm": provider.is_real_llm, "inverse_transform": host,
                               "context_hash": call["context_hash"], "prompt_meta": call["prompt_meta"],
                               "provider_config": call["provider_config"], "request_config": call["request_config"],
                               "response": call["payload"], "valid": call["valid"], "errors": call["errors"],
                               "actual_method": call["method"], "fallback_used": False,
                               "numeric_llm_used": call["valid"], "range_type": "scenario_range",
                               "confidence_type": "LLM_SELF_REPORTED_NOT_CALIBRATED",
                               "cache_hit": call["cache_hit"], "latency_ms": call["latency_ms"],
                               "api_called": call["api_called"], "token_usage": call["token_usage"],
                               "response_model": call.get("response_model", "unknown"),
                               "response_id": call.get("response_id", "unknown"),
                               "system_fingerprint": call.get("system_fingerprint", "unknown"),
                               "estimated_cost_usd": call["estimated_cost_usd"],
                               "leakage_passed": True, "production_status": "RESEARCH_ONLY",
                               "untouched_metric": None, "final_effective_n": 0,
                               "evidence_status": "RETROSPECTIVE_ONLY_NO_UNTOUCHED",
                               "regime": "low" if packet["risk"]["program_proxy"]["expanding_price_percentile"] < 1/3
                               else "high" if packet["risk"]["program_proxy"]["expanding_price_percentile"] > 2/3 else "mid"}
                        if call["valid"]:
                            out = call["payload"]
                            rec["confidence"] = out["confidence"]
                            if residual:
                                rec["adjustment_pct"] = out["adjustment_pct"]
                                rec["bounded_adjustment_pct"] = float(np.clip(out["adjustment_pct"], bounds["low_pct"], bounds["high_pct"]))
                                rec["point"] = baseline * (1 + rec["bounded_adjustment_pct"] / 100)
                                rec["fallback_used"] = bounds["n"] == 0
                                if bounds["n"] == 0:
                                    rec["actual_method"] = selection["method"]
                                    rec["numeric_llm_used"] = False
                                    rec["fallback_reason"] = "NOT_FOUND_MATURED_DEVELOPMENT_RESIDUALS"
                            else:
                                restored = restore_forecast(out, host)
                                rec.update({"point": restored["point_forecast"], "low": restored["range_low"],
                                            "high": restored["range_high"], "direction": restored["direction"]})
                        else:
                            # Auditable statistical fallback is not scored as an LLM response.
                            rec.update({"point": baseline, "actual_method": selection["method"], "fallback_used": True})
                            rec["fallback_reason"] = "LLM_UNAVAILABLE_OR_SCHEMA_REJECTED"
                        records.append(rec)
    return pd.DataFrame(records)


def v2_metrics(records: pd.DataFrame) -> pd.DataFrame:
    if records.empty:
        return pd.DataFrame()
    keys = ["experiment", "schema", "ablation_level", "crop", "horizon", "target_type", "phase"]
    output = []
    for group, frame in records.groupby(keys):
        valid = frame[frame.valid & frame.numeric_llm_used]
        row = dict(zip(keys, group))
        row.update({"requested_n": len(frame), "valid_n": len(valid), "failed_n": len(frame)-len(valid),
                    "schema_valid_n": int(frame.valid.sum()), "fallback_n": int(frame.fallback_used.sum()),
                    "untouched_metric": None, "final_effective_n": 0, "production_status": "RESEARCH_ONLY"})
        if len(valid):
            actual, point = valid.actual.to_numpy(), valid.point.to_numpy()
            row.update({"WAPE": _wape(actual, point), "baseline_WAPE": _wape(actual, valid.baseline_point),
                        "MAE": float(np.abs(actual-point).mean()),
                        "MASE": float(np.mean(np.abs(actual-point)/valid.mase_scale)) if (valid.mase_scale>0).all() else None,
                        "sMAPE": float(np.mean(2*np.abs(actual-point)/(np.abs(actual)+np.abs(point)))*100),
                        "Bias": float(np.mean(point-actual)),
                        "directional_accuracy": float(np.mean(np.sign(point-valid.current_price)==np.sign(actual-valid.current_price))),
                        "output_vs_baseline_abs_pct": float(np.mean(np.abs(point/valid.baseline_point-1))*100)})
        output.append(row)
    return pd.DataFrame(output)


def ablation_deltas(records: pd.DataFrame) -> pd.DataFrame:
    """Changes and accuracy gains are distinct; compare only matched valid cases."""
    rows, previous = [], None
    keys = ["experiment", "crop", "horizon", "target_type", "phase", "anchor"]
    for level, _ in ABLATIONS:
        current = records[(records.ablation_level==level) & records.valid] if not records.empty else pd.DataFrame(columns=keys+["actual", "point"])
        row = {"level": level, "valid_n": len(current), "paired_n": 0,
               "source_status": "NOT_FOUND" if level in ("+hri_market_risk", "+climate", "+events") else
                                "PIT_RULE_PROXY_NOT_FINAL_MODEL" if level=="+short_model_pit_proxy" else "PRICE_HISTORY"}
        if previous is not None:
            paired = current[keys+["actual", "point"]].merge(previous[keys+["point"]], on=keys, suffixes=("", "_previous"))
            row["paired_n"] = len(paired)
            if len(paired):
                row["mean_abs_prediction_change_pct"] = float(np.mean(np.abs(paired.point/paired.point_previous-1))*100)
                row["paired_WAPE_gain_pp"] = _wape(paired.actual, paired.point_previous)-_wape(paired.actual, paired.point)
        rows.append(row)
        previous = current
    return pd.DataFrame(rows)


def hybrid_evaluation(direct: pd.DataFrame, residual: pd.DataFrame) -> tuple[pd.DataFrame, list]:
    """Freeze A/B/C settings from matured development responses only, then score later phases."""
    if direct.empty:
        return pd.DataFrame(), []
    output, locks = [], []
    keys = ["experiment", "crop", "horizon", "target_type"]
    for group, frame in direct[direct.valid].groupby(keys):
        dev = frame[frame.phase == "development"]
        later = frame[frame.phase != "development"]
        weights, regime_choice = (1., 0., 0.), {regime: "baseline" for regime in ("low", "mid", "high")}
        if len(dev) >= 3:
            candidates = [(w_stat, w_season, 1-w_stat-w_season)
                          for w_stat in np.linspace(0, 1, 11) for w_season in np.linspace(0, 1-w_stat, 11)]
            weights = min(candidates, key=lambda w: _wape(dev.actual, w[0]*dev.baseline_point+w[1]*dev.seasonal_point+w[2]*dev.point))
            for regime in regime_choice:
                subset = dev[dev.regime == regime]
                if len(subset) >= 3 and _wape(subset.actual, subset.point) < _wape(subset.actual, subset.baseline_point):
                    regime_choice[regime] = "llm"
        lock = {**dict(zip(keys, group)), "development_n": len(dev), "weights_stat_season_llm": list(weights),
                "regime_choice": regime_choice, "status": "DEV_LEARNED" if len(dev)>=3 else "INSUFFICIENT_DEV_FALLBACK_BASELINE",
                "selection_label_end": str(pd.to_datetime(dev.label_end).max().date()) if len(dev) else None,
                "production_status": "RESEARCH_ONLY"}
        locks.append(lock)
        for phase, test in later.groupby("phase"):
            row = {**dict(zip(keys, group)), "phase": phase, "n": len(test),
                   "baseline_WAPE": _wape(test.actual, test.baseline_point),
                   "hybrid_B_WAPE": _wape(test.actual, weights[0]*test.baseline_point+weights[1]*test.seasonal_point+weights[2]*test.point),
                   "hybrid_C_WAPE": _wape(test.actual, np.where(test.regime.map(regime_choice)=="llm", test.point, test.baseline_point)),
                   "production_status": "RESEARCH_ONLY", "untouched_metric": None}
            if not residual.empty:
                eligible = residual[residual.valid & residual.numeric_llm_used & (residual.experiment==group[0]) & (residual.crop==group[1]) &
                                    (residual.horizon==group[2]) & (residual.target_type==group[3]) & (residual.phase==phase)]
                paired = test.merge(eligible[["anchor", "point"]], on="anchor", suffixes=("", "_residual"))
                row["hybrid_A_n"] = len(paired)
                row["hybrid_A_WAPE"] = _wape(paired.actual, paired.point_residual) if len(paired) else None
            output.append(row)
    return pd.DataFrame(output), locks
