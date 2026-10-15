"""Real provenance and strict same-market history; all mutations use temp files."""
import hashlib
import shutil
import sys
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import app
from app import config as C
from app.services import market_service as M


@pytest.fixture
def client(tmp_path, monkeypatch):
    # Fixed real-data replay through 2026-10-06, separate from live worker
    # generations. Copy only the three market tables this contract consumes;
    # all test mutation/cache checks remain inside the temporary snapshot.
    replay = tmp_path / 'historical-replay'
    for bucket, _level, _markets in M.MARKETS.values():
        relative = Path('model_ready') / bucket / 'market_daily.parquet'
        target = replay / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(C.EXTENDED_SNAPSHOT_DIR / relative, target)
    monkeypatch.setattr(M.RS, 'state', lambda: {'snapshot_dir': str(replay)})
    M.reset_cache()
    yield TestClient(app)
    M.reset_cache()


@pytest.mark.parametrize("city,market,level,last", [
    ("shenyang", "沈阳菜篮子信息发布平台（批发口径）", "wholesale", "2026-10-06"),
    ("chaoyang", "朝阳市监测点平均", "market_average", "2026-09-21"),
    ("jinzhou", "全市均价", "market_average", "2025-07-14"),
])
def test_real_city_history_matches_published_rows(client, city, market, level, last):
    response = client.get("/api/market/observations", params={"city": city, "crop": "土豆"})
    assert response.status_code == 200
    body = response.json()
    assert body["cityId"] == city and body["unit"] == "元/kg" and body["available"]
    assert body["selectedCrop"] == "土豆" and "土豆" in body["crops"]
    assert body["series"] and all(s["priceLevel"] == level for s in body["series"])
    series = next(s for s in body["series"] if s["marketName"] == market)
    assert series["observations"][-1]["date"] == last
    assert series["source"]["url"].startswith("https://")
    path = Path(M.RS.state()["snapshot_dir"]) / "model_ready" / M.MARKETS[city][0] / "market_daily.parquet"
    before = hashlib.sha256(path.read_bytes()).hexdigest()
    assert body["snapshotVersion"] == before[:16]
    raw = pd.read_parquet(path)
    raw = raw[(raw.crop_standard == "土豆") & (raw.market_name == market) & (raw.price_level_canonical == level)]
    raw["day"] = pd.to_datetime(raw.observation_date).dt.strftime("%Y-%m-%d")
    expected = float(raw.loc[raw.day == last, "price_per_kg"].iloc[0])
    assert series["observations"][-1]["pricePerKg"] == expected
    assert hashlib.sha256(path.read_bytes()).hexdigest() == before


@pytest.mark.parametrize("city", ["tieling", "dandong", "dalian"])
def test_no_other_city_or_filler_for_missing_market(client, city):
    data = client.get("/api/market/observations", params={"city": city}).json()
    assert data["cityId"] == city and data["available"] is False
    assert data["selectedCrop"] is None and data["series"] == [] and data["crops"] == []


def test_whitelist_crop_and_city(client):
    assert client.get("/api/market/observations", params={"city": "../shenyang"}).status_code == 422
    assert client.get("/api/market/observations", params={"city": "shenyang", "crop": "fake"}).status_code == 422


def test_gaps_conflicts_units_and_product_identity_are_not_averaged(client, tmp_path, monkeypatch):
    base = {key: None for key in M.COLUMNS}
    base.update(city="朝阳", market_name="朝阳市监测点平均", crop_standard="土豆", crop_raw="土豆",
                price_per_kg="2", unit_original="元/500克", price_level_canonical="market_average",
                source_name=next(name for name in M.SOURCE_NAMES["chaoyang"] if name.startswith("朝阳市")),
                source_url="https://fgw.chaoyang.gov.cn/example", observation_date="2026-01-01")
    rows = [base, dict(base, observation_date="2026-01-03", price_per_kg="4"),
            dict(base, observation_date="2026-01-03", price_per_kg="6"),
            dict(base, observation_date="2026-01-06", price_per_kg="5"),
            dict(base, observation_date="2026-01-07", price_level_canonical="farm_gate"),
            dict(base, observation_date="2026-01-08", unit_original="元/500ml"),
            dict(base, observation_date="2026-01-09", price_per_kg="nan"),
            dict(base, observation_date="bad"), dict(base, city="沈阳"),
            dict(base, crop_raw="土豆粉", processing_state="processed"),
            dict(base, is_proxy=True), dict(base, source_name="商户供货"),
            dict(base, crop_standard="生猪", crop_raw="仔猪", price_per_kg="20"),
            dict(base, crop_standard="生猪", crop_raw="生猪", price_per_kg="8")]
    path = tmp_path / "model_ready/chaoyang_extended/market_daily.parquet"
    path.parent.mkdir(parents=True)
    pd.DataFrame(rows).to_parquet(path)
    monkeypatch.setattr(M.RS, "state", lambda: {"snapshot_dir": str(tmp_path)})
    body = client.get("/api/market/observations", params={"city": "chaoyang"}).json()
    assert body["series"][0]["observations"] == [
        {"date": "2026-01-01", "pricePerKg": 2}, {"date": "2026-01-06", "pricePerKg": 5}]
    assert body["series"][0]["notes"] == ["1 个同日冲突观测已省略。"]
    pigs = client.get("/api/market/observations", params={"city": "chaoyang", "crop": "生猪"}).json()
    assert {s["productName"] for s in pigs["series"]} == {"仔猪", "生猪"}
    assert {s["observations"][0]["pricePerKg"] for s in pigs["series"]} == {20, 8}
