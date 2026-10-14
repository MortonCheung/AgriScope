"""Offline deployment integration: all mutable evidence is confined to pytest workers."""
import hashlib
import json
import os
from pathlib import Path
import ssl
import subprocess
import sys
from datetime import datetime
from zoneinfo import ZoneInfo
import pandas as pd
import pytest
from daily import config as C, final_adapter as FA, normalize as NZ, source_shenyang as SRC

PRODUCT = Path(__file__).resolve().parents[3]
DAY = '2026-10-13'
EPOCH = int(datetime(2026, 10, 13, tzinfo=ZoneInfo('Asia/Shanghai')).timestamp() * 1000)

@pytest.fixture
def worker(tmp_path, monkeypatch):
    monkeypatch.setattr(C, 'ROOT', tmp_path)
    monkeypatch.setattr(C, 'RAW_DAILY_DIR', tmp_path / 'data/raw/daily')
    return tmp_path

def payload(price='2.0'):
    return {'code': 0, 'count': 10, 'source_extra': 'preserve exact bytes', 'data': [
        {'productName': str(n), 'price': price, 'unit': '元/500g', 'dates': EPOCH, 'marketType': 1} for n in range(10)]}

def fetched(monkeypatch, body, date=DAY):
    class Response:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def read(self): return body
    monkeypatch.setattr(SRC.urllib.request, 'urlopen', lambda *args, **kwargs: Response())
    return SRC.fetch(date, '1')

def saved_wholesale_response():
    source = PRODUCT.parent / 'data/raw/prices/shenyang_clz/2026-09-14_mt1.json'
    if not source.is_file():
        pytest.skip('Research raw evidence is intentionally absent from independent product packages')
    return source.read_bytes()

def test_saved_real_wholesale_response_has_verified_market_type(monkeypatch):
    """Read existing source evidence only; do not archive or publish it as a new crawl."""
    body = saved_wholesale_response()
    result = fetched(monkeypatch, body, '2026-09-14')
    assert result.status == SRC.ST_OK and result.schema_ok
    assert result.count == 10 and result.raw_bytes == body
    assert all(str(row['marketType']) == '1' for row in result.records)

def test_repeated_real_response_preserves_success_and_records_new_attempt(worker, monkeypatch):
    body = saved_wholesale_response()
    times = iter(['2026-09-14T20:30:00', '2026-09-14T23:30:00'])
    monkeypatch.setattr(SRC.IO, 'now_str', lambda: next(times))
    monkeypatch.setenv('AGRISCOPE_CHAIN_RUN_ID', 'first-request')
    first = SRC._archive(fetched(monkeypatch, body, '2026-09-14'))
    raw_file = worker / first.raw_path
    metadata_file = raw_file.parent / 'metadata.json'
    successful = json.loads(metadata_file.read_text())['mt1']
    normalized = NZ.load_raw_records()
    monkeypatch.setenv('AGRISCOPE_CHAIN_RUN_ID', 'second-request')
    repeated = SRC._archive(fetched(monkeypatch, body, '2026-09-14'))
    metadata = json.loads(metadata_file.read_text())
    assert metadata['mt1'] == successful
    assert repeated.raw_path == first.raw_path and repeated.crawl_time == first.crawl_time
    assert raw_file.read_bytes() == body and not (raw_file.parent / 'attempts').exists()
    assert metadata['latest_attempts']['mt1']['crawl_time'] == '2026-09-14T23:30:00'
    assert metadata['latest_attempts']['mt1']['chain_run_id'] == 'second-request'
    assert metadata['latest_attempts']['mt1']['raw_path'] == first.raw_path
    pd.testing.assert_frame_equal(NZ.load_raw_records(), normalized)

@pytest.mark.parametrize('defect', ['changed_bytes', 'outside_day'])
def test_same_response_cannot_reuse_unverified_success_path(worker, monkeypatch, defect):
    body = json.dumps(payload()).encode()
    first = SRC._archive(fetched(monkeypatch, body))
    raw_file = worker / first.raw_path
    metadata_file = raw_file.parent / 'metadata.json'
    metadata = json.loads(metadata_file.read_text())
    if defect == 'changed_bytes':
        raw_file.write_bytes(b'changed outside the immutable storage contract')
    else:
        outside = worker / 'outside-day.json'
        outside.write_bytes(body)
        metadata['mt1']['active_raw_path'] = str(outside.relative_to(worker))
        metadata_file.write_text(json.dumps(metadata))
    fresh = SRC._archive(fetched(monkeypatch, body))
    assert '/attempts/' in fresh.raw_path and fresh.raw_path != first.raw_path
    assert (worker / fresh.raw_path).read_bytes() == body
    assert json.loads(metadata_file.read_text())['mt1']['active_raw_path'] == fresh.raw_path

def test_exact_bytes_revision_pointer_and_failure_preserve_success(worker, monkeypatch):
    first = json.dumps(payload(), ensure_ascii=False, indent=2).encode()
    SRC._archive(fetched(monkeypatch, first))
    original = worker / f'data/raw/daily/shenyang_clz/{DAY}/mt1.json'
    assert original.read_bytes() == first
    second = json.dumps(payload('3.0'), ensure_ascii=False, separators=(',', ':')).encode()
    SRC._archive(fetched(monkeypatch, second))
    assert original.read_bytes() == first
    metadata_file = original.parent / 'metadata.json'
    successful = json.loads(metadata_file.read_text())['mt1']
    assert '/attempts/' in successful['active_raw_path']
    assert (worker / successful['active_raw_path']).read_bytes() == second
    assert successful['raw_sha256'] == hashlib.sha256(second).hexdigest()
    assert set(NZ.load_raw_records()['price_per_kg']) == {6.0}
    SRC._archive(SRC.RawResult(DAY, '1', 'actual-url', SRC.ST_FAIL, error='offline', schema_ok=False))
    metadata = json.loads(metadata_file.read_text())
    assert metadata['mt1'] == successful
    assert metadata['latest_attempts']['mt1']['status'] == SRC.ST_FAIL
    assert set(NZ.load_raw_records()['price_per_kg']) == {6.0}

def test_empty_then_complete_same_day_adopts_valid_response(worker, monkeypatch):
    SRC._archive(fetched(monkeypatch, b'{"code":0,"count":0,"data":[]}'))
    assert NZ.load_raw_records().empty
    SRC._archive(fetched(monkeypatch, json.dumps(payload()).encode()))
    assert len(NZ.load_raw_records()) == 10

@pytest.mark.parametrize('defect', ['missing_date', 'wrong_date', 'nonfinite', 'unit', 'field_on_one_row', 'missing_market_type', 'wrong_market_type'])
def test_source_schema_rejects_unverified_freshness_and_price(worker, monkeypatch, defect):
    raw = payload()
    if defect == 'missing_date': del raw['data'][0]['dates']
    if defect == 'wrong_date': raw['data'][0]['dates'] = EPOCH - 86400000
    if defect == 'nonfinite': raw['data'][0]['price'] = 'Infinity'
    if defect == 'unit': raw['data'][0]['unit'] = '元/盒'
    if defect == 'field_on_one_row': del raw['data'][0]['productName']
    if defect == 'missing_market_type': del raw['data'][0]['marketType']
    if defect == 'wrong_market_type': raw['data'][0]['marketType'] = 2
    result = fetched(monkeypatch, json.dumps(raw).encode())
    assert result.schema_ok is False
    SRC._archive(result)
    assert NZ.load_raw_records().empty

def test_pointer_cannot_escape_day_or_use_changed_bytes(worker, monkeypatch):
    SRC._archive(fetched(monkeypatch, json.dumps(payload()).encode()))
    path = worker / f'data/raw/daily/shenyang_clz/{DAY}/metadata.json'
    original = path.read_bytes()
    meta = json.loads(original); meta['mt1']['raw_sha256'] = '0' * 64
    path.write_text(json.dumps(meta)); assert NZ.load_raw_records().empty
    meta = json.loads(original); meta['mt1']['active_raw_path'] = str(PRODUCT / 'runtime/manifest.json')
    path.write_text(json.dumps(meta)); assert NZ.load_raw_records().empty

def test_tls_verifies_hostname_and_certificate_and_explicit_ca_is_not_bypassed(monkeypatch, tmp_path):
    monkeypatch.setattr(C, 'SOURCE_CA_FILE', None)
    context = SRC._ctx()
    assert context.check_hostname and context.verify_mode == ssl.CERT_REQUIRED
    monkeypatch.setattr(C, 'SOURCE_CA_FILE', str(tmp_path / 'not-installed-ca.pem'))
    with pytest.raises(OSError): SRC._ctx()

def test_independent_worker_reads_runtime_resources_and_rejects_other_city_before_collection(tmp_path):
    worker = tmp_path / 'worker'
    env = dict(os.environ, PROJECT_ROOT=str(worker), AGRISCOPE_WORKER_ROOT=str(worker), AGRISCOPE_ROOT=str(PRODUCT), PYTHONPATH=str(PRODUCT / 'pipelines'))
    probe = "from daily import config as c; assert c.ROOT.name=='worker'; assert c.FINAL_RUN_META.is_file(); assert c.FINAL_SNAPSHOT_DIR.is_dir(); assert c.MODEL_SRC.is_dir(); assert c.FINAL_MODELS_DIR.is_dir(); print('READY')"
    response = subprocess.run([sys.executable, '-c', probe], env=env, capture_output=True, text=True, timeout=30)
    assert response.returncode == 0, response.stderr
    assert not worker.exists()
    result = subprocess.run([sys.executable, str(PRODUCT / 'pipelines/daily/run_daily.py'), '--city', '朝阳', '--dry-run'], env=env, capture_output=True, text=True, timeout=30)
    assert result.returncode == 2 and not worker.exists()

def test_extended_input_labels_normalized_kg_without_changing_price(monkeypatch, tmp_path):
    frozen_path = tmp_path / 'frozen/model_ready/shenyang_core/market_daily.parquet'
    frozen_path.parent.mkdir(parents=True)
    frozen = pd.DataFrame([{'city': '沈阳', 'crop_standard': '黄瓜', 'observation_date': '2026-10-10', 'price_per_kg': 4.0, 'unit_original': '元/斤', 'price_level': 'wholesale'}])
    frozen.to_parquet(frozen_path)
    daily_dir = tmp_path / 'daily'; daily_dir.mkdir()
    pd.DataFrame([{'date': '2026-10-11', 'crop_standard': '黄瓜', 'price_per_kg': 6.0, 'unit_raw': '元/500g', 'price_level': 'wholesale', 'quality_status': 'OK', 'source_name': 'verified-source'}]).to_parquet(daily_dir / 'daily_market_price.parquet')
    before = frozen_path.read_bytes()
    monkeypatch.setattr(C, 'FINAL_SNAPSHOT_DIR', tmp_path / 'frozen')
    monkeypatch.setattr(C, 'PROCESSED_DAILY_DIR', daily_dir)
    adapter = FA.FinalModelAdapter.__new__(FA.FinalModelAdapter); adapter.city = '沈阳'
    extended = adapter._build_extended_market_daily()
    assert float(extended.iloc[-1]['price_per_kg']) == 6.0
    assert extended.iloc[-1]['unit_original'] == '元/kg'
    assert frozen_path.read_bytes() == before
