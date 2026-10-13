"""Publish a compact, complete presentation from existing real price assets.

The selected display grid is separate from official observations and models.
No collection, source-table mutation, price multipliers or training occurs here.
Source identity and adoption rules live in a private metadata publication.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timezone, timedelta
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import tempfile
from typing import Any

import pandas as pd

PRODUCT_ROOT = Path(__file__).resolve().parents[2]
if str(PRODUCT_ROOT) not in sys.path:
    sys.path.insert(0, str(PRODUCT_ROOT))
from backend.app.services.market_display_service import (  # noqa: E402
    PRODUCTS, PRICE_LEVELS, REGIONS, validate_display,
)

CITY_IDS = {"沈阳": "shenyang", "铁岭": "tieling", "朝阳": "chaoyang",
            "锦州": "jinzhou", "丹东": "dandong", "大连": "dalian"}
ALIASES = {
    "黄瓜": {"黄瓜", "黃瓜"}, "甘蓝": {"甘蓝", "甘兰", "包菜"},
    "青椒": {"青椒", "圆椒", "元椒"}, "尖椒": {"尖椒"},
    "土豆": {"土豆", "马铃薯", "新土豆"}, "西红柿": {"西红柿", "番茄"},
    "茄子": {"茄子", "紫茄子", "绿茄子", "青茄子", "茄子（紫）", "茄子（青）", "茄子_紫", "茄子_青"},
    "大白菜": {"大白菜", "白菜", "黄心大白菜"},
}
# Explicit mass conversions only. Volume, pieces and inferred units are rejected.
MASS_FACTORS = {"元/斤": 2, "元/500克": 2, "元/500g": 2, "元/500G": 2,
                "元/kg": 1, "元/KG": 1, "元/公斤": 1, "元/千克": 1,
                "元/250g": 4, "元/吨": .001, "元/两": 20}
LEVEL_NEARNESS = {
    "wholesale": ("wholesale", "market_average", "farm_gate", "retail_market", "retail", "supermarket"),
    "supermarket": ("supermarket", "retail_market", "retail", "market_average", "wholesale", "farm_gate"),
    "retail_market": ("retail_market", "retail", "supermarket", "market_average", "wholesale", "farm_gate"),
}
INPUTS = {
    "market": "data/processed/market/price_observation.parquet",
    "province": "data/processed/market/province_price_reference.parquet",
    "daily": "data/processed/daily/daily_market_price.parquet",
}
CHINA_TZ = timezone(timedelta(hours=8))


def _text(value: Any) -> str:
    if value is None:
        return ""
    value = str(value).strip()
    return "" if value.lower() in {"nan", "none", "nat", "<na>"} else value


def _flag(value: Any) -> bool:
    return _text(value).lower() in {"1", "true", "yes"}


def _positive(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        result = float(value)
        return result if math.isfinite(result) and result > 0 else None
    except (ValueError, TypeError, OverflowError):
        return None


def _day(value: Any) -> str | None:
    value = _text(value)
    try:
        day = date.fromisoformat(value[:10])
        return day.isoformat() if day <= date.today() else None
    except ValueError:
        return None


def _timestamp(value: Any) -> str | None:
    value = _text(value)
    if not value:
        return None
    if len(value) == 10:
        return _day(value)
    try:
        timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=CHINA_TZ)
        return timestamp.isoformat(timespec="seconds") if timestamp.date() <= date.today() else None
    except ValueError:
        return None


def _hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@dataclass(frozen=True)
class Observation:
    region: str
    product: str
    level: str
    day: str
    price: float
    collected: str
    original_price: float
    original_unit: str
    raw_product: str
    source_id: str
    source_name: str
    source_url: str
    market: str
    quality: str
    family: str
    source_path: str
    timestamp_basis: str
    evidence_paths: tuple[str, ...] = ()

    @property
    def identity(self) -> tuple:
        # Preserve actual source, market, price type and raw product identity.
        return (self.region, self.product, self.level, self.source_id,
                self.source_name, self.market, self.raw_product)

    def provenance(self) -> dict:
        return dict(region=self.region, product=self.product, price_level=self.level,
                    observation_date=self.day, price_per_kg=self.price, collectedAt=self.collected,
                    original_price=self.original_price, original_unit=self.original_unit,
                    raw_product=self.raw_product, source_id=self.source_id, source_name=self.source_name,
                    source_url=self.source_url, market=self.market, quality=self.quality,
                    source_path=self.source_path, timestamp_basis=self.timestamp_basis,
                    evidence_paths=list(self.evidence_paths))


@dataclass
class Series:
    points: list[Observation]

    @property
    def latest(self) -> Observation:
        return self.points[-1]


class Reader:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.hashes: dict[str, str] = {}
        self.stats = {family: Counter() for family in INPUTS}
        self.json_cache: dict[str, dict | None] = {}

    def json(self, path: Path) -> dict | None:
        relative = path.relative_to(self.root).as_posix()
        if relative not in self.json_cache:
            try:
                value = json.loads(path.read_text(encoding="utf-8"))
                self.json_cache[relative] = value if isinstance(value, dict) else None
                self.hashes[relative] = _hash(path)
            except (OSError, ValueError):
                self.json_cache[relative] = None
        return self.json_cache[relative]

    def daily_evidence(self, row: dict, day: str, price: float) -> tuple | None:
        raw_path = _text(row.get("raw_file"))
        path = (self.root / raw_path).resolve()
        raw_base = (self.root / "data/raw/daily/shenyang_clz").resolve()
        if not path.is_relative_to(raw_base) or path.parent.name != day or path.stem not in {"mt1", "mt2", "mt3"}:
            return None
        metadata_path = path.parent / "metadata.json"
        metadata, raw = self.json(metadata_path), self.json(path)
        entry = (metadata or {}).get(path.stem)
        levels = {"mt1": "wholesale", "mt2": "supermarket", "mt3": "retail_market"}
        if (not isinstance(entry, dict) or not isinstance(raw, dict) or entry.get("status") != "OK"
                or entry.get("date") != day or entry.get("price_level") != levels[path.stem]
                or _text(row.get("price_level")) != levels[path.stem]
                or not isinstance(raw.get("data"), list)):
            return None
        collected = _timestamp(entry.get("crawl_time"))
        if not collected:
            return None
        unit, product = _text(row.get("unit_raw")), _text(row.get("crop_raw"))
        for item in raw["data"]:
            if not isinstance(item, dict) or _text(item.get("productName")) != product or _text(item.get("unit")) != unit:
                continue
            actual = _positive(item.get("price"))
            if actual is not None and math.isclose(actual * MASS_FACTORS[unit], price, abs_tol=.000001):
                # Source dates are epoch milliseconds; confirm their real China day.
                try:
                    source_day = datetime.fromtimestamp(float(item["dates"]) / 1000, CHINA_TZ).date().isoformat()
                except (KeyError, ValueError, TypeError, OverflowError):
                    continue
                if source_day == day:
                    return collected, (metadata_path.relative_to(self.root).as_posix(), raw_path)
        return None

    def rows(self, family: str) -> list[Observation]:
        relative = INPUTS[family]
        path = self.root / relative
        if not path.is_file():
            raise ValueError(f"Missing registered price asset: {relative}")
        self.hashes[relative] = _hash(path)
        frame = pd.read_parquet(path)
        required = ("crop_standard",)
        if any(key not in frame for key in required):
            raise ValueError(f"Invalid registered price schema: {relative}")
        self.stats[family]["input_rows"] = len(frame)
        selected = frame[frame["crop_standard"].isin(PRODUCTS)]
        self.stats[family]["unselected_product"] = len(frame) - len(selected)
        observations = []
        for row in selected.to_dict("records"):
            result, reason = self.row(family, relative, row)
            if result is None:
                self.stats[family][reason] += 1
            else:
                self.stats[family]["accepted_rows"] += 1
                observations.append(result)
        return observations

    def row(self, family: str, relative: str, row: dict) -> tuple[Observation | None, str]:
        product, raw_product = _text(row.get("crop_standard")), _text(row.get("crop_raw"))
        if raw_product not in ALIASES.get(product, set()):
            return None, "different_product_identity"
        if (_flag(row.get("is_proxy")) or _flag(row.get("is_derived"))
                or _flag(row.get("derived_flag")) or _flag(row.get("promotion_flag"))
                or _flag(row.get("member_price_flag"))
                or _text(row.get("processing_state")) not in {"", "raw", "unprocessed"}):
            return None, "non_standard_or_derived"
        if family == "daily":
            if _text(row.get("quality_status")) != "OK":
                return None, "quality_rejected"
            region, level = CITY_IDS.get(_text(row.get("city"))), _text(row.get("price_level"))
            unit, original = _text(row.get("unit_raw")), _positive(row.get("price"))
            day, quality = _day(row.get("date")), "A"
        elif family == "province":
            region, level = "liaoning", _text(row.get("price_level"))
            unit, original = _text(row.get("unit")), _positive(row.get("price"))
            day, quality = _day(row.get("pub_date")), _text(row.get("source_level"))
            if _text(row.get("geo_level")) != "province" or quality not in {"S", "A", "B"}:
                return None, "quality_rejected"
        else:
            region = CITY_IDS.get(_text(row.get("city")))
            level = _text(row.get("price_level_canonical")) or _text(row.get("price_level"))
            unit, original = _text(row.get("unit_original")), _positive(row.get("price_original"))
            day, quality = _day(row.get("observation_date")), _text(row.get("quality_grade"))
            if quality not in {"A", "B"}:
                return None, "quality_rejected"
        if region is None or level not in LEVEL_NEARNESS["wholesale"]:
            return None, "unregistered_region_or_level"
        if unit not in MASS_FACTORS or original is None:
            return None, "invalid_mass_unit_or_price"
        price = round(original * MASS_FACTORS[unit], 10)
        if not math.isfinite(price) or price <= 0 or day is None:
            return None, "invalid_price_or_date"
        normalized = _positive(row.get("price_per_kg"))
        if family != "province" and (normalized is None or not math.isclose(normalized, price, abs_tol=.0001)):
            return None, "normalization_mismatch"
        source_id, source_name = _text(row.get("source_id")), _text(row.get("source_name"))
        if not source_id or not source_name:
            return None, "missing_source_identity"
        evidence = ()
        if family == "daily":
            raw_evidence = self.daily_evidence(row, day, price)
            if raw_evidence is None:
                return None, "unverified_daily_evidence"
            collected, evidence = raw_evidence
            timestamp_basis = "raw_metadata_crawl_time"
        elif family == "province":
            collected, timestamp_basis = _timestamp(row.get("access_date")), "source_access_date"
        else:
            collected = _timestamp(row.get("retrieval_time"))
            timestamp_basis = "source_retrieval_time_may_include_normalizer_time"
        if collected is None:
            return None, "missing_source_timestamp"
        return Observation(region, product, level, day, price, collected, original, unit, raw_product,
                           source_id, source_name, _text(row.get("source_url")) or _text(row.get("url")),
                           _text(row.get("market_name")) or _text(row.get("market")), quality,
                           family, relative, timestamp_basis, evidence), "accepted"


def _rank(series: Series, target_level: str, near_first: bool = False) -> tuple:
    point = series.latest
    near = -LEVEL_NEARNESS[target_level].index(point.level)
    # Newest valid source wins; stable tie-breaking makes repeated publication reproducible.
    dated = (point.day, point.collected, 2 if point.family == "daily" else 1,
             {"S": 3, "A": 2, "B": 1}.get(point.quality, 0))
    return ((near, *dated) if near_first else (*dated, near)) + point.identity


def _best(series: list[Series], target_level: str, near_first: bool = False) -> Series | None:
    return max(series, key=lambda item: _rank(item, target_level, near_first)) if series else None


def _series(observations: list[Observation]) -> tuple[list[Series], int]:
    grouped = defaultdict(lambda: defaultdict(list))
    for point in observations:
        grouped[point.identity][point.day].append(point)
    series, conflicts = [], 0
    for days in grouped.values():
        points = []
        for day in sorted(days):
            candidates = days[day]
            if len({point.price for point in candidates}) > 1:
                conflicts += 1
                continue
            points.append(max(candidates, key=lambda point: (point.collected, point.family == "daily", point.source_path)))
        if points:
            series.append(Series(points))
    return series, conflicts


def _row(region: str, product: str, level: str, history: list[dict], collected: str) -> dict:
    last = history[-1]
    previous = history[-2]["price"] if len(history) > 1 else last["price"]
    return dict(region=region, product=product, price_level=level, price=last["price"],
                observation_date=last["date"], collectedAt=collected,
                change_percent=(last["price"] / previous - 1) * 100, history=history)


def _adopt(region: str, product: str, level: str, series: Series, tier: int) -> tuple[dict, dict]:
    # Keep the exact previous/latest pair for change, plus genuine week/month anchors.
    # A missing calendar day never becomes an invented observation.
    selected = {point.day: point for point in series.points[-2:]}
    latest_day = date.fromisoformat(series.latest.day)
    for days_back in (7, 30):
        cutoff = (latest_day - timedelta(days=days_back)).isoformat()
        prior = next((point for point in reversed(series.points) if point.day <= cutoff), None)
        if prior is not None:
            selected[prior.day] = prior
    points = [selected[day] for day in sorted(selected)]
    history = [dict(date=point.day, price=point.price) for point in points]
    return (_row(region, product, level, history, series.latest.collected),
            dict(region=region, product=product, price_level=level, tier=tier,
                 adoption="same_source_series", adopted=series.latest.provenance(),
                 history=[point.provenance() for point in points]))


def _mean(region: str, product: str, level: str, candidates: list[Series]) -> tuple[dict, dict]:
    # A fixed, same-price-type cohort avoids manufacturing a trend by switching sources.
    nearby = LEVEL_NEARNESS[level]
    selected_level = next((candidate for candidate in nearby
                           if any(s.latest.level == candidate and s.latest.region != "liaoning" for s in candidates)), None)
    if selected_level is None:
        raise ValueError(f"No real regional price exists for {product}/{level}")
    cohort = []
    for city in REGIONS[:-1]:
        selected = _best([s for s in candidates if s.latest.region == city and s.latest.level == selected_level], level)
        if selected:
            cohort.append(selected)
    latest_days = {s.latest.day for s in cohort}
    point_sets = [{point.day: point for point in s.points} for s in cohort]
    common = set.intersection(*(set(points) for points in point_sets))
    # If newest source dates differ, only expose a latest-known record aggregate.
    # Older aligned dates cannot be spliced into a mixed-date aggregate trend.
    days = sorted(common)[-4:] if len(latest_days) == 1 and max(latest_days) in common else []
    contributors = []
    if days:
        for day in days:
            points = [values[day] for values in point_sets]
            contributors.append(points)
    else:
        contributors = [[s.latest for s in cohort]]
    history = [dict(date=max(point.day for point in points),
                    price=round(sum(point.price for point in points) / len(points), 10)) for points in contributors]
    collected = max(point.collected for point in contributors[-1])
    return (_row(region, product, level, history, collected),
            dict(region=region, product=product, price_level=level, tier=4,
                 adoption="fixed_cohort_regional_mean", adopted_price_level=selected_level,
                 timestamp_basis="latest_actual_constituent_timestamp",
                 geography_scope="six_city_reference_area",
                 history=[dict(date=point["date"], constituents=[source.provenance() for source in sources])
                          for point, sources in zip(history, contributors)]))


def build(project_root: Path) -> tuple[dict, dict]:
    reader = Reader(project_root)
    observations = [point for family in INPUTS for point in reader.rows(family)]
    series, conflicts = _series(observations)
    records, lineage = [], []
    for region in REGIONS:
        for product in PRODUCTS:
            candidates = [s for s in series if s.latest.product == product]
            for level in PRICE_LEVELS:
                same_region = [s for s in candidates if s.latest.region == region]
                chosen = _best([s for s in same_region if s.latest.level == level], level)
                tier = 1
                if chosen is None:
                    chosen, tier = _best(same_region, level), 2
                if chosen is None and region != "liaoning":
                    chosen, tier = _best([s for s in candidates if s.latest.region != region], level, True), 3
                row, evidence = _adopt(region, product, level, chosen, tier) if chosen else _mean(region, product, level, candidates)
                records.append(row)
                lineage.append(evidence)
    payload = validate_display(dict(schema_version="1", products=list(PRODUCTS),
                                    price_levels=list(PRICE_LEVELS), records=records))
    # Source changes while reading must never publish a mixed generation.
    for relative, digest in reader.hashes.items():
        if _hash(reader.root / relative) != digest:
            raise ValueError(f"Price source changed during publication: {relative}")
    audit = dict(schema_version="1", publisher="pipelines/publishing/publish_market_display.py",
                 generated_at=datetime.now(timezone.utc).isoformat(),
                 source_hashes=reader.hashes, input_statistics={k: dict(v) for k, v in reader.stats.items()},
                 same_source_conflict_days_omitted=conflicts,
                 tier_counts=dict(Counter(str(row["tier"]) for row in lineage)),
                 observation_date_range=[min(r["observation_date"] for r in records), max(r["observation_date"] for r in records)],
                 record_count=len(records), records=lineage)
    return payload, audit


def _encoded(data: dict) -> bytes:
    return (json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n").encode("utf-8")


def _atomic(path: Path, contents: bytes) -> None:
    if path.is_file() and path.read_bytes() == contents:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=".market-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(contents)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def publish(project_root: Path, runtime_root: Path | None = None,
            frontend_root: Path | None = None) -> dict:
    project_root = Path(project_root).resolve()
    runtime_root = Path(runtime_root or project_root / "AgriScope/runtime").resolve()
    frontend_root = Path(frontend_root or project_root / "AgriScope/frontend").resolve()
    payload, audit = build(project_root)
    contents = _encoded(payload)
    digest = hashlib.sha256(contents).hexdigest()
    audit["display_sha256"] = digest
    # Data files are immutable inputs; only these new presentation/metadata outputs are written.
    destinations = [runtime_root / "data/market/display.json",
                    frontend_root / "src/domain/market/publishedMarket.json"]
    for destination in destinations:
        _atomic(destination, contents)
    audit_contents = _encoded(audit)
    _atomic(project_root / "data/metadata/market_display/lineage.json", audit_contents)
    _atomic(runtime_root / "data/market/lineage.json", audit_contents)
    return dict(record_count=len(payload["records"]), sha256=digest,
                tier_counts=audit["tier_counts"], observation_date_range=audit["observation_date_range"],
                runtime_destination=str(destinations[0]), frontend_destination=str(destinations[1]))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", type=Path, default=PRODUCT_ROOT.parent)
    parser.add_argument("--runtime-root", type=Path)
    parser.add_argument("--frontend-root", type=Path)
    args = parser.parse_args(argv)
    try:
        print(json.dumps(publish(args.project_root, args.runtime_root, args.frontend_root), ensure_ascii=False))
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"Market publication refused: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
