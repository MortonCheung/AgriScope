"""V3 collection times are instants; legacy dates retain their actual precision."""
from copy import deepcopy

import pytest

from backend.app.services.market_display_service import empty_observed, validate_display


def publication():
    body = empty_observed()
    for product, collected in [("黄瓜", "2025-01-05T09:00:00+08:00"), ("甘蓝", "2025-01-05T02:00:00Z")]:
        body["records"].append(dict(region="shenyang", product=product, price_level="wholesale", price=3.,
            observation_date="2025-01-04", collectedAt=collected, change_percent=0.,
            history=[dict(date="2025-01-04", price=3.)], unit="元/kg",
            source=dict(id="test-source", name="Test fixture", url="https://example.test/prices")))
    body["missing"] = [row for row in body["missing"] if not (row["region"] == "shenyang"
        and row["price_level"] == "wholesale" and row["product"] in {"黄瓜", "甘蓝"})]
    body["coverage"]["shenyang"].update(available_records=2, latest_observation_date="2025-01-04",
        latest_collected_at="2025-01-05T02:00:00Z")
    return body


def test_v3_coverage_compares_utc_instants_and_accepts_equivalent_offsets():
    body = publication()
    assert validate_display(body) is body
    body["coverage"]["shenyang"]["latest_collected_at"] = "2025-01-05T10:00:00+08:00"
    assert validate_display(body) is body
    body["coverage"]["shenyang"]["latest_collected_at"] = "2025-01-05T09:00:00+08:00"
    with pytest.raises(ValueError, match="coverage time differs"):
        validate_display(body)


@pytest.mark.parametrize("field", ["record", "coverage", "publication"])
def test_v3_rejects_date_only_times(field):
    body = publication()
    if field == "record": body["records"][0]["collectedAt"] = "2025-01-05"
    if field == "coverage": body["coverage"]["shenyang"]["latest_collected_at"] = "2025-01-05"
    if field == "publication": body["published_at"] = "2025-01-05"
    with pytest.raises(ValueError): validate_display(body)


def test_v2_retains_day_only_collection_evidence_without_inventing_an_hour():
    body = deepcopy(publication())
    body.update(schema_version="2", price_levels=["wholesale", "supermarket", "retail_market"])
    del body["published_at"]
    body["missing"] = [row for row in body["missing"] if row["price_level"] != "market_average"]
    for row in body["records"]:
        row["collectedAt"] = "2025-01-05"
        del row["source"], row["unit"]
    for coverage in body["coverage"].values():
        coverage.update(total_records=24)
        del coverage["latest_collected_at"]
    assert validate_display(body)["records"][0]["collectedAt"] == "2025-01-05"
