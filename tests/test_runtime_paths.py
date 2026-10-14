from pathlib import Path
import pytest
from agriscope_paths import paths
from agriscope_env import is_valid_root, load_env

def test_separate_worker_and_product_roots(monkeypatch, tmp_path):
    product, worker = tmp_path/'release', tmp_path/'worker'
    monkeypatch.setenv('AGRISCOPE_ROOT',str(product));monkeypatch.setenv('PROJECT_ROOT',str(worker));monkeypatch.delenv('AGRISCOPE_WORKER_ROOT',raising=False)
    layout=paths();assert layout.product==product and layout.worker==worker and layout.runtime==product/'runtime'
    assert not worker.exists() # resolving never writes

@pytest.mark.parametrize('scope',['same','nested','conflict'])
def test_reject_ambiguous_or_writable_product_state(monkeypatch,tmp_path,scope):
    monkeypatch.setenv('AGRISCOPE_ROOT',str(tmp_path/'release'));monkeypatch.delenv('AGRISCOPE_WORKER_ROOT',raising=False)
    monkeypatch.setenv('PROJECT_ROOT',str(tmp_path/('release/state' if scope=='nested' else 'release' if scope=='same' else 'worker')))
    if scope=='conflict':monkeypatch.setenv('AGRISCOPE_WORKER_ROOT',str(tmp_path/'other'))
    with pytest.raises(ValueError):paths()

def test_current_product_sentinels_and_independent_worker_env(tmp_path,monkeypatch):
    product=tmp_path/'release';worker=tmp_path/'worker'
    for relative in ['backend/app/main.py','pipelines/daily/run_daily.py','runtime/manifest.json']:
        p=product/relative;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('sentinel')
    assert is_valid_root(product) and not is_valid_root(worker)
    for key in ['AGRISCOPE_ROOT','PROJECT_ROOT','AGRISCOPE_WORKER_ROOT']:monkeypatch.delenv(key,raising=False)
    config=tmp_path/'runtime.env';config.write_text(f'AGRISCOPE_ROOT={product}\nPROJECT_ROOT={worker}\n')
    assert not load_env(config)['rejected'];assert paths().worker==worker
