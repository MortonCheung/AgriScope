"""Presentation adoption uses real source rows; every mutation is isolated in tmp_path."""
import hashlib
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
import sqlite3

import pandas as pd
import pytest

from pipelines.publishing import publish_market_display as P


def market(product="黄瓜", city="沈阳", level="wholesale", day="2025-01-03", price=3, **fields):
    return dict(city=city, crop_standard=product, crop_raw=product,
                price_original=price, unit_original="元/kg", price_per_kg=price,
                price_level_canonical=level, observation_date=day,
                retrieval_time="2025-02-01", quality_grade="A", source_id="official",
                source_name="市价格监测", source_url="https://example.gov.cn/prices",
                market_name="同一市场", **fields)


def package(root: Path, rows=None, province=None, daily=None):
    if rows is None:
        rows = [market(crop, day=day, price=price) for crop in P.PRODUCTS
                for day, price in [("2025-01-01", 2), ("2025-01-03", 3)]]
    for family, records in [("market", rows), ("province", province or []), ("daily", daily or [])]:
        path = root / P.INPUTS[family]
        path.parent.mkdir(parents=True, exist_ok=True)
        pd.DataFrame(records or [], columns=None if records else ["crop_standard"]).to_parquet(path)


def record(payload, region="shenyang", product="黄瓜", level="wholesale"):
    return next(row for row in payload["records"] if
                (row["region"], row["product"], row["price_level"]) == (region, product, level))


def evidence(audit, region="shenyang", product="黄瓜", level="wholesale"):
    return next(row for row in audit["records"] if
                (row["region"], row["product"], row["price_level"]) == (region, product, level))


def test_complete_deterministic_publication_and_source_preservation(tmp_path):
    package(tmp_path)
    runtime, frontend = tmp_path / "standalone/runtime", tmp_path / "standalone/frontend"
    frozen = runtime / "models/frozen.pkl"
    frozen.parent.mkdir(parents=True)
    frozen.write_bytes(b"immutable-model")
    research = runtime / "research/keep.json"
    research.parent.mkdir(parents=True)
    research.write_bytes(b"immutable-research")
    originals = {path: hashlib.sha256((tmp_path / path).read_bytes()).hexdigest() for path in P.INPUTS.values()}
    first = P.publish(tmp_path, runtime, frontend)
    data = runtime / "data/market/display.json"
    contents = data.read_bytes()
    assert len(json.loads(contents)["records"]) == 168
    assert (frontend / "src/domain/market/publishedMarket.json").read_bytes() == contents
    assert (runtime / "data/market/lineage.json").is_file()
    assert first["sha256"] == hashlib.sha256(contents).hexdigest()
    assert P.publish(tmp_path, runtime, frontend)["sha256"] == first["sha256"]
    assert data.read_bytes() == contents
    assert all(hashlib.sha256((tmp_path / path).read_bytes()).hexdigest() == sha for path, sha in originals.items())
    assert frozen.read_bytes() == b"immutable-model" and research.read_bytes() == b"immutable-research"


def test_priority_preserves_old_same_type_before_new_other_type(tmp_path):
    rows = [market(crop) for crop in P.PRODUCTS]
    rows += [market(city="铁岭", day="2020-01-01", price=2),
             market(city="铁岭", level="supermarket", day="2025-01-09", price=9)]
    package(tmp_path, rows)
    payload, audit = P.build(tmp_path)
    assert record(payload, "tieling")["price"] == 2
    assert record(payload, "tieling")["observation_date"] == "2020-01-01"
    assert evidence(audit, "tieling")["tier"] == 1
    row = record(payload, "tieling", level="retail_market")
    assert row["price"] == 9 and row["change_percent"] == 0
    assert evidence(audit, "tieling", level="retail_market")["tier"] == 2
    assert evidence(audit, "tieling", level="retail_market")["adopted"]["price_level"] == "supermarket"


def test_regional_fallback_chooses_price_type_without_multiplying_prices(tmp_path):
    rows = [market(crop, level="wholesale", day="2025-01-01", price=3) for crop in P.PRODUCTS]
    rows += [market(city="锦州", level="supermarket", day="2025-02-01", price=8)]
    package(tmp_path, rows)
    payload, audit = P.build(tmp_path)
    assert record(payload, "dandong")["price"] == 3
    assert record(payload, "dandong", level="supermarket")["price"] == 8
    assert evidence(audit, "dandong")["tier"] == 3
    assert evidence(audit, "dandong", level="supermarket")["adopted"]["region"] == "jinzhou"


def test_province_uses_actual_weekly_series_and_missing_crop_has_fixed_cohort_mean(tmp_path):
    rows = [market(crop, day=day, price=price) for crop in P.PRODUCTS
            for day, price in [("2025-01-01", 2), ("2025-01-03", 3)]]
    rows += [market("甘蓝", city="大连", day="2025-01-01", price=4),
             market("甘蓝", city="大连", day="2025-01-03", price=5)]
    province = [dict(crop_standard="黄瓜", crop_raw="黄瓜", price=price, unit="元/公斤",
                     price_level="wholesale", pub_date=day, source_level="S", geo_level="province",
                     source_id="province", source_name="省蔬菜价格周报", access_date="2025-01-09")
                for day, price in [("2025-01-01", 5), ("2025-01-08", 4)]]
    package(tmp_path, rows, province)
    payload, audit = P.build(tmp_path)
    assert record(payload, "liaoning")["history"] == [dict(date="2025-01-01", price=5), dict(date="2025-01-08", price=4)]
    adopted = evidence(audit, "liaoning", level="supermarket")
    assert adopted["adopted"]["price_level"] == "wholesale"
    cabbage = record(payload, "liaoning", "甘蓝")
    assert cabbage["price"] == 4 and cabbage["history"][-2]["price"] == 3
    assert cabbage["change_percent"] == pytest.approx(100 / 3)
    mean = evidence(audit, "liaoning", "甘蓝")
    assert mean["tier"] == 4 and len(mean["history"][-1]["constituents"]) == 2


def test_mean_with_different_latest_dates_is_single_point_without_false_trend(tmp_path):
    rows = [market(crop) for crop in P.PRODUCTS]
    rows += [market("甘蓝", city="大连", day="2025-01-01", price=5)]
    package(tmp_path, rows)
    payload, audit = P.build(tmp_path)
    mean = record(payload, "liaoning", "甘蓝")
    assert mean["price"] == 4 and mean["observation_date"] == "2025-01-03"
    assert len(mean["history"]) == 1 and mean["change_percent"] == 0
    assert {row["observation_date"] for row in evidence(audit, "liaoning", "甘蓝")["history"][0]["constituents"]} == {"2025-01-01", "2025-01-03"}


def test_week_month_anchors_keep_real_days_and_exact_previous_change(tmp_path):
    rows = [market(crop) for crop in P.PRODUCTS if crop != "黄瓜"]
    rows += [market(day=day, price=price) for day, price in [
        ("2025-02-28", 1), ("2025-03-01", 2), ("2025-03-23", 3),
        ("2025-03-25", 4), ("2025-03-29", 5), ("2025-03-30", 6), ("2025-03-31", 7)]]
    package(tmp_path, rows)
    payload, audit = P.build(tmp_path)
    selected = record(payload)
    assert selected["history"] == [dict(date=day, price=price) for day, price in
                                    [("2025-03-01", 2), ("2025-03-23", 3), ("2025-03-30", 6), ("2025-03-31", 7)]]
    assert selected["change_percent"] == pytest.approx((7 / 6 - 1) * 100)
    assert "2025-03-24" not in {point["date"] for point in selected["history"]}
    actual = evidence(audit)["history"]
    assert [point["observation_date"] for point in actual] == [point["date"] for point in selected["history"]]


@pytest.mark.parametrize("unit,factor", [("元/斤", 2), ("元/500克", 2), ("元/500g", 2),
                                         ("元/kg", 1), ("元/公斤", 1), ("元/250g", 4),
                                         ("元/吨", .001), ("元/两", 20)])
def test_explicit_mass_conversions_preserve_real_original_price(tmp_path, unit, factor):
    rows = [market(crop) for crop in P.PRODUCTS]
    rows.append(dict(market(day="2025-01-04", price=2), unit_original=unit, price_per_kg=2 * factor))
    package(tmp_path, rows)
    payload, audit = P.build(tmp_path)
    assert record(payload)["price"] == pytest.approx(2 * factor)
    actual = evidence(audit)["adopted"]
    assert actual["original_price"] == 2 and actual["original_unit"] == unit


def test_polluted_products_unknown_units_proxy_future_and_conflicts_never_publish(tmp_path):
    rows = [market(crop) for crop in P.PRODUCTS]
    base = market("土豆", day="2025-01-08", price=90)
    invalid = [dict(base, crop_raw="土豆粉"), dict(base, unit_original="元/5升"),
               dict(base, is_proxy=True), dict(base, is_derived="true"),
               dict(base, quality_grade="C"), dict(base, observation_date="2099-01-01"),
               dict(base, price_per_kg=20), dict(base, price_original=float("nan")),
               dict(base, processing_state="processed")]
    rows += invalid + [market("土豆", day="2025-01-05", price=4), market("土豆", day="2025-01-05", price=6)]
    # A separate real product identity remains its own history, rather than being merged.
    rows.append(dict(market("土豆", day="2025-01-01", price=2), crop_raw="马铃薯"))
    package(tmp_path, rows)
    payload, audit = P.build(tmp_path)
    assert record(payload, product="土豆")["price"] == 3
    assert record(payload, product="土豆")["history"] == [dict(date="2025-01-03", price=3)]
    assert audit["same_source_conflict_days_omitted"] == 1
    assert audit["input_statistics"]["market"]["different_product_identity"] == 1
    assert audit["input_statistics"]["market"]["normalization_mismatch"] == 1


def daily(root, raw_price=2, normalized_price=4, status="OK"):
    day = "2025-01-04"
    raw_path = f"data/raw/daily/shenyang_clz/{day}/mt2.json"
    path = root / raw_path
    path.parent.mkdir(parents=True, exist_ok=True)
    stamp = int(datetime(2025, 1, 4, tzinfo=timezone(timedelta(hours=8))).timestamp() * 1000)
    path.write_text(json.dumps({"data": [dict(productName="黄瓜", price=raw_price, unit="元/500g", dates=stamp, marketType="2")]}))
    (path.parent / "metadata.json").write_text(json.dumps({"mt2": dict(status=status, date=day,
        price_level="supermarket", crawl_time="2025-01-05 08:09:10")}))
    return dict(city="沈阳", crop_standard="黄瓜", crop_raw="黄瓜", price=normalized_price / 2,
                unit_raw="元/500g", price_per_kg=normalized_price, date=day, market="超市零售",
                price_level="supermarket", quality_status="OK", source_id="daily-official",
                source_name="官方菜篮子", raw_file=raw_path, crawl_time="2099-01-01 00:00:00")


def test_daily_raw_evidence_controls_timestamp_conversion_and_identity(tmp_path):
    source = daily(tmp_path)
    package(tmp_path, daily=[source])
    payload, audit = P.build(tmp_path)
    selected = record(payload, level="supermarket")
    assert selected["price"] == 4 and selected["observation_date"] == "2025-01-04"
    assert selected["collectedAt"] == "2025-01-05T08:09:10+08:00"
    actual = evidence(audit, level="supermarket")["adopted"]
    assert actual["timestamp_basis"] == "raw_metadata_crawl_time" and len(actual["evidence_paths"]) == 2
    assert source["raw_file"] in audit["source_hashes"]


@pytest.mark.parametrize("defect", ["different_raw_price", "failed_metadata", "path_escape"])
def test_unverified_daily_evidence_is_not_used(tmp_path, defect):
    source = daily(tmp_path, raw_price=1 if defect == "different_raw_price" else 2,
                   status="FAIL" if defect == "failed_metadata" else "OK")
    if defect == "path_escape":
        source["raw_file"] = "../outside.json"
    package(tmp_path, daily=[source])
    payload, audit = P.build(tmp_path)
    assert record(payload, level="supermarket")["price"] == 3
    assert audit["input_statistics"]["daily"]["unverified_daily_evidence"] == 1


def test_failed_or_changed_inputs_preserve_last_complete_publication(tmp_path, monkeypatch):
    package(tmp_path)
    P.publish(tmp_path)
    destination = tmp_path / "AgriScope/runtime/data/market/display.json"
    before = destination.read_bytes()
    original = P.Reader.rows
    def mutate_after_read(self, family):
        result = original(self, family)
        if family == "market":
            path = self.root / P.INPUTS[family]
            frame = pd.read_parquet(path)
            frame.loc[0, "price_original"] = 100
            frame.to_parquet(path)
        return result
    monkeypatch.setattr(P.Reader, "rows", mutate_after_read)
    with pytest.raises(ValueError, match="changed during publication"):
        P.publish(tmp_path)
    assert destination.read_bytes() == before
    monkeypatch.setattr(P.Reader, "rows", original)
    package(tmp_path, rows=[])
    with pytest.raises(ValueError, match="No real regional price"):
        P.publish(tmp_path)
    assert destination.read_bytes() == before


def feed_record(product="黄瓜", region="shenyang", level="wholesale", day="2025-01-04",
                price=4, raw_product=None, specification="新鲜一级", **fields):
    source = "SRC-SY-CLZ" if region == "shenyang" else "SRC-LN-FGW-BYCITY"
    row = dict(record_hash="", content_hash="", region_id=region, source_id=source,
               source_name="官方菜篮子", source_url="https://fgw.shenyang.gov.cn/wjgz/clzxxfbpt/"
               if region == "shenyang" else "https://fgw.ln.gov.cn/wjjc/jgjc/ReportGoodsInfoByCity.aspx",
               market_id=f"{region}_{level}", product_raw=raw_product or product,
               product_standard=product, product_specification=specification, observation_date=day,
               collected_at="2025-01-05T08:09:10+08:00", original_price=float(price / 2),
               original_unit="元/500g", price_per_kg=price, price_level=level, quality_status="OK",
               raw_evidence_path="raw/shenyang/SRC-SY-CLZ/2025-01-04/mt3.json",
               source_parser_version="shenyang_clz-1.0.0" if region == "shenyang" else "lnfgw_by_city-1.0.0")
    row.update(fields)
    identity = "\0".join(str(row[key] or "") for key in ["region_id", "source_id", "market_id", "product_raw",
                           "product_specification", "observation_date", "price_level"])
    row["record_hash"] = hashlib.sha256(identity.encode()).hexdigest()[:20]
    row["content_hash"] = hashlib.sha256((identity + "\0" + repr(row["original_price"])
                                         + "\0" + row["original_unit"]).encode()).hexdigest()[:20]
    return row


def write_feed(root, records, path=None):
    path = path or root / P.DEFAULT_FEED_DB
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        path.unlink()
    with sqlite3.connect(path) as db:
        db.execute("""CREATE TABLE observations (
            record_hash TEXT PRIMARY KEY,content_hash TEXT,region_id TEXT,source_id TEXT,source_name TEXT,
            source_url TEXT,market_id TEXT,product_raw TEXT,product_standard TEXT,product_specification TEXT,
            observation_date TEXT,collected_at TEXT,original_price REAL,original_unit TEXT,price_per_kg REAL,
            price_level TEXT,quality_status TEXT,raw_evidence_path TEXT,source_parser_version TEXT)""")
        db.execute("""CREATE TABLE runs (region_id TEXT,source_id TEXT,status TEXT,started_at TEXT,
                    finished_at TEXT,latest_date TEXT)""")
        for row in records:
            keys = list(row)
            db.execute(f"INSERT INTO observations ({','.join(keys)}) VALUES ({','.join('?' for _ in keys)})",
                       [row[key] for key in keys])
            db.execute("INSERT INTO runs VALUES (?,?,?,?,?,?)", (row["region_id"], row["source_id"], "SUCCESS",
                       row["collected_at"], row["collected_at"], row["observation_date"]))
    # Unlike source fixtures, the production connection must be strictly read-only.
    db.close()
    receipt = dict(git_commit="provided-fixture-commit", git_blob="provided-fixture-blob",
                   sha256=hashlib.sha256(path.read_bytes()).hexdigest(), raw_http_responses_in_original_asset=False)
    (path.parent / "provenance.json").write_text(json.dumps(receipt))
    return path


def update_feed_receipt(path):
    receipt_path = path.parent / "provenance.json"
    receipt = json.loads(receipt_path.read_text())
    receipt["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    receipt_path.write_text(json.dumps(receipt))


def test_provided_feed_latest_prices_keep_true_collection_date_and_fallbacks(tmp_path):
    package(tmp_path)
    row = feed_record(price=4)
    path = write_feed(tmp_path, [row])
    before = path.read_bytes()
    payload, audit = P.build(tmp_path)
    current = record(payload)
    assert current["price"] == 4 and current["observation_date"] == "2025-01-04"
    assert current["collectedAt"] == "2025-01-05T08:09:10+08:00"
    assert current["change_percent"] == 0 and current["history"] == [dict(date="2025-01-04", price=4)]
    assert record(payload, product="土豆")["price"] == 3
    adopted = evidence(audit)["adopted"]
    assert adopted["timestamp_basis"] == "provided_collection_db"
    assert adopted["raw_evidence_reference"].endswith("mt3.json")
    assert "raw_responses_not_bundled" in adopted["evidence_basis"]
    assert adopted["current_primary_price_match"] is False
    assert P.DEFAULT_FEED_DB in audit["source_hashes"]
    assert str(Path(P.DEFAULT_FEED_DB).parent / "provenance.json") in audit["source_hashes"]
    assert audit["provided_feed"]["raw_response_verification"] == "not_bundled"
    assert path.read_bytes() == before and not list(path.parent.glob("*-wal")) and not list(path.parent.glob("*-shm"))


def test_provided_feed_does_not_override_older_direct_type_with_new_different_type(tmp_path):
    package(tmp_path, rows=[market(crop, city="丹东") for crop in P.PRODUCTS])
    write_feed(tmp_path, [feed_record(region="dandong", level="market_average", price=8)])
    payload, audit = P.build(tmp_path)
    assert record(payload, "dandong")["price"] == 3
    assert evidence(audit, "dandong")["tier"] == 1
    assert record(payload, "dandong", level="supermarket")["price"] == 8
    assert evidence(audit, "dandong", level="supermarket")["adopted"]["price_level"] == "market_average"


def test_feed_exact_aliases_include_round_cabbage_and_green_eggplant_only(tmp_path):
    package(tmp_path)
    write_feed(tmp_path, [feed_record("甘蓝", level="supermarket", raw_product="圆白菜", price=2),
                          feed_record("绿茄子", level="retail_market", price=3.38),
                          feed_record("西红柿", raw_product="圣女果", price=10)])
    payload, audit = P.build(tmp_path)
    assert record(payload, product="甘蓝", level="supermarket")["price"] == 2
    assert record(payload, product="茄子", level="retail_market")["price"] == 3.38
    assert record(payload, product="西红柿")["price"] == 3
    assert audit["input_statistics"]["provided_feed"]["accepted_rows"] == 2
    assert audit["input_statistics"]["provided_feed"]["unselected_product_identity"] == 1


def test_feed_source_spec_and_legacy_histories_never_splice(tmp_path):
    package(tmp_path)
    write_feed(tmp_path, [feed_record(day="2025-01-01", specification="一级", price=3),
                          feed_record(day="2025-01-04", specification="二级", price=8)])
    payload, audit = P.build(tmp_path)
    selected = record(payload)
    assert selected["price"] == 8 and selected["change_percent"] == 0 and len(selected["history"]) == 1
    assert evidence(audit)["adopted"]["specification"] == "二级"
    assert [p["observation_date"] for p in evidence(audit)["history"]] == ["2025-01-04"]


def test_provided_database_cannot_splice_legacy_history_even_with_identical_source_labels(tmp_path):
    rows = [market(crop) for crop in P.PRODUCTS if crop != "黄瓜"]
    rows += [dict(market(day=day, price=price), source_id="SRC-SY-CLZ", source_name="官方菜篮子",
                  market_name="shenyang_wholesale") for day, price in [("2025-01-01", 2), ("2025-01-03", 3)]]
    package(tmp_path, rows)
    write_feed(tmp_path, [feed_record(price=6, specification="")])
    payload, audit = P.build(tmp_path)
    assert record(payload)["history"] == [dict(date="2025-01-04", price=6)]
    assert record(payload)["change_percent"] == 0
    assert evidence(audit)["adopted"]["timestamp_basis"] == "provided_collection_db"


def test_feed_real_multi_day_same_spec_series_retains_exact_change(tmp_path):
    package(tmp_path)
    write_feed(tmp_path, [feed_record(day="2025-01-01", price=3), feed_record(day="2025-01-04", price=6)])
    payload, audit = P.build(tmp_path)
    selected = record(payload)
    assert selected["history"] == [dict(date="2025-01-01", price=3), dict(date="2025-01-04", price=6)]
    assert selected["change_percent"] == 100
    assert {r["source_id"] for r in evidence(audit)["history"]} == {"SRC-SY-CLZ"}


@pytest.mark.parametrize("defect", ["record_hash", "content_hash", "missing_column", "receipt_hash"])
def test_untrusted_feed_refuses_to_publish_without_overwriting_last_valid_view(tmp_path, defect):
    package(tmp_path)
    P.publish(tmp_path)
    destination = tmp_path / "AgriScope/runtime/data/market/display.json"
    previous = destination.read_bytes()
    path = write_feed(tmp_path, [feed_record()])
    if defect == "receipt_hash":
        (path.parent / "provenance.json").write_text('{"sha256":"wrong"}')
    else:
        with sqlite3.connect(path) as connection:
            if defect == "missing_column":
                connection.execute("ALTER TABLE observations DROP COLUMN content_hash")
            else:
                connection.execute(f"UPDATE observations SET {defect}='wrong'")
        connection.close()
        update_feed_receipt(path)
    with pytest.raises(ValueError, match="hash|schema"):
        P.publish(tmp_path)
    assert destination.read_bytes() == previous


@pytest.mark.parametrize("defect", ["unknown_source", "wrong_region", "wrong_level", "wrong_domain",
                                     "bad_unit", "kg_mismatch", "future", "undated_collection", "qc", "failed_run"])
def test_provided_feed_invalid_rows_are_excluded_not_relabelled(tmp_path, defect):
    package(tmp_path)
    fields = {}
    if defect == "unknown_source":
        fields["source_id"] = "SRC-UNREGISTERED"
    elif defect == "wrong_region":
        fields["region_id"] = "dandong"
    elif defect == "wrong_level":
        fields["price_level"] = "farm_gate"
    elif defect == "wrong_domain":
        fields["source_url"] = "https://example.com/not-official"
    elif defect == "bad_unit":
        fields["original_unit"] = "元/500ml"
    elif defect == "kg_mismatch":
        fields["price_per_kg"] = 99
    elif defect == "future":
        fields["observation_date"] = "2099-01-01"
    elif defect == "undated_collection":
        fields["collected_at"] = "2025-01-05"
    elif defect == "qc":
        fields["quality_status"] = "SUSPECT"
    path = write_feed(tmp_path, [feed_record(**fields)])
    if defect == "failed_run":
        with sqlite3.connect(path) as connection:
            connection.execute("UPDATE runs SET status='FAILED'")
        connection.close()
        update_feed_receipt(path)
    payload, audit = P.build(tmp_path)
    assert record(payload)["price"] == 3
    assert audit["input_statistics"]["provided_feed"].get("accepted_rows", 0) == 0


def test_explicit_latest_feed_path_is_supported_without_default_db(tmp_path):
    package(tmp_path)
    path = write_feed(tmp_path, [feed_record(price=8)], tmp_path / "supplied/latest.sqlite")
    payload, audit = P.build(tmp_path, path)
    assert record(payload)["price"] == 8
    assert "supplied/latest.sqlite" in audit["source_hashes"]
    assert P.main(["--project-root", str(tmp_path), "--feed-db", str(path)]) == 0


def primary_evidence(root, db, price=2, market_type="1"):
    path = root / "data/raw/provided-primary.json"
    stamp = int(datetime(2025, 1, 4, tzinfo=timezone(timedelta(hours=8))).timestamp() * 1000)
    path.write_text(json.dumps({"data": [dict(productName="黄瓜", grade="新鲜一级", price=price,
        unit="元/500g", dates=stamp, marketType=market_type)]}))
    receipt_path = db.parent / "provenance.json"
    receipt = json.loads(receipt_path.read_text())
    receipt["current_primary_verification"] = dict(response_file="data/raw/provided-primary.json",
        sha256=hashlib.sha256(path.read_bytes()).hexdigest(), row_count=1,
        url="https://www.lnsyjgjc.com/api/showList?marketType=1&dates=2025-01-04&page=1&limit=100")
    receipt_path.write_text(json.dumps(receipt))
    return path


def test_current_primary_match_is_scoped_to_verified_wholesale_not_other_types(tmp_path):
    package(tmp_path)
    path = write_feed(tmp_path, [feed_record(price=4), feed_record(level="supermarket", price=6)])
    primary_evidence(tmp_path, path)
    payload, audit = P.build(tmp_path)
    assert record(payload)["price"] == 4
    assert evidence(audit)["adopted"]["current_primary_price_match"] is True
    assert evidence(audit, level="supermarket")["adopted"]["current_primary_price_match"] is False
    assert len(audit["provided_feed"]["current_primary_price_match_record_hashes"]) == 1
    assert "data/raw/provided-primary.json" in audit["source_hashes"]
    assert audit["provided_feed"]["raw_response_verification"] == "not_bundled"


@pytest.mark.parametrize("defect", ["mismatched_price", "wrong_type", "wrong_raw_hash"])
def test_declared_primary_response_must_really_match_db_scope_and_hash(tmp_path, defect):
    package(tmp_path)
    path = write_feed(tmp_path, [feed_record(price=4)])
    proof = primary_evidence(tmp_path, path, price=3 if defect == "mismatched_price" else 2,
                             market_type="2" if defect == "wrong_type" else "1")
    if defect == "wrong_raw_hash":
        proof.write_text('{"data":[]}')
    with pytest.raises(ValueError, match="Primary price"):
        P.build(tmp_path)


def test_raw_price_type_cannot_be_relabelled_as_the_metadata_type(tmp_path):
    source=daily(tmp_path)
    raw=tmp_path/source['raw_file'];payload=json.loads(raw.read_text());payload['data'][0]['marketType']='1';raw.write_text(json.dumps(payload))
    package(tmp_path,daily=[source]);body,audit=P.build(tmp_path,strict=True)
    assert not any(row['region']=='shenyang' and row['product']=='黄瓜' and row['price_level']=='supermarket' for row in body['records'])
    assert audit['input_statistics']['daily']['unverified_daily_evidence']==1
