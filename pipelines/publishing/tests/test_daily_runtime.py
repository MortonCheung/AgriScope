"""All publication writes are in pytest temporary directories; real frozen inputs are read only."""
import json
import shutil
from pathlib import Path
import pytest
from agriscope_daily_publication import EXTENDED_FILES, digest, resolve
from pipelines.publishing.publish_daily_runtime import publish, _business_hash
ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture
def package(tmp_path):
    worker = tmp_path / 'worker'
    runtime = tmp_path / 'runtime'
    daily = worker / 'data/processed/daily'
    extended = daily / 'final_input/extended_snapshot'
    for name in EXTENDED_FILES:
        target = extended / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / 'runtime/data/processed/daily/final_input/extended_snapshot' / name, target)
    (daily / 'snapshots').mkdir(parents=True)
    shutil.copyfile(ROOT / 'runtime/data/processed/daily/snapshots/latest.json', daily / 'snapshots/latest.json')
    (daily / 'monitor').mkdir()
    shutil.copyfile(ROOT / 'runtime/data/processed/daily/monitor/status.json', daily / 'monitor/status.json')
    reports = runtime / 'models/reports/final'
    reports.mkdir(parents=True)
    shutil.copyfile(ROOT / 'runtime/models/reports/final/FINAL_RUN_META.json', reports / 'FINAL_RUN_META.json')
    (runtime / 'research').mkdir()
    (runtime / 'research/original.json').write_bytes(b'research-sentinel')
    (runtime / 'models/frozen.pkl').write_bytes(b'model-sentinel')
    (runtime / 'manifest.json').write_text(json.dumps({'generated_at':'original-model-publication','assets':[{'status':'OK'}]}))
    return worker, runtime


def test_atomic_incremental_idempotent_publication_preserves_formal_assets(package):
    worker, runtime = package
    formal = {str(p.relative_to(runtime)):digest(p) for p in runtime.rglob('*') if p.is_file() and p.name != 'manifest.json'}
    old = json.loads((runtime / 'manifest.json').read_text())
    first = publish(worker, runtime, False)
    assert first['status'] == 'PUBLISHED'
    active = resolve(runtime)
    assert active['snapshot_hash'] == 'eecc08aad94152b0'
    assert active['latest_data_date'] == '2026-10-06'
    assert (active['directory'] / 'daily/latest.json').is_file()
    source=worker/'data/processed/daily/final_input/extended_snapshot/model_ready/shenyang_core/market_daily.parquet'
    assert source.stat().st_ino != (active['directory']/'extended_snapshot/model_ready/shenyang_core/market_daily.parquet').stat().st_ino
    assert json.loads((runtime / 'manifest.json').read_text())['assets'] == old['assets']
    assert json.loads((runtime / 'manifest.json').read_text())['generated_at'] == old['generated_at']
    assert publish(worker, runtime, False)['status'] == 'UNCHANGED'
    monitor = worker / 'data/processed/daily/monitor/status.json'
    obj = json.loads(monitor.read_text());obj['last_attempt_at'] = '2026-10-10 20:30:00';monitor.write_text(json.dumps(obj))
    second = publish(worker, runtime, False)
    assert second['copied_files'] == 1 and second['linked_files'] == len(active['files']) - 1
    assert active['directory'].exists() and resolve(runtime)['directory'] != active['directory']
    assert all(digest(runtime / p) == sha for p,sha in formal.items())
    assert not any('/raw/' in path or '/models/' in path or '/research/' in path for path in resolve(runtime)['files'])


@pytest.mark.parametrize('defect',['unit','wrong_city','future_date','failed','hash','fingerprint','regression'])
def test_invalid_publication_never_advances_pointer(package, defect):
    worker,runtime=package
    publish(worker,runtime,False)
    previous=(runtime/'manifest.json').read_bytes()
    latest=worker/'data/processed/daily/snapshots/latest.json'
    snap=json.loads(latest.read_text())
    if defect=='unit':snap['crops'][0]['unit']='元/吨'
    if defect=='wrong_city':snap['city']='朝阳'
    if defect=='future_date':snap['latest_data_date']='2099-01-01'
    if defect=='failed':snap['crawl_status']='FAILED'
    if defect=='regression':snap['latest_data_date']='2026-10-05'
    snap['snapshot_hash']=_business_hash(snap)
    if defect=='hash':snap['snapshot_hash']='bad'
    if defect=='fingerprint':
        f=worker/'data/processed/daily/final_input/extended_snapshot/.source_fingerprint.json'
        obj=json.loads(f.read_text());obj['code_fingerprint']='old';f.write_text(json.dumps(obj))
    latest.write_text(json.dumps(snap,ensure_ascii=False))
    with pytest.raises(ValueError):publish(worker,runtime,False)
    assert (runtime/'manifest.json').read_bytes()==previous
    assert resolve(runtime)['latest_data_date']=='2026-10-06'


def test_mid_copy_failure_leaves_previous_valid_generation(package,monkeypatch):
    worker,runtime=package
    publish(worker,runtime,False)
    previous=(runtime/'manifest.json').read_bytes()
    monitor=worker/'data/processed/daily/monitor/status.json';monitor.write_text('{"changed":true}')
    monkeypatch.setattr(shutil,'copyfile',lambda *_:(_ for _ in ()).throw(OSError('simulated disk failure')))
    with pytest.raises(OSError):publish(worker,runtime,False)
    assert (runtime/'manifest.json').read_bytes()==previous
    assert resolve(runtime)['directory'].exists()
    assert not list((runtime/'data/processed/daily/publications').glob('.stage-*'))


def test_request_pins_whole_generation_and_rejects_bad_pointer(package,monkeypatch):
    from backend.app import publication, config as C
    from backend.app.errors import ApiError
    worker,runtime=package;publish(worker,runtime,False)
    monkeypatch.setattr(C,'RUNTIME_DIR',runtime)
    with publication.pin():
        original=publication.path('daily')
        monitor=worker/'data/processed/daily/monitor/status.json';monitor.write_text('{"new":true}')
        publish(worker,runtime,False)
        assert publication.path('daily')==original
        assert publication.path('extended').parent==original.parent.parent
    assert publication.path('daily')!=original
    manifest=runtime/'manifest.json';obj=json.loads(manifest.read_text());obj['daily_publication']['generation']='../escape';manifest.write_text(json.dumps(obj))
    with pytest.raises(ApiError):publication.current()
