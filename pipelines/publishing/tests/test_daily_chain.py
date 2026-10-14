import json
from types import SimpleNamespace
import hashlib
import os
from datetime import datetime
from zoneinfo import ZoneInfo
import pytest
from scripts import run_daily_chain as chain
from pipelines.publishing import publish_daily_runtime
from pipelines.long_horizon import run_long_horizon_job


@pytest.fixture(autouse=True)
def isolated_presentation_stage(monkeypatch):
    # Existing chain tests must not load real frozen artifacts or write Runtime.
    monkeypatch.setattr(chain, '_presentation', lambda _env, _timeout: {'exit_code': 0, 'stdout': ''})


def test_failed_daily_cannot_publish_or_trigger_long_job(tmp_path,monkeypatch):
    calls=[];writes=[]
    monkeypatch.setattr(chain,'PROJECT',tmp_path)
    monkeypatch.setattr(chain,'_run_process',lambda command,*args,**kwargs:(calls.append(command) or SimpleNamespace(returncode=2,stdout='SUMMARY {"crawl_status":"FAILED"}\n')))
    publish=lambda *_args,**_kw:(_ for _ in ()).throw(AssertionError('must not publish'))
    monkeypatch.setattr(publish_daily_runtime,'publish',publish)
    monkeypatch.setattr(chain,'atomic_json',lambda path,value:writes.append((path,value)))
    assert chain.main([])==2
    assert len(calls)==1 and writes[-1][1]['long_horizon_exit'] is None


def test_failed_long_job_can_publish_daily_without_advancing_long(tmp_path,monkeypatch):
    calls=[];publications=[];writes=[]
    monkeypatch.setattr(chain,'PROJECT',tmp_path)
    summary={'snapshot_status':'partial','crawl_status':'SKIPPED','snapshot_hash':'actual-valid'}
    def run(command,*args,**kwargs):
        calls.append(command)
        return SimpleNamespace(returncode=0,stdout='SUMMARY '+json.dumps(summary)+'\n') if len(calls)==1 else SimpleNamespace(returncode=2)
    monkeypatch.setattr(chain,'_run_process',run)
    monkeypatch.setattr(publish_daily_runtime,'publish',lambda project,runtime,include_long_horizon:(publications.append(include_long_horizon) or {'status':'PUBLISHED'}))
    monkeypatch.setattr(chain,'atomic_json',lambda path,value:writes.append(value.copy()))
    assert chain.main([])==5
    assert publications==[False] and writes[-1]['status']=='DAILY_SUCCESS_LONG_HORIZON_FAILED'
    assert calls[0][-1].endswith('run_daily.py') and calls[1][-1].endswith('run_long_horizon_job.py')


def test_publisher_failure_returns_distinct_failure_without_false_success(tmp_path,monkeypatch):
    count=[];writes=[]
    monkeypatch.setattr(chain,'PROJECT',tmp_path)
    summary={'snapshot_status':'complete','crawl_status':'OK','snapshot_hash':'actual-valid'}
    monkeypatch.setattr(chain,'_run_process',lambda *args,**kwargs:(count.append(args) or SimpleNamespace(returncode=0,stdout='SUMMARY '+json.dumps(summary)+'\n')))
    monkeypatch.setattr(publish_daily_runtime,'publish',lambda *_args,**_kw:(_ for _ in ()).throw(ValueError('incompatible')))
    monkeypatch.setattr(chain,'atomic_json',lambda path,value:writes.append(value.copy()))
    assert chain.main([])==6 and writes[-1]['status']=='RUNTIME_PUBLICATION_FAILED'


def test_skipped_empty_failed_and_dry_collection_never_get_success_timestamp(monkeypatch):
    from pipelines.daily import run_daily as daily
    monkeypatch.setattr(daily.IO,'now_str',lambda:'actual-completion-time')
    def row(status,count=1,schema_ok=True):return SimpleNamespace(status=status,count=count,schema_ok=schema_ok)
    assert daily.collection_completed_at([row('SKIPPED')]) is None
    assert daily.collection_completed_at([row('FAILED')]) is None
    assert daily.collection_completed_at([row('OK',0)]) is None
    assert daily.collection_completed_at([row('OK',schema_ok=False)]) is None
    assert daily.collection_completed_at([row('OK')],True) is None
    assert daily.collection_completed_at([row('OK')])=='actual-completion-time'


def final_state(worker):
    return json.loads((worker / 'data/processed/long_horizon/chain_status.json').read_text())


@pytest.mark.parametrize('stdout', ['', 'SUMMARY {broken}\n', 'SUMMARY []\n'])
def test_invalid_summary_is_a_recorded_failure_and_never_publishes(tmp_path, monkeypatch, stdout):
    monkeypatch.setattr(chain, 'PROJECT', tmp_path)
    monkeypatch.setattr(chain, '_run_process', lambda *args: SimpleNamespace(returncode=0, stdout=stdout))
    monkeypatch.setattr(publish_daily_runtime, 'publish', lambda *a, **k: pytest.fail('must not publish'))
    assert chain.main([]) == 8
    state = final_state(tmp_path)
    assert state['daily_summary_error'].startswith('SUMMARY_')
    assert state['stages']['daily']['status'] == 'FAILED'
    assert state['stages']['market_publication']['status'] == 'SKIPPED'


def test_timeout_records_state_and_process_group_is_terminated(tmp_path, monkeypatch):
    monkeypatch.setattr(chain, 'PROJECT', tmp_path)
    def timeout(*args): raise chain.subprocess.TimeoutExpired('daily', 2)
    monkeypatch.setattr(chain, '_run_process', timeout)
    assert chain.main([]) == 124
    assert final_state(tmp_path)['stages']['daily']['status'] == 'TIMED_OUT'
    monkeypatch.undo()
    with pytest.raises(chain.subprocess.TimeoutExpired):
        chain._run_process([chain.sys.executable, '-c', 'import time; time.sleep(5)'], dict(os.environ), .05)


def test_whole_chain_lock_preserves_active_status(tmp_path, monkeypatch):
    monkeypatch.setattr(chain, 'PROJECT', tmp_path)
    monkeypatch.setattr(chain, '_run_process', lambda *args: pytest.fail('locked task cannot launch'))
    active = tmp_path / 'data/processed/long_horizon/chain_status.json'
    chain.atomic_json(active, {'status': 'RUNNING', 'run_id': 'owner'})
    with chain.chain_lock():
        assert chain.main([]) == 4
    assert json.loads(active.read_text())['run_id'] == 'owner'
    attempts = list((tmp_path / 'data/processed/daily/chain_attempts').glob('*.json'))
    assert len(attempts) == 1 and json.loads(attempts[0].read_text())['status'] == 'LOCKED'


def test_wrong_city_rejected_before_any_subprocess(tmp_path, monkeypatch):
    monkeypatch.setattr(chain, 'PROJECT', tmp_path)
    monkeypatch.setattr(chain, '_run_process', lambda *args: pytest.fail('other-city collector not registered'))
    assert chain.main(['--city', 'chaoyang']) == 2
    assert final_state(tmp_path)['status'] == 'CHAIN_FAILED'


def test_dry_run_cannot_publish_even_if_child_summary_claims_valid_snapshot(tmp_path, monkeypatch):
    monkeypatch.setattr(chain, 'PROJECT', tmp_path)
    summary = {'snapshot_status': 'complete', 'crawl_status': 'OK', 'snapshot_hash': 'valid', 'collection_completed_at': 'actual', 'records_fetched': 10}
    monkeypatch.setattr(chain, '_run_process', lambda *args: SimpleNamespace(returncode=0, stdout='SUMMARY ' + json.dumps(summary)))
    monkeypatch.setattr(publish_daily_runtime, 'publish', lambda *a, **k: pytest.fail('dry publication'))
    monkeypatch.setattr(chain, '_presentation', lambda *a: pytest.fail('dry presentation publication'))
    assert chain.main(['--dry-run']) == 0
    assert final_state(tmp_path)['status'] == 'DRY_RUN'


def test_same_run_successful_prices_publish_market_despite_inference_failure(tmp_path, monkeypatch):
    from pipelines.publishing import publish_market_display as market
    monkeypatch.setattr(chain, 'PROJECT', tmp_path)
    calls = []
    def failed_daily(command, env, timeout):
        day = tmp_path / 'data/raw/daily/shenyang_clz/2026-10-13'
        day.mkdir(parents=True)
        body = json.dumps({'code': 0, 'count': 10, 'data': [{'productName': str(n), 'price': '2.0', 'unit': '元/斤', 'dates': 1791820800000, 'marketType': 1} for n in range(10)]}).encode()
        (day / 'mt1.json').write_bytes(body)
        attempt = {'status': 'OK', 'schema_ok': True, 'count': 10, 'crawl_time': datetime.now(ZoneInfo('Asia/Shanghai')).strftime('%Y-%m-%d %H:%M:%S'), 'raw_path': 'data/raw/daily/shenyang_clz/2026-10-13/mt1.json', 'raw_sha256': hashlib.sha256(body).hexdigest(), 'chain_run_id': env['AGRISCOPE_CHAIN_RUN_ID']}
        (day / 'metadata.json').write_text(json.dumps({'latest_attempts': {'mt1': attempt}}))
        return SimpleNamespace(returncode=1, stdout='inference failed before summary\n')
    monkeypatch.setattr(chain, '_run_process', failed_daily)
    monkeypatch.setattr(market, 'publish', lambda *a, **k: calls.append(k) or {'status': 'PUBLISHED'})
    assert chain.main([]) == 1
    state = final_state(tmp_path)
    assert calls == [{'runtime_root': chain.RUNTIME, 'strict': True, 'write_frontend': False}]
    assert state['status'] == 'MARKET_SUCCESS_DAILY_FAILED'
    assert state['stages']['market_publication']['status'] == 'SUCCESS'
    assert state['stages']['runtime_publication']['status'] == 'SKIPPED'


def test_failed_collection_still_attempts_presentation_without_false_collection_success(tmp_path, monkeypatch):
    monkeypatch.setattr(chain, 'PROJECT', tmp_path)
    monkeypatch.setattr(chain, '_run_process', lambda *a: SimpleNamespace(returncode=2, stdout='SUMMARY {"crawl_status":"FAILED"}\n'))
    calls = []
    monkeypatch.setattr(chain, '_presentation', lambda env, timeout: calls.append((env, timeout)) or {'exit_code': 0})
    assert chain.main([]) == 2
    state = final_state(tmp_path)
    assert state['collection_status'] == 'NO_NEW_VALID_OBSERVATIONS'
    assert state['stages']['daily']['status'] == 'FAILED'
    assert state['stages']['presentation_publication']['status'] == 'SUCCESS'
    assert state['status'] == 'LONG_HORIZON_SKIPPED_DAILY_NOT_SUCCESSFUL'
    assert calls[0][0]['PROJECT_ROOT'] == str(tmp_path) and calls[0][1] == 300


@pytest.mark.parametrize('failure', ['process', 'timeout'])
def test_presentation_failure_is_monitorable_and_preserves_original_daily_exit(tmp_path, monkeypatch, failure):
    monkeypatch.setattr(chain, 'PROJECT', tmp_path)
    monkeypatch.setattr(chain, '_run_process', lambda *a: SimpleNamespace(returncode=2, stdout='SUMMARY {"crawl_status":"FAILED"}\n'))
    def run(*a):
        if failure == 'timeout': raise chain.subprocess.TimeoutExpired('presentation', 1)
        return {'exit_code': 3}
    monkeypatch.setattr(chain, '_presentation', run)
    assert chain.main([]) == 2
    state = final_state(tmp_path)
    assert state['presentation_publication_exit'] == 9
    assert state['stages']['presentation_publication']['status'] == ('TIMED_OUT' if failure == 'timeout' else 'FAILED')


def test_only_presentation_failure_returns_its_own_code(tmp_path, monkeypatch):
    monkeypatch.setattr(chain, 'PROJECT', tmp_path)
    summary = {'snapshot_status': 'complete', 'crawl_status': 'SKIPPED', 'snapshot_hash': 'real-existing'}
    monkeypatch.setattr(chain, '_run_process', lambda *a: SimpleNamespace(returncode=0, stdout='SUMMARY ' + json.dumps(summary)))
    monkeypatch.setattr(publish_daily_runtime, 'publish', lambda *a, **k: {'status': 'UNCHANGED'})
    monkeypatch.setattr(chain, '_presentation', lambda *a: {'exit_code': 1})
    assert chain.main(['--no-collect']) == 9
    state = final_state(tmp_path)
    assert state['status'] == 'PRESENTATION_PUBLICATION_FAILED' and state['daily_exit'] == 0


def test_presentation_command_only_writes_runtime_and_reuses_process_runner(monkeypatch):
    calls = []
    monkeypatch.setattr(chain, '_process_result', lambda command, env, timeout: calls.append((command, env, timeout)) or {'exit_code': 0})
    # Retrieve the real function; the fixture overrides only the module attribute.
    import importlib.util
    spec = importlib.util.spec_from_file_location('isolated_presentation_command', chain.__file__)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    monkeypatch.setattr(module, '_process_result', lambda command, env, timeout: calls.append((command, env, timeout)) or {'exit_code': 0})
    assert module._presentation({'fixture': 'env'}, 12)['exit_code'] == 0
    command, env, timeout = calls[0]
    assert command[1].endswith('publish_market_presentation.py')
    assert '--runtime-root' in command and '--project-root' in command and '--frontend-bootstrap' not in command
    assert env == {'fixture': 'env'} and timeout == 12
