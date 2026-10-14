"""Complete presentation stays separate from official observations and private lineage."""
from copy import deepcopy
import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import app
from app.services import market_display_service as M


def snapshot():
    return dict(schema_version="1", products=list(M.PRODUCTS), price_levels=list(M.PRICE_LEVELS),
                records=[dict(region=region, product=product, price_level=level, price=3,
                              observation_date="2025-01-03", collectedAt="2025-01-04T08:09:10+08:00",
                              change_percent=50, history=[dict(date="2025-01-01", price=2), dict(date="2025-01-03", price=3)])
                         for region in M.REGIONS for product in M.PRODUCTS for level in M.PRICE_LEVELS])


@pytest.fixture
def publication(tmp_path, monkeypatch):
    monkeypatch.setenv('AGRISCOPE_MARKET_POLICY', 'competition')
    path = tmp_path / "data/market/display.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps(snapshot(), ensure_ascii=False))
    (path.parent / "lineage.json").write_text('{"private":"do not expose"}')
    monkeypatch.setattr(M.C, "RUNTIME_DIR", tmp_path)
    M.reset_cache()
    yield TestClient(app), path
    M.reset_cache()


def test_complete_default_view_and_private_audit_never_sent(publication):
    client, path = publication
    before = path.read_bytes()
    response = client.get("/api/market/display")
    assert response.status_code == 200
    body = response.json()
    assert len(body["records"]) == 168
    assert body == snapshot()
    assert set(body) == {"schema_version", "products", "price_levels", "records"}
    assert all(set(row) == {"region", "product", "price_level", "price", "observation_date",
                            "collectedAt", "change_percent", "history"} for row in body["records"])
    assert "private" not in response.text and "source_id" not in response.text
    assert path.read_bytes() == before


@pytest.mark.parametrize("query,count", [({"region": "dandong"}, 24),
                                         ({"product": "甘蓝"}, 21),
                                         ({"price_level": "supermarket"}, 56),
                                         ({"region": "liaoning", "product": "土豆", "price_level": "wholesale"}, 1)])
def test_filters_are_exact_and_preserve_current_fields(publication, query, count):
    client, _ = publication
    response = client.get("/api/market/display", params=query)
    assert response.status_code == 200
    body = response.json()
    assert len(body["records"]) == count
    assert all(all(row[key] == value for key, value in query.items()) for row in body["records"])
    assert all(row["observation_date"] == "2025-01-03" and row["price"] == 3 for row in body["records"])


@pytest.mark.parametrize("query", [{"region": "../data"}, {"region": "beijing"},
                                   {"product": "土豆粉"}, {"price_level": "farm_gate"}])
def test_invalid_query_422_with_no_path_or_private_data(publication, query):
    client, _ = publication
    response = client.get("/api/market/display", params=query)
    assert response.status_code == 422 and response.json()["error_code"] == "BAD_REQUEST"
    assert response.json()["details"]["field"] == next(iter(query))
    assert "data/market" not in response.text


@pytest.mark.parametrize("defect", ["missing_combination", "duplicate_combination", "zero", "infinite",
                                     "boolean_price", "null", "future", "invalid_date", "false_change",
                                     "mixed_latest", "unsorted_history", "five_points", "bad_collected_time",
                                     "wrong_level", "wrong_members", "private_extra"])
def test_full_publication_validated_even_for_narrow_query(publication, defect):
    client, path = publication
    body = snapshot()
    row = body["records"][-1]  # Outside the requested Shenyang slice.
    if defect == "missing_combination":
        body["records"].pop()
    elif defect == "duplicate_combination":
        body["records"][-1] = deepcopy(body["records"][0])
    elif defect == "zero":
        row["price"] = 0
    elif defect == "infinite":
        row["price"] = float("inf")
    elif defect == "boolean_price":
        row["price"] = True
    elif defect == "null":
        row["collectedAt"] = None
    elif defect == "future":
        row["observation_date"] = "2099-01-01"
    elif defect == "invalid_date":
        row["observation_date"] = "2025-02-30"
    elif defect == "false_change":
        row["change_percent"] = 40
    elif defect == "mixed_latest":
        row["history"][-1]["price"] = 4
    elif defect == "unsorted_history":
        row["history"].reverse()
    elif defect == "five_points":
        row["history"] *= 3
    elif defect == "bad_collected_time":
        row["collectedAt"] = "2025-01-04T28:00:00+08:00"
    elif defect == "wrong_level":
        row["price_level"] = "farm_gate"
    elif defect == "wrong_members":
        body["products"][-1] = "土豆"
    elif defect == "private_extra":
        row["source_id"] = "private-source-metadata"
    path.write_text(json.dumps(body, ensure_ascii=False))
    response = client.get("/api/market/display", params={"region": "shenyang"})
    assert response.status_code == 503
    assert response.json()["error_code"] == "RESEARCH_UNAVAILABLE"
    assert "private" not in response.text and "display.json" not in response.text


def test_republication_refreshes_validated_cache_and_caller_cannot_mutate_it(publication):
    client, path = publication
    returned = M.display()
    returned["records"][0]["price"] = 999
    assert M.display()["records"][0]["price"] == 3
    body = snapshot()
    body["records"][0].update(price=4, change_percent=100, history=[dict(date="2025-01-01", price=2), dict(date="2025-01-03", price=4)])
    path.write_text(json.dumps(body, ensure_ascii=False))
    assert client.get("/api/market/display").json()["records"][0]["price"] == 4


@pytest.mark.parametrize("kind", ["absent", "invalid_json"])
def test_unreadable_publication_returns_consistent_503(publication, kind):
    client, path = publication
    if kind == "absent":
        path.unlink()
    else:
        path.write_text("not-json")
    assert client.get("/api/market/display").status_code == 503


def test_existing_observations_keeps_strict_unsupported_city_contract(publication):
    client, _ = publication
    body = client.get("/api/market/observations", params={"city": "dandong"}).json()
    assert body["available"] is False and body["series"] == []
    assert body["selectedCrop"] is None
