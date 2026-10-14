"""Publish a continuous price surface from real DB/history and frozen inference.

The observation publication remains strict and untouched. This derived product
asset records every input, calibration and model target; no training or network
request occurs here. Estimates never become official observation records.
"""
import argparse
from copy import deepcopy
from collections import defaultdict
from datetime import date, datetime, timezone, timedelta
import hashlib
import json
import math
from pathlib import Path
import statistics
import sys
from types import SimpleNamespace

PRODUCT_ROOT = Path(__file__).resolve().parents[2]
if str(PRODUCT_ROOT) not in sys.path:
    sys.path.insert(0, str(PRODUCT_ROOT))

from backend.app.services.market_presentation_service import REGIONS, PRODUCTS, LEVELS, RELATIVE_PATH, positive, validate, committed_path
from pipelines.publishing.publish_market_display import Reader, INPUTS, DEFAULT_FEED_DB, Observation, _series
from agriscope_publication import atomic_bytes, publication_lock

CHINA_TZ = timezone(timedelta(hours=8))
POLICY = "local-history-frozen-model-price-surface-v1"


def encoded(obj):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def digest(obj):
    return hashlib.sha256(encoded(obj)).hexdigest()


def select_cells(series):
    grouped = defaultdict(list)
    for item in series:
        p = item.latest
        if p.level in LEVELS:
            grouped[p.region, p.product, p.level].append(item)
    # Whole source-series selection: never splice dates from two price sources.
    return {key: max(items, key=lambda s: (s.latest.day, s.latest.collected,
             {"S": 3, "A": 2, "B": 1}.get(s.latest.quality, 0), s.latest.identity)) for key, items in grouped.items()}


def compact_history(points, limit=128):
    indexes = range(len(points)) if len(points) <= limit else sorted({round(i * (len(points) - 1) / (limit - 1)) for i in range(limit)})
    return [{"date": points[i].day, "price": points[i].price} for i in indexes]


def source(point):
    from urllib.parse import urlparse
    url = urlparse(point.source_url)
    return {"id": point.source_id, "name": point.source_name, "url": point.source_url} if url.scheme in {"http", "https"} and url.hostname else None


def sources(points):
    found = {}
    for point in points:
        link = source(point)
        if link:
            key = link["id"], link["name"]
            previous = found.get(key)
            if previous is None or (point.day, point.collected) > previous[0]:
                found[key] = ((point.day, point.collected), link)
    return [found[key][1] for key in sorted(found)]


def price_surface(cells):
    """Fit price-type log ratios from real local paired products, no fixed markup.

    Exact-day comparisons are preferred; genuinely recorded pairs within 31
    days may connect otherwise isolated monitoring types. Pair dates and lag
    are retained so this is a calculation, never an observed price conversion.
    """
    import numpy as np
    groups = defaultdict(list)
    for region in REGIONS:
        for product in PRODUCTS:
            for ai, a in enumerate(LEVELS):
                for b in LEVELS[ai + 1:]:
                    first, second = cells.get((region, product, a)), cells.get((region, product, b))
                    if not first or not second:
                        continue
                    by_day = {p.day: p for p in second.points}
                    paired = [(p, by_day[p.day], 0) for p in first.points if p.day in by_day]
                    if paired:
                        paired = paired[-30:]
                    else:
                        p = first.latest
                        q = min(second.points, key=lambda q: abs((date.fromisoformat(p.day) - date.fromisoformat(q.day)).days))
                        lag = abs((date.fromisoformat(p.day) - date.fromisoformat(q.day)).days)
                        paired = [(p, q, lag)] if lag <= 31 else []
                    if not paired:
                        continue
                    ratio = statistics.median(q.price / p.price for p, q, _lag in paired)
                    p, q, lag = paired[-1]
                    groups[a, b].append({"region": region, "product": product, "ratio": ratio,
                        "first_date": p.day, "second_date": q.day, "lag_days": lag,
                        "points": len(paired), "inputs": [p.provenance(), q.provenance()]})
    edges, connected = [], {"wholesale"}
    for (a, b), samples in groups.items():
        edges.append({"from": a, "to": b, "ratio": statistics.median(x["ratio"] for x in samples), "samples": samples})
    changed = True
    while changed:
        changed = False
        for e in edges:
            if e["from"] in connected or e["to"] in connected:
                old = len(connected); connected.update((e["from"], e["to"])); changed |= len(connected) != old
    if connected != set(LEVELS):
        raise ValueError("Real price-type pairs cannot connect all four presentation channels")
    matrix, target = [], []
    for edge in edges:
        row = [0.] * 3
        for level, coefficient in ((edge["from"], -1), (edge["to"], 1)):
            if level != "wholesale": row[LEVELS.index(level) - 1] = coefficient
        weight = math.sqrt(len(edge["samples"]))
        matrix.append([v * weight for v in row]); target.append(math.log(edge["ratio"]) * weight)
    solved = np.linalg.lstsq(np.array(matrix), np.array(target), rcond=None)[0]
    factors = {"wholesale": 1., **{level: math.exp(float(solved[i])) for i, level in enumerate(LEVELS[1:])}}
    return factors, {"method": "weighted_log_price_type_surface", "maximum_pair_lag_days": 31,
                     "factors": factors, "edges": edges}


class FrozenForecaster:
    """Use registered runtime inference with no artifact fitting or rewriting."""
    def __init__(self):
        self.cache = {}

    def __call__(self, region, product):
        key = region, product
        if key not in self.cache:
            from backend.app import runtime_snapshot
            runtime_snapshot.bind()
            from backend.app.services.product_decision_service import _short_forecast
            request = SimpleNamespace(city_id=region, as_of=None)
            value = _short_forecast(request, product, 7, local_only=True)
            # This preserves the model's actual future-window target and origin.
            self.cache[key] = value
        return self.cache[key]


def regional_calibration(cells, factors, region, donor):
    evidence = []
    for product in PRODUCTS:
        local = [s.latest for key, s in cells.items() if key[0] == region and key[1] == product]
        reference = [s.latest for key, s in cells.items() if key[0] == donor and key[1] == product]
        if not local or not reference:
            continue
        # Match true price type first; otherwise normalize both by fitted surface.
        pairs = [(a, b) for a in local for b in reference]
        a, b = max(pairs, key=lambda pair: (pair[0].level == pair[1].level,
                                           min(pair[0].day, pair[1].day), pair[0].day, pair[1].day))
        ratio = (a.price / factors[a.level]) / (b.price / factors[b.level])
        evidence.append({"product": product, "ratio": ratio, "local": a.provenance(), "reference": b.provenance()})
    if not evidence:
        raise ValueError(f"No actual common-product calibration for {region}/{donor}")
    return {"method": "median_local_common_product_normalized_ratio", "ratio": statistics.median(e["ratio"] for e in evidence),
            "region": region, "donor_region": donor, "samples": evidence}


def build_from_series(series, input_hashes, predict, as_of):
    cells = select_cells(series)
    if not cells:
        raise ValueError("Empty inputs cannot replace the continuous release")
    factors, surface = price_surface(cells)
    records = []
    forecasts = {}
    calibrations = {}
    for region in REGIONS:
        for product in PRODUCTS:
            model = None
            for donor in dict.fromkeys([region, "shenyang", "chaoyang"]):
                if donor not in {"shenyang", "chaoyang"}: continue
                cache_key = donor, product
                if cache_key not in forecasts: forecasts[cache_key] = predict(donor, product)
                candidate = forecasts[cache_key]
                if candidate and positive(candidate.get("price_per_kg")) and candidate.get("price_level") in LEVELS:
                    model = candidate; break
            for level in LEVELS:
                local = cells.get((region, product, level))
                if local and (local.latest.day == as_of or model is None):
                    last = local.latest
                    history = compact_history(local.points)
                    row = dict(region=region, product=product, price_level=level, price=last.price, unit="元/kg",
                        display_date=last.day, observed_at=last.day, collected_at=last.collected,
                        history=history, sources=sources(local.points), comparison_basis="previous_same_source_observation" if len(history) > 1 else "latest_only",
                        origin={"kind": "observed" if last.day == as_of else "historical", "history_kind": "local_same_source_observations",
                            "anchor_date": last.day, "series_identity": list(last.identity), "adopted": last.provenance(),
                            "history_points_before_compaction": len(local.points), "history_compaction": "actual_point_sampling_preserving_first_last"})
                else:
                    anchors = [s.latest for key, s in cells.items() if key[0] == region and key[1] == product]
                    anchor = max(anchors, key=lambda p: (p.level == level, p.day, p.collected, p.identity)) if anchors else None
                    calibration = None
                    contributing = [anchor] if anchor else []
                    if model:
                        donor = model["source_city"]
                        if region == donor:
                            correction = 1.
                        elif anchor:
                            donor_anchors = [s.latest for key, s in cells.items() if key[0] == donor and key[1] == product]
                            if not donor_anchors: raise ValueError(f"No real donor anchor for {donor}/{product}")
                            reference = max(donor_anchors, key=lambda p: (p.level == anchor.level, p.day, p.collected))
                            correction = (anchor.price / factors[anchor.level]) / (reference.price / factors[reference.level])
                            calibration = {"method": "same_product_local_anchor_ratio", "ratio": correction,
                                           "local": anchor.provenance(), "reference": reference.provenance()}
                            contributing.append(reference)
                        else:
                            key = region, donor
                            if key not in calibrations: calibrations[key] = regional_calibration(cells, factors, region, donor)
                            calibration = calibrations[key]; correction = calibration["ratio"]
                            for sample in calibration["samples"]:
                                for cell in cells.values():
                                    if cell.latest.provenance() in (sample["local"], sample["reference"]): contributing.append(cell.latest)
                        value = model["price_per_kg"] / factors[model["price_level"]] * factors[level] * correction
                        kind = "model_estimate"
                    elif anchor:
                        value = anchor.price / factors[anchor.level] * factors[level]
                        kind = "calibrated_history"
                    else:
                        raise ValueError(f"No registered model or real local input for {region}/{product}/{level}")
                    if not positive(value): raise ValueError("Invalid calibrated model value")
                    row = dict(region=region, product=product, price_level=level, price=round(value, 10), unit="元/kg",
                        display_date=as_of, observed_at=anchor.day if anchor else None,
                        collected_at=anchor.collected if anchor else None,
                        history=[{"date": as_of, "price": round(value, 10)}], sources=sources(contributing), comparison_basis="latest_only",
                        origin={"kind": kind, "history_kind": "calculation", "anchor_date": anchor.day if anchor else None,
                            "input": anchor.provenance() if anchor else None, "model": model, "calibration": calibration,
                            "price_type_surface_id": digest(surface), "calculation_date": as_of})
                if local:
                    historical = max((item for item in series if item.latest.region == region
                                      and item.latest.product == product and item.latest.level == level),
                                     key=lambda item: (len(item.points), item.latest.day))
                    if len(historical.points) > 1:
                        row["trend_history"] = compact_history(historical.points)
                        links = {tuple(link.values()): link for link in [*row["sources"], *sources([local.latest, historical.latest])]}
                        row["sources"] = [links[key] for key in sorted(links)]
                        row["trend_sources"] = sources([historical.latest])
                        row["origin"]["trend_series_identity"] = list(historical.latest.identity)
                        row["origin"]["trend_time_range"] = [historical.points[0].day, historical.latest.day]
                        row["origin"]["trend_points_before_compaction"] = len(historical.points)
                        row["origin"]["trend_history_kind"] = "local_same_source_observations"
                history = row["history"]
                row["change_percent"] = (history[-1]["price"] / history[-2]["price"] - 1) * 100 if len(history) > 1 else 0.
                records.append(row)
    algorithm_hash = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    identity = digest({"policy": POLICY, "algorithm_hash": algorithm_hash, "as_of": as_of,
                       "inputs": input_hashes, "forecasts": list(forecasts.values()), "surface": surface})
    body = {"schema_version": "presentation-1", "regions": list(REGIONS), "products": list(PRODUCTS), "price_levels": list(LEVELS),
            "published_at": datetime.now(timezone.utc).isoformat(), "input_hash": identity, "records": records,
            "provenance": {"policy": POLICY, "algorithm_hash": algorithm_hash, "input_hashes": input_hashes, "price_type_surface": surface,
                           "separate_from_official_observation_release": True}}
    return validate(body)


def publish(payload, runtime):
    """One atomic data file; old bytes survive every failed build/validation."""
    validate(payload)
    runtime = Path(runtime).resolve()
    destination = runtime / RELATIVE_PATH
    with publication_lock(runtime):
        previous_path = committed_path(runtime)
        if previous_path.is_file():
            try:
                previous = validate(json.loads(previous_path.read_text(encoding="utf-8")))
            except (OSError, ValueError, TypeError): previous = None
            if previous:
                old_rows = {(r["region"], r["product"], r["price_level"]): r for r in previous["records"]}
                retained = []
                for index, row in enumerate(payload["records"]):
                    old = old_rows[row["region"], row["product"], row["price_level"]]
                    old_native = old["origin"]["kind"] in {"observed", "historical"}
                    new_native = row["origin"]["kind"] in {"observed", "historical"}
                    if old_native and (row["origin"]["kind"] == "calibrated_history"
                                       or new_native and row["observed_at"] < old["observed_at"]):
                        payload["records"][index] = deepcopy(old); retained.append(old)
                    elif len(old.get("trend_history", [])) > len(row.get("trend_history", [])):
                        # A partial current feed must not erase a previously verified long curve.
                        row["trend_history"] = deepcopy(old["trend_history"])
                        row["trend_sources"] = deepcopy(old.get("trend_sources", []))
                        for field in ("trend_series_identity", "trend_time_range", "trend_points_before_compaction", "trend_history_kind"):
                            if field in old["origin"]: row["origin"][field] = deepcopy(old["origin"][field])
                        retained.append({"key": [row["region"], row["product"], row["price_level"]], "trend_history": row["trend_history"]})
                if retained:
                    payload["input_hash"] = digest({"build_input": payload["input_hash"], "retained": retained})
                    payload.setdefault("provenance", {})["retained_input_hashes"] = previous.get("provenance", {}).get("input_hashes", {})
                    validate(payload)
            if previous and previous["input_hash"] == payload["input_hash"]:
                publish_receipt(runtime, previous)
                refresh_alias(destination, previous)
                return {"status": "UNCHANGED", "path": str(destination), "input_hash": previous["input_hash"], "records": len(previous["records"])}
            if previous:
                # Immutable rollback point, never overwrite a previous generation.
                rollback = destination.parent / "releases" / (previous["input_hash"] + ".json")
                if not rollback.exists(): atomic_bytes(rollback, encoded(previous), 0o440)
        # Immutable generation first, one atomic pointer commit second. There is
        # no moment where API/restart validation needs two mutable files to match.
        publish_receipt(runtime, payload)
        refresh_alias(destination, payload)
    return {"status": "PUBLISHED", "path": str(destination), "input_hash": payload["input_hash"], "records": len(payload["records"])}


def publish_receipt(runtime, payload):
    body = encoded(payload); checksum = hashlib.sha256(body).hexdigest()
    relative = "data/market/presentation/releases/" + checksum + ".json"
    generation = Path(runtime) / relative
    if generation.exists():
        if generation.read_bytes() != body: raise ValueError("Immutable presentation generation mismatch")
    else: atomic_bytes(generation, body, 0o440)
    receipt = {"schema_version": "presentation-release-1", "path": relative,
               "sha256": checksum,
               "anchor_asset": payload.get("provenance", {}).get("anchor_asset")}
    path = Path(runtime) / "data/market/presentation/current.json"
    body = encoded(receipt)
    if not path.exists() or path.read_bytes() != body:
        atomic_bytes(path, body, 0o440)


def refresh_alias(destination, payload):
    # Compatibility export only. current.json + its immutable generation are
    # authoritative even if interruption/disk failure leaves this alias old.
    try:
        body = encoded(payload)
        if not destination.exists() or destination.read_bytes() != body:
            atomic_bytes(destination, body, 0o440)
    except OSError:
        pass


def anchor_asset(series, hashes):
    """Only selected real series/points; no full DB, parquet or invented history."""
    selected, retained = [], {}
    for key, latest in sorted(select_cells(series).items()):
        longest = max((item for item in series if (item.latest.region, item.latest.product, item.latest.level) == key),
                      key=lambda item: (len(item.points), item.latest.day))
        for item in (latest, longest): retained[item.latest.identity] = item
    for _identity, item in sorted(retained.items()):
        points = item.points
        indexes = range(len(points)) if len(points) <= 128 else sorted({round(i * (len(points) - 1) / 127) for i in range(128)})
        selected.append({"template": item.latest.provenance(), "family": item.latest.family,
                         "points": [{"day": points[i].day, "price": points[i].price, "collected": points[i].collected,
                                     "original_price": points[i].original_price, "original_unit": points[i].original_unit,
                                     "source_url": points[i].source_url} for i in indexes]})
    return {"schema_version": "presentation-anchors-1", "source_hashes": hashes, "series": selected}


def restore_anchors(asset):
    if not isinstance(asset, dict) or asset.get("schema_version") != "presentation-anchors-1" or not isinstance(asset.get("series"), list):
        raise ValueError("Invalid selected anchor asset")
    observations = []
    for series in asset["series"]:
        base = series["template"]
        for point in series["points"]:
            observations.append(Observation(base["region"], base["product"], base["price_level"], point["day"], point["price"], point["collected"],
                point["original_price"], point["original_unit"], base["raw_product"], base["source_id"], base["source_name"],
                point["source_url"], base["market"], base["quality"], series["family"], base["source_path"], base["timestamp_basis"],
                tuple(base.get("evidence_paths", [])), base.get("specification", ""), base.get("evidence_basis", ""),
                base.get("raw_evidence_reference", ""), base.get("provided_record_hash", ""), base.get("current_primary_price_match", False)))
    return observations


def build_release(project, runtime, feed_db=None, predict=None, as_of=None):
    runtime = Path(runtime).resolve()
    reader = Reader(project)
    observations, hashes = [], {}
    previous_path = committed_path(runtime)
    if previous_path.is_file():
        previous = validate(json.loads(previous_path.read_text(encoding="utf-8")))
        reference = previous.get("provenance", {}).get("anchor_asset")
        if reference:
            anchor_path = runtime / reference["path"]
            if anchor_path.is_symlink() or not anchor_path.resolve().is_relative_to(runtime):
                raise ValueError("Selected anchor asset escapes Runtime")
            raw = anchor_path.read_bytes()
            if hashlib.sha256(raw).hexdigest() != reference["sha256"]:
                raise ValueError("Selected anchor checksum mismatch")
            asset = json.loads(raw)
            observations.extend(restore_anchors(asset)); hashes.update(asset["source_hashes"])
    for family, relative in INPUTS.items():
        if (reader.root / relative).is_file(): observations.extend(reader.rows(family))
    feed = Path(feed_db) if feed_db else reader.root / DEFAULT_FEED_DB
    if feed.is_file(): observations.extend(reader.feed(feed))
    hashes.update(reader.hashes)
    series, _conflicts = _series(observations)
    asset = anchor_asset(series, hashes)
    asset_bytes = encoded(asset); anchor_hash = hashlib.sha256(asset_bytes).hexdigest()
    # Always use the same compact selected input in both full and isolated workers.
    compacted, _conflicts = _series(restore_anchors(asset))
    payload = build_from_series(compacted, {**hashes, "runtime_selected_anchors": anchor_hash},
                                predict or FrozenForecaster(), as_of or datetime.now(CHINA_TZ).date().isoformat())
    for relative, expected in reader.hashes.items():
        if hashlib.sha256((reader.root / relative).read_bytes()).hexdigest() != expected:
            raise ValueError(f"Input changed during price surface build: {relative}")
    relative = "data/market/presentation/inputs/" + anchor_hash + ".json"
    destination = runtime / relative
    if destination.exists():
        if destination.read_bytes() != asset_bytes: raise ValueError("Selected anchor immutable asset mismatch")
    else:
        atomic_bytes(destination, asset_bytes, 0o440)
    payload["provenance"]["anchor_asset"] = {"path": relative, "sha256": anchor_hash}
    return payload


def public_snapshot(payload):
    """Production bootstrap DTO: price evidence, never private paths/calibration tables."""
    validate(payload)
    result = {k: deepcopy(payload[k]) for k in ("schema_version", "regions", "products", "price_levels", "published_at", "input_hash")}
    rows = []
    for row in payload["records"]:
        item = {k: deepcopy(value) for k, value in row.items() if k != "origin"}
        item["origin"] = {k: deepcopy(value) for k, value in row["origin"].items()
                          if k in {"kind", "history_kind", "anchor_date", "price_type_surface_id", "calculation_date",
                                   "trend_history_kind", "trend_series_identity", "trend_time_range", "trend_points_before_compaction"}}
        model = row["origin"].get("model")
        if model:
            item["origin"]["model"] = {k: deepcopy(model[k]) for k in ("model_id", "target_type", "price_per_kg", "source_city", "price_level", "horizon_days", "model_as_of", "method") if k in model}
        rows.append(item)
    result["records"] = rows
    return validate(result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", type=Path, required=True, help="Read-only research data root")
    parser.add_argument("--runtime-root", type=Path, default=PRODUCT_ROOT / "runtime", help="New derived asset output")
    parser.add_argument("--feed-db", type=Path)
    parser.add_argument("--frontend-bootstrap", type=Path, help="Optional official public DTO export, not a fixture")
    args = parser.parse_args()
    payload = build_release(args.project_root, args.runtime_root, args.feed_db)
    receipt = publish(payload, args.runtime_root)
    if args.frontend_bootstrap:
        committed = json.loads(committed_path(args.runtime_root).read_text(encoding="utf-8"))
        body = encoded(public_snapshot(committed))
        if not args.frontend_bootstrap.exists() or args.frontend_bootstrap.read_bytes() != body:
            atomic_bytes(args.frontend_bootstrap, body, 0o644)
        receipt["frontend_bootstrap"] = str(args.frontend_bootstrap)
    print(json.dumps(receipt, ensure_ascii=False))


if __name__ == "__main__":
    main()
