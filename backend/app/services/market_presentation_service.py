"""Continuous product prices, separate from official observation / model inputs."""
from copy import deepcopy
from datetime import date, datetime, timezone, timedelta
from functools import lru_cache
import json
import math
import os
import hashlib
from pathlib import Path
from urllib.parse import urlparse

from .. import config as C
from ..errors import ApiError, ErrorCode

REGIONS = ("shenyang", "tieling", "chaoyang", "jinzhou", "dandong", "dalian", "liaoning")
PRODUCTS = ("黄瓜", "甘蓝", "青椒", "尖椒", "土豆", "西红柿", "茄子", "大白菜")
LEVELS = ("wholesale", "supermarket", "retail_market", "market_average")
KINDS = {"observed", "historical", "model_estimate", "calibrated_history"}
RELATIVE_PATH = "data/market/presentation/latest.json"


def positive(value):
    return type(value) in (int, float) and math.isfinite(value) and value > 0


def day(value):
    try:
        return (isinstance(value, str) and len(value) == 10 and date.fromisoformat(value).isoformat() == value
                and date.fromisoformat(value) <= datetime.now(timezone(timedelta(hours=8))).date())
    except ValueError:
        return False


def timestamp(value):
    if not isinstance(value, str) or "T" not in value:
        return False
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.tzinfo is not None
    except ValueError:
        return False


def validate(data):
    """Validate one whole release before a filter or client can see any of it."""
    if (not isinstance(data, dict) or data.get("schema_version") != "presentation-1"
            or data.get("regions") != list(REGIONS) or data.get("products") != list(PRODUCTS)
            or data.get("price_levels") != list(LEVELS) or not timestamp(data.get("published_at"))
            or not isinstance(data.get("input_hash"), str) or len(data["input_hash"]) != 64
            or any(c not in "0123456789abcdef" for c in data["input_hash"])
            or not isinstance(data.get("records"), list) or len(data["records"]) != 224):
        raise ValueError("Invalid complete presentation release")
    seen = set()
    for row in data["records"]:
        if not isinstance(row, dict):
            raise ValueError("Invalid presentation row")
        key = row.get("region"), row.get("product"), row.get("price_level")
        if (key[0] not in REGIONS or key[1] not in PRODUCTS or key[2] not in LEVELS or key in seen
                or not positive(row.get("price")) or row.get("unit") != "元/kg" or not day(row.get("display_date"))
                or row.get("observed_at") is not None and not day(row["observed_at"])
                or row.get("collected_at") is not None and not (day(row["collected_at"]) or timestamp(row["collected_at"]))):
            raise ValueError("Invalid presentation fields")
        seen.add(key)
        history = row.get("history")
        if not isinstance(history, list) or not 1 <= len(history) <= 730:
            raise ValueError("Invalid presentation history")
        previous = ""
        for point in history:
            if (not isinstance(point, dict) or set(point) != {"date", "price"} or not day(point.get("date"))
                    or point["date"] <= previous or not positive(point.get("price"))):
                raise ValueError("Invalid presentation history point")
            previous = point["date"]
        trend = row.get("trend_history")
        if trend is not None:
            if not isinstance(trend, list) or not 2 <= len(trend) <= 128:
                raise ValueError("Invalid observed trend history")
            last_trend_day = ""
            for point in trend:
                if (not isinstance(point, dict) or set(point) != {"date", "price"} or not day(point.get("date"))
                        or point["date"] <= last_trend_day or not positive(point.get("price"))):
                    raise ValueError("Invalid observed trend history point")
                last_trend_day = point["date"]
        if history[-1] != {"date": row["display_date"], "price": row["price"]}:
            raise ValueError("Presentation price differs from its history")
        change = (history[-1]["price"] / history[-2]["price"] - 1) * 100 if len(history) > 1 else 0
        if (type(row.get("change_percent")) not in (int, float) or not math.isfinite(row["change_percent"])
                or abs(change - row["change_percent"]) > .0001):
            raise ValueError("Incomparable presentation change")
        if not isinstance(row.get("sources"), list) or not isinstance(row.get("trend_sources", []), list):
            raise ValueError("Invalid presentation sources")
        for source in [*row["sources"], *row.get("trend_sources", [])]:
            url = source.get("url", "") if isinstance(source, dict) else ""
            parsed = urlparse(url) if isinstance(url, str) else None
            if (not isinstance(source, dict) or set(source) != {"id", "name", "url"}
                    or not all(isinstance(source[k], str) and source[k].strip() for k in source)
                    or parsed is None or parsed.scheme not in {"http", "https"} or not parsed.hostname
                    or parsed.username is not None or parsed.password is not None
                    or "\\" in url or any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in url)):
                raise ValueError("Invalid actual source link")
        origin = row.get("origin")
        if not isinstance(origin, dict) or origin.get("kind") not in KINDS:
            raise ValueError("Missing presentation lineage")
        if trend is not None and (origin.get("trend_history_kind") != "local_same_source_observations"
                                  or not isinstance(origin.get("trend_series_identity"), list)
                                  or len(origin["trend_series_identity"]) < 3
                                  or origin["trend_series_identity"][:3] != list(key)):
            raise ValueError("Trend must preserve its actual local identity")
        if origin["kind"] in {"observed", "historical"}:
            if row["observed_at"] != row["display_date"] or origin.get("history_kind") != "local_same_source_observations":
                raise ValueError("Observations must preserve their real date and source series")
        elif origin.get("history_kind") != "calculation" or len(history) != 1:
            raise ValueError("Estimates must not create historical observation curves")
        if row.get("comparison_basis") != ("previous_same_source_observation" if len(history) > 1 else "latest_only"):
            raise ValueError("Invalid comparison basis")
        if origin["kind"] in {"model_estimate", "calibrated_history"}:
            surface = origin.get("price_type_surface_id")
            if not isinstance(surface, str) or len(surface) != 64 or any(c not in "0123456789abcdef" for c in surface):
                raise ValueError("Invalid price surface identity")
        if origin["kind"] == "model_estimate" and (not isinstance(origin.get("model"), dict)
                or not origin["model"].get("model_id") or not origin["model"].get("target_type")
                or not positive(origin["model"].get("price_per_kg"))):
            raise ValueError("Missing frozen model evidence")
    return data


@lru_cache(maxsize=4)
def _read(path, modified, size):
    return validate(json.loads(Path(path).read_text(encoding="utf-8")))


def committed_path(runtime):
    """Resolve a single atomically committed immutable presentation generation."""
    runtime = Path(runtime).resolve()
    receipt_path = runtime / "data/market/presentation/current.json"
    if not receipt_path.exists():
        return runtime / RELATIVE_PATH  # Legacy single-file releases remain readable.
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    relative, expected = receipt.get("path"), receipt.get("sha256")
    if (receipt.get("schema_version") != "presentation-release-1" or not isinstance(expected, str)
            or len(expected) != 64 or any(c not in "0123456789abcdef" for c in expected)
            or relative not in {RELATIVE_PATH, "data/market/presentation/releases/" + expected + ".json"}):
        raise ValueError("Invalid presentation pointer")
    path = runtime / relative
    if path.is_symlink() or not path.resolve().is_relative_to(runtime) or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise ValueError("Presentation generation checksum mismatch")
    return path


def _collection_order(value):
    """Preserve historical day precision and compare known times as UTC instants."""
    if day(value):
        return (value, 0, "")
    moment = datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    return (moment.astimezone(timezone(timedelta(hours=8))).date().isoformat(), 1, moment.isoformat())


def overlay_observations(result):
    """A newly committed real quote can win without running inference in a request."""
    from . import market_display_service
    try:
        observed = market_display_service.display()
    except (ApiError, OSError, ValueError, TypeError):
        return result
    if observed.get("schema_version") not in {"2", "3"}:
        return result
    lookup = {(row["region"], row["product"], row["price_level"]): row for row in result["records"]}
    changed = []
    today = datetime.now(timezone(timedelta(hours=8))).date().isoformat()
    for point in observed.get("records", []):
        key = point["region"], point["product"], point["price_level"]
        row = lookup.get(key)
        if row is None:
            continue
        native = row["origin"]["kind"] in {"observed", "historical"}
        if not native and point["observation_date"] != today:
            continue
        if native and point["observation_date"] < row["observed_at"]:
            continue
        kind = "observed" if point["observation_date"] == today else "historical"
        # V2 has no row source; never let an old source pretend to own the new quote.
        actual_sources = [deepcopy(point["source"])] if observed["schema_version"] == "3" else []
        if native and point["observation_date"] == row["observed_at"]:
            # An older collection must not replace newer evidence for the same
            # observation day, including across different timezone offsets.
            if row["collected_at"] is not None and _collection_order(point["collectedAt"]) < _collection_order(row["collected_at"]):
                continue
            # Price equality alone cannot hide a fresh collection, a source
            # correction, or the transition from today's quote to history.
            if (point["price"] == row["price"] and point["collectedAt"] == row["collected_at"]
                    and actual_sources == row["sources"] and kind == row["origin"]["kind"]):
                continue
        origin = {"kind": kind,
                  "history_kind": "local_same_source_observations", "anchor_date": point["observation_date"],
                  "adopted_observation": deepcopy(point), "observation_schema": observed["schema_version"]}
        for field in ("trend_history_kind", "trend_series_identity", "trend_time_range", "trend_points_before_compaction"):
            if field in row["origin"]: origin[field] = row["origin"][field]
        row.update(price=point["price"], display_date=point["observation_date"], observed_at=point["observation_date"],
                   collected_at=point["collectedAt"], history=deepcopy(point["history"]), change_percent=point["change_percent"],
                   comparison_basis="previous_same_source_observation" if len(point["history"]) > 1 else "latest_only", origin=origin)
        row["sources"] = actual_sources
        changed.append(point)
    if changed:
        encoded = json.dumps({"base": result["input_hash"], "observations": sorted(changed, key=lambda p: (p["region"], p["product"], p["price_level"]))}, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
        result["input_hash"] = hashlib.sha256(encoded.encode()).hexdigest()
    return validate(result)


def presentation(region=None, product=None, price_level=None):
    for name, value, allowed in [("region", region, REGIONS), ("product", product, PRODUCTS), ("price_level", price_level, LEVELS)]:
        if value is not None and value not in allowed:
            raise ApiError(422, ErrorCode.BAD_REQUEST, "行情查询条件不正确。", {"field": name})
    # Explicit development/test override; a normal release stays self-contained.
    configured = os.environ.get("AGRISCOPE_MARKET_PRESENTATION_PATH")
    try:
        if configured:
            requested = Path(configured).expanduser().resolve()
            # A development override to latest follows the same authoritative
            # pointer; it cannot observe a half-finished alias export.
            if requested.name in {"latest.json", "current.json"} and (requested.parent / "current.json").is_file():
                path = committed_path(requested.parent.parents[2])
            else: path = requested
        else: path = committed_path(C.RUNTIME_DIR)
        stat = path.stat()
        result = deepcopy(_read(str(path), stat.st_mtime_ns, stat.st_size))
    except (OSError, ValueError, TypeError) as exc:
        raise ApiError(503, ErrorCode.RESEARCH_UNAVAILABLE, "行情展示发布暂时不可读取。") from exc
    result = overlay_observations(result)
    result["records"] = [row for row in result["records"] if (region is None or row["region"] == region)
                         and (product is None or row["product"] == product)
                         and (price_level is None or row["price_level"] == price_level)]
    return result
