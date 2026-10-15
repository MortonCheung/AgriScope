"""Publish a compact, complete presentation from existing real price assets.

The selected display grid is separate from official observations and models.
No collection, source-table mutation, price multipliers or training occurs here.
Source identity and adoption rules live in a private metadata publication.
"""
from __future__ import annotations

import argparse
import shutil
from collections import Counter, defaultdict
from contextlib import closing
from dataclasses import dataclass
from datetime import date, datetime, timezone, timedelta
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
from typing import Any
from urllib.parse import urlparse, parse_qs

import pandas as pd

PRODUCT_ROOT = Path(__file__).resolve().parents[2]
if str(PRODUCT_ROOT) not in sys.path:
    sys.path.insert(0, str(PRODUCT_ROOT))
from backend.app.services.market_display_service import (  # noqa: E402
    LEGACY_PRICE_LEVELS, PRODUCTS, PRICE_LEVELS, REGIONS, validate_display,
)

CITY_IDS = {"沈阳": "shenyang", "铁岭": "tieling", "朝阳": "chaoyang",
            "锦州": "jinzhou", "丹东": "dandong", "大连": "dalian"}
ALIASES = {
    "黄瓜": {"黄瓜", "黃瓜"}, "甘蓝": {"甘蓝", "甘兰", "包菜", "圆白菜"},
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
    # Official monitoring average is its own price type in V3; it must never be
    # silently mixed with wholesale or with a specific retail sub-type.
    "market_average": ("market_average", "retail", "retail_market", "supermarket", "wholesale", "farm_gate"),
}
INPUTS = {
    "market": "data/processed/market/price_observation.parquet",
    "province": "data/processed/market/province_price_reference.parquet",
    "daily": "data/processed/daily/daily_market_price.parquet",
}
DEFAULT_FEED_DB = "data/raw/market_feed/42ef2fd/market-feed-sevenday.sqlite"
# Five registered source adapters serve seven regions. Retain their actual price type.
FEED_SOURCES = {
    "SRC-LN-FGW-DAILY": ({"liaoning"}, {"market_average", "purchase"}, {"fgw.ln.gov.cn"}, "liaoning_fgw_daily-"),
    "SRC-SY-CLZ": ({"shenyang"}, {"wholesale", "supermarket", "retail_market"},
                   {"fgw.shenyang.gov.cn", "www.lnsyjgjc.com"}, "shenyang_clz-"),
    "SRC-CY-FGW-BASKET": ({"chaoyang"}, {"market_average"}, {"fgw.chaoyang.gov.cn"}, "chaoyang_basket-"),
    "SRC-JZ-CLZ-WEEKLY": ({"jinzhou"}, {"retail"}, {"www.jz.gov.cn"}, "jinzhou_weekly-"),
    "SRC-LN-FGW-BYCITY": ({"dalian", "dandong", "tieling"}, {"market_average"}, {"fgw.ln.gov.cn"}, "lnfgw_by_city-"),
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
        return day.isoformat() if day <= datetime.now(CHINA_TZ).date() else None
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
        return timestamp.isoformat(timespec="seconds") if timestamp.date() <= datetime.now(CHINA_TZ).date() else None
    except ValueError:
        return None


def _collection_key(value: str) -> tuple:
    """Order known instants in UTC; retain day-only evidence without adding a time.

    Historical evidence of day precision is compared by its Beijing calendar day.
    A precise instant is preferred on that same day, without claiming an unknown
    collection hour for the historical item.
    """
    if len(value) == 10:
        return (value, 0, "")
    moment = datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    return (moment.astimezone(CHINA_TZ).date().isoformat(), 1, moment.isoformat())


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
    specification: str = ""
    evidence_basis: str = ""
    raw_evidence_reference: str = ""
    provided_record_hash: str = ""
    current_primary_price_match: bool = False

    @property
    def identity(self) -> tuple:
        # Preserve actual source, market, price type and raw product identity.
        return (self.region, self.product, self.level, self.source_id,
                self.source_name, self.market, self.raw_product, self.specification,
                "provided_feed" if self.family == "provided_feed" else "")

    def provenance(self) -> dict:
        return dict(region=self.region, product=self.product, price_level=self.level,
                    observation_date=self.day, price_per_kg=self.price, collectedAt=self.collected,
                    original_price=self.original_price, original_unit=self.original_unit,
                    raw_product=self.raw_product, source_id=self.source_id, source_name=self.source_name,
                    source_url=self.source_url, market=self.market, quality=self.quality,
                    source_path=self.source_path, timestamp_basis=self.timestamp_basis,
                    evidence_paths=list(self.evidence_paths), specification=self.specification,
                    evidence_basis=self.evidence_basis, raw_evidence_reference=self.raw_evidence_reference,
                    provided_record_hash=self.provided_record_hash,
                    current_primary_price_match=self.current_primary_price_match)


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
        self.feed_receipt: dict | None = None

    def reference(self, path: Path) -> str:
        path = path.resolve()
        return path.relative_to(self.root).as_posix() if path.is_relative_to(self.root) else str(path)

    def json(self, path: Path) -> dict | None:
        relative = self.reference(path)
        if relative not in self.json_cache:
            try:
                value = json.loads(path.read_text(encoding="utf-8"))
                self.json_cache[relative] = value if isinstance(value, dict) else None
                self.hashes[relative] = _hash(path)
            except (OSError, ValueError):
                self.json_cache[relative] = None
        return self.json_cache[relative]

    def feed(self, path: Path) -> list[Observation]:
        """User-provided observation DB; hashes/runs verified, raw bytes not claimed."""
        path = path.resolve()
        if not path.is_file():
            raise ValueError("Provided market feed DB does not exist")
        if Path(str(path) + "-wal").is_file() and Path(str(path) + "-wal").stat().st_size:
            raise ValueError("Provided market feed must be a checkpointed DB snapshot")
        reference, digest = self.reference(path), _hash(path)
        receipt_path = path.parent / "provenance.json"
        receipt = self.json(receipt_path)
        if not isinstance(receipt, dict) or receipt.get("sha256") != digest:
            raise ValueError("Provided market feed receipt/hash does not match")
        self.hashes[reference] = digest
        self.feed_receipt = dict(database=reference, receipt=self.reference(receipt_path),
                                 receipt_content=receipt, evidence_basis="provided_git_observation_db",
                                 raw_response_verification="not_bundled")
        required = {"record_hash", "content_hash", "region_id", "source_id", "source_name", "source_url",
                    "market_id", "product_raw", "product_standard", "product_specification", "observation_date",
                    "collected_at", "original_price", "original_unit", "price_per_kg", "price_level",
                    "quality_status", "raw_evidence_path", "source_parser_version"}
        run_fields = {"region_id", "source_id", "status", "started_at", "finished_at", "latest_date"}
        try:
            with closing(sqlite3.connect(path.as_uri() + "?mode=ro&immutable=1", uri=True)) as connection:
                connection.row_factory = sqlite3.Row
                if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise ValueError("Provided market feed DB integrity failed")
                columns = {row[1] for row in connection.execute("PRAGMA table_info(observations)")}
                runs_columns = {row[1] for row in connection.execute("PRAGMA table_info(runs)")}
                if not required <= columns or not run_fields <= runs_columns:
                    raise ValueError("Provided market feed DB schema is incomplete")
                rows = [dict(row) for row in connection.execute("SELECT * FROM observations ORDER BY observation_date,record_hash")]
                runs = [dict(row) for row in connection.execute("SELECT * FROM runs")]
        except sqlite3.Error as exc:
            raise ValueError("Provided market feed DB is unreadable") from exc
        self.stats["provided_feed"] = Counter(input_rows=len(rows))
        primary_matches = self.feed_primary(rows, receipt)
        points = []
        identity_fields = ["region_id", "source_id", "market_id", "product_raw",
                           "product_specification", "observation_date", "price_level"]
        for row in rows:
            identity = "\0".join(_text(row.get(key)) for key in identity_fields)
            expected_record = hashlib.sha256(identity.encode()).hexdigest()[:20]
            content = identity + "\0" + repr(row["original_price"]) + "\0" + _text(row["original_unit"])
            expected_content = hashlib.sha256(content.encode()).hexdigest()[:20]
            if row["record_hash"] != expected_record or row["content_hash"] != expected_content:
                raise ValueError("Provided market feed record/content hash failed")
            raw_product = _text(row["product_raw"])
            product = next((crop for crop, aliases in ALIASES.items() if raw_product in aliases), None)
            if product is None:
                self.stats["provided_feed"]["unselected_product_identity"] += 1
                continue
            # Only these explicit aliases may differ from the producer's canonical name.
            if _text(row["product_standard"]) not in {product, raw_product}:
                self.stats["provided_feed"]["canonical_identity_mismatch"] += 1
                continue
            source_id, region, level = row["source_id"], row["region_id"], row["price_level"]
            declared = FEED_SOURCES.get(source_id)
            source_url = _text(row["source_url"])
            url = urlparse(source_url)
            if (declared is None or region not in declared[0] or level not in declared[1]
                    or url.scheme not in {"https", "http"} or url.hostname not in declared[2]
                    or not _text(row["source_parser_version"]).startswith(declared[3])
                    or not _text(row["source_name"]) or not _text(row["market_id"])):
                self.stats["provided_feed"]["unregistered_source_region_or_level"] += 1
                continue
            if row["quality_status"] != "OK":
                self.stats["provided_feed"]["quality_rejected"] += 1
                continue
            raw_day = _text(row["observation_date"])
            day = _day(raw_day) if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw_day) else None
            collected_raw = _text(row["collected_at"])
            collected = _timestamp(collected_raw)
            if (day is None or not collected or "T" not in collected_raw
                    or not re.search(r"(?:Z|[+-]\d{2}:\d{2})$", collected_raw)
                    or date.fromisoformat(collected[:10]) < date.fromisoformat(day)):
                self.stats["provided_feed"]["invalid_date_or_timestamp"] += 1
                continue
            collection_time = datetime.fromisoformat(collected)
            matched_run = False
            for run in runs:
                if (run["region_id"] != region or run["source_id"] != source_id
                        or run["status"] not in {"SUCCESS", "PARTIAL", "NO_NEW_PUBLICATION"}
                        or _text(run["latest_date"]) < day):
                    continue
                try:
                    start = datetime.fromisoformat(_text(run["started_at"]).replace("Z", "+00:00"))
                    end = datetime.fromisoformat(_text(run["finished_at"]).replace("Z", "+00:00"))
                    if start <= collection_time <= end:
                        matched_run = True
                        break
                except (ValueError, TypeError):
                    continue
            if not matched_run:
                self.stats["provided_feed"]["no_successful_collection_run"] += 1
                continue
            unit = _text(row["original_unit"])
            original, normalized = _positive(row["original_price"]), _positive(row["price_per_kg"])
            if unit not in MASS_FACTORS or original is None or normalized is None:
                self.stats["provided_feed"]["invalid_mass_unit_or_price"] += 1
                continue
            price = round(original * MASS_FACTORS[unit], 10)
            if not math.isclose(price, normalized, abs_tol=.0001):
                self.stats["provided_feed"]["normalization_mismatch"] += 1
                continue
            point = Observation(region, product, level, day, price, collected, original, unit, raw_product,
                                source_id, _text(row["source_name"]), source_url, _text(row["market_id"]), "A",
                                "provided_feed", reference, "provided_collection_db",
                                (reference, self.reference(receipt_path)),
                                _text(row["product_specification"]),
                                "provided_git_observation_db_raw_responses_not_bundled",
                                _text(row["raw_evidence_path"]), row["record_hash"],
                                row["record_hash"] in primary_matches)
            points.append(point)
            self.stats["provided_feed"]["accepted_rows"] += 1
        return points

    def feed_primary(self, rows: list[dict], receipt: dict) -> set[str]:
        """Optional current Shenyang wholesale response; never asserts other sources verified."""
        verification = receipt.get("current_primary_verification")
        if not isinstance(verification, dict):
            return set()
        response_path = (self.root / _text(verification.get("response_file"))).resolve()
        if not response_path.is_relative_to(self.root / "data/raw"):
            raise ValueError("Primary price evidence is outside registered raw data")
        raw = self.json(response_path)
        if (not isinstance(raw, dict) or not isinstance(raw.get("data"), list)
                or _hash(response_path) != verification.get("sha256")
                or len(raw["data"]) != verification.get("row_count")):
            raise ValueError("Primary price response hash/schema failed")
        parsed = urlparse(_text(verification.get("url")))
        query = parse_qs(parsed.query)
        day = _day(query.get("dates", [""])[0])
        if (parsed.hostname != "www.lnsyjgjc.com" or parsed.path != "/api/showList"
                or query.get("marketType") != ["1"] or day is None):
            raise ValueError("Primary price response scope is not Shenyang wholesale")
        verified = set()
        for item in raw["data"]:
            if not isinstance(item, dict):
                raise ValueError("Primary price response record is invalid")
            try:
                actual_day = datetime.fromtimestamp(float(item["dates"]) / 1000, CHINA_TZ).date().isoformat()
            except (KeyError, TypeError, ValueError, OverflowError) as exc:
                raise ValueError("Primary price response date is invalid") from exc
            if actual_day != day or _text(item.get("marketType")) != "1":
                raise ValueError("Primary price response differs from requested date/type")
            matched = [row for row in rows if row["region_id"] == "shenyang"
                       and row["source_id"] == "SRC-SY-CLZ" and row["price_level"] == "wholesale"
                       and row["observation_date"] == day and row["product_raw"] == item.get("productName")
                       and _text(row["product_specification"]) == _text(item.get("grade"))
                       and row["original_unit"] == item.get("unit")
                       and _positive(item.get("price")) == row["original_price"]]
            if not matched:
                raise ValueError("Primary price response differs from provided observation DB")
            verified.update(row["record_hash"] for row in matched)
        self.feed_receipt["current_primary_price_match_record_hashes"] = sorted(verified)
        self.feed_receipt["current_primary_scope"] = "Shenyang wholesale only; original other responses not bundled"
        return verified

    def daily_evidence(self, row: dict, day: str, price: float) -> tuple | None:
        raw_path = _text(row.get("raw_file"))
        path = (self.root / raw_path).resolve()
        raw_base = (self.root / "data/raw/daily/shenyang_clz").resolve()
        day_dir = raw_base / day
        levels = {"mt1": "wholesale", "mt2": "supermarket", "mt3": "retail_market"}
        market = path.name.split(".")[0]
        if (market not in levels or path.is_symlink() or not path.is_relative_to(day_dir)
                or path.parent not in (day_dir, day_dir / 'attempts')
                or not re.fullmatch(r'mt[123](?:\.[0-9a-f]{16}\.[0-9a-f]{32})?\.json', path.name)):
            return None
        metadata_path = day_dir / "metadata.json"
        if metadata_path.is_symlink() or not metadata_path.resolve().is_relative_to(day_dir): return None
        metadata, raw = self.json(metadata_path), self.json(path)
        entry = (metadata or {}).get(market)
        if (not isinstance(entry, dict) or not isinstance(raw, dict) or entry.get("status") != "OK"
                or entry.get("date") != day or entry.get("price_level") != levels[market]
                or _text(row.get("price_level")) != levels[market]
                or not isinstance(raw.get("data"), list)):
            return None
        if entry.get('active_raw_path'):
            active = (self.root / entry['active_raw_path']).resolve()
            if active != path or entry.get('raw_sha256') != _hash(path): return None
        collected = _timestamp(entry.get("crawl_time"))
        if not collected:
            return None
        unit, product = _text(row.get("unit_raw")), _text(row.get("crop_raw"))
        for item in raw["data"]:
            if not isinstance(item, dict) or _text(item.get("marketType")) != market[2:] or _text(item.get("productName")) != product or _text(item.get("unit")) != unit:
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
    dated = (point.day, _collection_key(point.collected), 2 if point.family == "daily" else 1,
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
            points.append(max(candidates, key=lambda point: (_collection_key(point.collected), point.family == "daily", point.source_path)))
        if points:
            series.append(Series(points))
    return series, conflicts


def _row(region: str, product: str, level: str, history: list[dict], collected: str,
         source: "Observation | None" = None) -> dict:
    last = history[-1]
    previous = history[-2]["price"] if len(history) > 1 else last["price"]
    row = dict(region=region, product=product, price_level=level, price=last["price"],
               observation_date=last["date"], collectedAt=collected,
               change_percent=(last["price"] / previous - 1) * 100, history=history)
    if source is not None:
        # V3: expose the exact real source identity for every displayed record.
        row["unit"] = "元/kg"
        row["source"] = {"id": source.source_id, "name": source.source_name, "url": source.source_url}
    return row


def _adopt(region: str, product: str, level: str, series: Series, tier: int,
           with_source: bool = False) -> tuple[dict, dict]:
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
    return (_row(region, product, level, history, series.latest.collected,
                 series.latest if with_source else None),
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
    collected = max((point.collected for point in contributors[-1]), key=_collection_key)
    return (_row(region, product, level, history, collected),
            dict(region=region, product=product, price_level=level, tier=4,
                 adoption="fixed_cohort_regional_mean", adopted_price_level=selected_level,
                 timestamp_basis="latest_actual_constituent_timestamp",
                 geography_scope="six_city_reference_area",
                 history=[dict(date=point["date"], constituents=[source.provenance() for source in sources])
                          for point, sources in zip(history, contributors)]))


def build(project_root: Path, feed_db: Path | None = None, strict: bool = False,
          configured_regions: "set[str] | None" = None) -> tuple[dict, dict]:
    reader = Reader(project_root)
    observations = []
    for family, relative in INPUTS.items():
        if strict and not (reader.root / relative).is_file():
            reader.stats[family]["asset_unavailable"] += 1
            continue
        observations.extend(reader.rows(family))
    selected_feed = Path(feed_db).resolve() if feed_db is not None else reader.root / DEFAULT_FEED_DB
    if feed_db is not None or selected_feed.is_file():
        observations.extend(reader.feed(selected_feed))
    date_only_excluded = sum(len(point.collected) == 10 for point in observations) if strict else 0
    # V3 promises an actual collection instant. Keep date-only history for the
    # separate historical/presentation contract; never turn it into midnight.
    if strict:
        observations = [point for point in observations if len(point.collected) > 10]
    series, conflicts = _series(observations)
    records, lineage, missing = [], [], []
    levels = list(PRICE_LEVELS) if strict else list(LEGACY_PRICE_LEVELS)
    for region in REGIONS:
        for product in PRODUCTS:
            candidates = [s for s in series if s.latest.product == product]
            for level in levels:
                same_region = [s for s in candidates if s.latest.region == region]
                chosen = _best([s for s in same_region if s.latest.level == level], level)
                tier = 1
                if strict and chosen is None:
                    missing.append(dict(region=region, product=product, price_level=level, reason="no_local_observation"))
                    continue
                if chosen is None:
                    chosen, tier = _best(same_region, level), 2
                if chosen is None and region != "liaoning":
                    chosen, tier = _best([s for s in candidates if s.latest.region != region], level, True), 3
                row, evidence = (_adopt(region, product, level, chosen, tier, with_source=strict)
                                 if chosen else _mean(region, product, level, candidates))
                records.append(row)
                lineage.append(evidence)
    if strict:
        # V3: only local, same-price-level, source-verified observations. Coverage is
        # derived from the caller's verified collector registry — never hardcoded.
        configured = set(configured_regions or ())
        payload = dict(schema_version="3", products=list(PRODUCTS), price_levels=list(PRICE_LEVELS),
                       published_at=None, records=records, missing=missing,
                       coverage={region: dict(
                           collection_status="configured" if region in configured else "not_configured",
                           available_records=sum(row["region"] == region for row in records),
                           total_records=len(PRODUCTS) * len(PRICE_LEVELS),
                           latest_observation_date=max((row["observation_date"] for row in records if row["region"] == region), default=None),
                           latest_collected_at=max((row["collectedAt"] for row in records if row["region"] == region), key=_collection_key, default=None),
                       ) for region in REGIONS})
    else:
        payload = dict(schema_version="1", products=list(PRODUCTS), price_levels=list(LEGACY_PRICE_LEVELS), records=records)
    payload = validate_display(payload)
    # Source changes while reading must never publish a mixed generation.
    for relative, digest in reader.hashes.items():
        if _hash(reader.root / relative) != digest:
            raise ValueError(f"Price source changed during publication: {relative}")
    audit = dict(schema_version="1", publisher="pipelines/publishing/publish_market_display.py",
                 generated_at=datetime.now(timezone.utc).isoformat(),
                 source_hashes=reader.hashes, input_statistics={k: dict(v) for k, v in reader.stats.items()},
                 same_source_conflict_days_omitted=conflicts,
                 date_only_observations_excluded_v3=date_only_excluded,
                 tier_counts=dict(Counter(str(row["tier"]) for row in lineage)),
                 observation_date_range=[min((r["observation_date"] for r in records), default=None), max((r["observation_date"] for r in records), default=None)],
                 policy="local_same_price_level" if strict else "competition_complete", missing_count=len(missing),
                 record_count=len(records), records=lineage)
    if reader.feed_receipt is not None:
        audit["provided_feed"] = reader.feed_receipt
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
            frontend_root: Path | None = None, feed_db: Path | None = None, *,
            strict: bool = False, write_frontend: bool = True,
            configured_regions: "set[str] | None" = None) -> dict:
    project_root = Path(project_root).resolve()
    runtime_root = Path(runtime_root or project_root / "AgriScope/runtime").resolve()
    frontend_root = Path(frontend_root or project_root / "AgriScope/frontend").resolve()
    payload, audit = build(project_root, feed_db, strict, configured_regions)
    if strict:
        if write_frontend:
            raise ValueError("scheduled observed publications must not mutate frontend sources")
        return publish_generation(runtime_root, payload, audit)
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


def publish_generation(runtime_root: Path, payload: dict, audit: dict) -> dict:
    """Immutable data-only publication; one atomic manifest commit exposes both files."""
    from agriscope_daily_publication import digest, generation_id
    from agriscope_market_publication import PREFIX, resolve, validate_entry
    from agriscope_publication import atomic_bytes, publication_lock, retain_entry
    runtime = Path(runtime_root).resolve()
    manifest = runtime / 'manifest.json'
    if not manifest.is_file() or manifest.is_symlink():
        raise ValueError('existing runtime manifest required')
    # A changed wall-clock audit timestamp cannot defeat repeated-run idempotency.
    content = _encoded(validate_display(payload))
    audit = {k: v for k, v in audit.items() if k != 'generated_at'}
    audit['display_sha256'] = hashlib.sha256(content).hexdigest()
    data = {'display.json': content, 'lineage.json': _encoded(audit)}
    files = {name: hashlib.sha256(body).hexdigest() for name, body in data.items()}
    identity = generation_id(files)
    parent = runtime / PREFIX
    parent.mkdir(parents=True, exist_ok=True)
    if parent.is_symlink() or not parent.resolve().is_relative_to(runtime):
        raise ValueError('market publication directory escapes runtime')
    with publication_lock(runtime):
        original = manifest.read_bytes()
        obj = json.loads(original)
        previous = resolve(runtime)
        if previous and previous['generation'] == PREFIX + identity:
            return {'status': 'UNCHANGED', 'generation': previous['generation'], 'record_count': len(payload['records']), 'missing_count': len(payload['missing'])}
        if previous:
            old = json.loads((previous['directory'] / 'display.json').read_text())
            previous_dates = {(r['region'], r['product'], r['price_level']): r['observation_date'] for r in old['records']}
            new_keys = {(r['region'], r['product'], r['price_level']) for r in payload['records']}
            if not set(previous_dates) <= new_keys:
                raise ValueError('local observations disappeared; preserve the previous generation')
            for row in payload['records']:
                if row['observation_date'] < previous_dates.get((row['region'], row['product'], row['price_level']), ''):
                    raise ValueError('local observation date regression')
        destination = parent / identity
        if not destination.exists():
            with tempfile.TemporaryDirectory(prefix='.stage-', dir=parent) as temporary:
                stage = Path(temporary) / 'generation'; stage.mkdir()
                for name, body in data.items(): atomic_bytes(stage / name, body, 0o440)
                os.replace(stage, destination)
                fd = os.open(parent, os.O_RDONLY)
                try: os.fsync(fd)
                finally: os.close(fd)
        entry = dict(schema_version=1, generation=PREFIX + identity, files=files,
                     published_at=datetime.now(timezone.utc).isoformat())
        validate_entry(runtime, entry)
        retain_entry(runtime, 'market_publication', obj.get('market_publication'))
        entry = retain_entry(runtime, 'market_publication', entry)
        obj['market_publication'] = entry
        if manifest.read_bytes() != original:
            raise ValueError('manifest changed during publication')
        atomic_bytes(manifest, json.dumps(obj, ensure_ascii=False, indent=2).encode())
        return {'status': 'PUBLISHED', 'generation': entry['generation'], 'record_count': len(payload['records']),
                'missing_count': len(payload['missing']), 'coverage': payload['coverage']}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", type=Path, default=PRODUCT_ROOT.parent)
    parser.add_argument("--runtime-root", type=Path)
    parser.add_argument("--frontend-root", type=Path)
    parser.add_argument("--strict", action="store_true", help="Only local same-level observations; missing cells remain explicitly unavailable")
    parser.add_argument("--feed-db", type=Path, help="Optional latest user-provided observation DB with adjacent provenance.json")
    parser.add_argument("--configured-regions", help="Comma-separated region ids with configured+verified collectors (drives V3 coverage)")
    args = parser.parse_args(argv)
    configured = {r.strip() for r in (args.configured_regions or "").split(",") if r.strip()} or None
    try:
        print(json.dumps(publish(args.project_root, args.runtime_root, args.frontend_root, args.feed_db, strict=args.strict, write_frontend=not args.strict, configured_regions=configured), ensure_ascii=False))
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"Market publication refused: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
