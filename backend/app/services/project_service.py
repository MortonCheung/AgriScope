"""Expose current frozen validation artifacts, never recompute or edit research/model assets."""
from __future__ import annotations
import csv
import hashlib
import io
import json
import math
from .. import config as C, publication
from ..errors import ApiError, ErrorCode


def evidence():
    try:
        meta = json.loads(C.FINAL_RUN_META.read_text(encoding="utf-8"))
        def rows(name):
            raw = (C.FINAL_REPORTS_DIR / name).read_bytes()
            if hashlib.sha256(raw).hexdigest() != meta["artifact_hashes"][name]:
                raise ValueError("artifact mismatch")
            return list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
        models = []
        cities = {"沈阳": "shenyang", "朝阳": "chaoyang"}
        for row in rows("FINAL_MODEL_REGISTRY.csv"):
            if row["module"] != "price_model" or row["status"] not in {"FINAL", "BASELINE"} or row["horizon_days"] not in {"7", "14", "30"}:
                continue
            metrics = {key: float(row[source]) for key, source in [("wape", "mean_WAPE"), ("mae", "mean_MAE"), ("baselineWape", "baseline_WAPE")]}
            if not all(math.isfinite(v) and v >= 0 for v in metrics.values()):
                raise ValueError("invalid metric")
            models.append(dict(cityId=cities[row["city"]], crop=row["crop"], horizon=int(row["horizon_days"]),
                               algorithm=row["algorithm"], status=row["status"], **metrics))
        folds = []
        all_folds = rows("tables/price_model_folds.csv")
        for name in meta["folds"]:
            current = [r for r in all_folds if r["fold"] == name]
            if not current or any(r["train_end"] >= r["validation_start"] for r in current):
                raise ValueError("invalid time split")
            folds.append(dict(name=name, trainStart=min(r["train_start"] for r in current),
                trainEnd=min(r["train_end"] for r in current), trainEndMax=max(r["train_end"] for r in current),
                validationStart=min(r["validation_start"] for r in current), validationStartMax=max(r["validation_start"] for r in current),
                validationEnd=min(r["validation_end"] for r in current), validationEndMax=max(r["validation_end"] for r in current)))
        try:
            snapshot=json.loads(publication.path('daily').read_text(encoding='utf-8'))
            monitor=json.loads(publication.path('monitor').read_text(encoding='utf-8')) if publication.path('monitor').is_file() else None
        except (OSError,ValueError):
            snapshot,monitor={},None
        return dict(schemaVersion="1", modelVersion=meta["model_version"], dataVersion=meta["data_version"],
                    fingerprint=meta["code_fingerprint"], reportGeneratedAt=meta["generated_at"], trainingCompletedAt=None,
                    seed=meta["seed"], features=meta["features"], models=models, folds=folds,
                    update=publication.metadata(snapshot, monitor), metricSemantics="WAPE_percent_MAE_CNY_per_kg", baseline="baseline_last_value")
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise ApiError(503, ErrorCode.MODEL_UNAVAILABLE, "冻结验证证据暂时无法核对。") from exc
