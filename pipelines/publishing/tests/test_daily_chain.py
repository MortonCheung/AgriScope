import json
from types import SimpleNamespace
import os
import pytest
from scripts import run_daily_chain as chain
from pipelines.publishing import publish_daily_runtime
from pipelines.daily.market_feed import product_bridge


FEED = 'pipelines.daily.market_feed'


def runner(calls, *, feed=(0, ''), daily=(0, ''), long=(0, '')):
    """Dispatch the mocked subprocess by which stage launched it."""
    def run(command, env, timeout):
        calls.append(command)
        if '-m' in command and FEED in command:
            return SimpleNamespace(returncode=feed[0], stdout=feed[1])
        if command[-1].endswith('run_daily.py'):
            return SimpleNamespace(returncode=daily[0], stdout=daily[1])
        if command[-1].endswith('run_long_horizon_job.py'):
            return SimpleNamespace(returncode=long[0], stdout=long[1])
        raise AssertionError(command)
    return run


def stub_market(monkeypatch, calls=None):
    def publish(strict=True):
        if calls is not None:
            calls.append({'strict': strict})
        return {'status': 'PUBLISHED', 'publication': {'status': 'PUBLISHED'}}
    monkeypatch.setattr(product_bridge, 'publish_product', publish)


def test_failed_daily_cannot_publish_runtime_or_trigger_long_job(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(chain, 'PROJECT', tmp_path)
    monkeypatch.setattr(chain, '_run_process', runner(calls, daily=(2, 'SUMMARY {"crawl_status":"FAILED"}\n')))
    monkeypatch.setattr(publish_daily_runtime, 'publish', lambda *_a, **_k: pytest.fail('must not publish'))
    stub_market(monkeypatch)
    monkeypatch.setattr(chain, 'atomic_json', lambda path, value: None)
    assert chain.main([]) == 2
    stages = [c for c in calls if c[-1].endswith(('run_daily.py', 'run_long_horizon_job.py'))]
    assert len(stages) == 1 and stages[0][-1].endswith('run_daily.py')


def test_failed_long_job_can_publish_daily_without_advancing_long(tmp_path, monkeypatch):
    calls = []; publications = []
    monkeypatch.setattr(chain, 'PROJECT', tmp_path)
    summary = {'snapshot_status': 'partial', 'crawl_status': 'SKIPPED', 'snapshot_hash': 'actual-valid'}
    monkeypatch.setattr(chain, '_run_process', runner(calls, daily=(0, 'SUMMARY ' + json.dumps(summary) + '\n'), long=(2, '')))
    monkeypatch.setattr(publish_daily_runtime, 'publish', lambda project, runtime, include_long_horizon: (publications.append(include_long_horizon) or {'status': 'PUBLISHED'}))
    stub_market(monkeypatch)
    monkeypatch.setattr(chain, 'atomic_json', lambda path, value: None)
    assert chain.main([]) == 5
    assert publications == [False]
    assert calls[-2][-1].endswith('run_daily.py') and calls[-1][-1].endswith('run_long_horizon_job.py')


def test_publisher_failure_returns_distinct_failure_without_false_success(tmp_path, monkeypatch):
    monkeypatch.setattr(chain, 'PROJECT', tmp_path)
    summary = {'snapshot_status': 'complete', 'crawl_status': 'OK', 'snapshot_hash': 'actual-valid'}
    monkeypatch.setattr(chain, '_run_process', runner([], daily=(0, 'SUMMARY ' + json.dumps(summary) + '\n')))
    monkeypatch.setattr(publish_daily_runtime, 'publish', lambda *_a, **_k: (_ for _ in ()).throw(ValueError('incompatible')))
    stub_market(monkeypatch)
    writes = []
    monkeypatch.setattr(chain, 'atomic_json', lambda path, value: writes.append(value.copy()))
    assert chain.main([]) == 6 and writes[-1]['status'] == 'RUNTIME_PUBLICATION_FAILED'


def final_state(worker):
    return json.loads((worker / 'data/processed/long_horizon/chain_status.json').read_text())


@pytest.mark.parametrize('stdout', ['', 'SUMMARY {broken}\n', 'SUMMARY []\n'])
def test_invalid_summary_is_a_recorded_failure_and_never_publishes(tmp_path, monkeypatch, stdout):
    monkeypatch.setattr(chain, 'PROJECT', tmp_path)
    monkeypatch.setattr(chain, '_run_process', runner([], daily=(0, stdout)))
    monkeypatch.setattr(publish_daily_runtime, 'publish', lambda *a, **k: pytest.fail('must not publish'))
    stub_market(monkeypatch)
    assert chain.main([]) == 8
    state = final_state(tmp_path)
    assert state['daily_summary_error'].startswith('SUMMARY_')
    assert state['stages']['daily']['status'] == 'FAILED'
    # The market feed is decoupled, so its publication still runs even when inference breaks.
    assert state['stages']['market_feed']['status'] == 'SUCCESS'
    assert state['stages']['market_publication']['status'] == 'SUCCESS'


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
    stub_market(monkeypatch)
    assert chain.main(['--dry-run']) == 0
    state = final_state(tmp_path)
    assert state['status'] == 'DRY_RUN'
    assert state['stages']['market_feed']['status'] == 'SKIPPED'
    assert state['stages']['market_publication']['status'] == 'SKIPPED'


def test_market_publishes_despite_inference_failure(tmp_path, monkeypatch):
    monkeypatch.setattr(chain, 'PROJECT', tmp_path)
    monkeypatch.setattr(chain, '_run_process', runner([], daily=(1, 'inference failed before summary\n')))
    market_calls = []
    stub_market(monkeypatch, market_calls)
    monkeypatch.setattr(publish_daily_runtime, 'publish', lambda *a, **k: pytest.fail('daily runtime must not publish'))
    assert chain.main([]) == 1
    state = final_state(tmp_path)
    assert market_calls == [{'strict': True}]
    assert state['status'] == 'MARKET_SUCCESS_DAILY_FAILED'
    assert state['stages']['market_publication']['status'] == 'SUCCESS'
    assert state['stages']['runtime_publication']['status'] == 'SKIPPED'


def test_model_failure_does_not_destroy_market_or_other_regions(tmp_path, monkeypatch):
    # A single region failing is reported by the feed, yet publication still runs on the rest.
    monkeypatch.setattr(chain, 'PROJECT', tmp_path)
    (tmp_path / 'market_feed/snapshots').mkdir(parents=True)
    (tmp_path / 'market_feed/snapshots/index.json').write_text(json.dumps({'regions': [
        {'regionId': 'shenyang', 'status': 'SUCCESS', 'latestObservationDate': '2026-10-14', 'freshness': 'FRESH', 'recordCount': 24},
        {'regionId': 'dalian', 'status': 'SOURCE_FAILED', 'latestObservationDate': None, 'freshness': 'MISSING', 'recordCount': 0},
    ]}))
    monkeypatch.setattr(chain, '_run_process', runner([], daily=(1, 'boom\n')))
    stub_market(monkeypatch)
    assert chain.main([]) == 1
    state = final_state(tmp_path)
    assert state['market_regions'][0]['region'] == 'shenyang' and state['market_regions'][1]['status'] == 'SOURCE_FAILED'


def test_market_feed_total_failure_skips_publication_but_keeps_model_chain(tmp_path, monkeypatch):
    monkeypatch.setattr(chain, 'PROJECT', tmp_path)
    summary = {'snapshot_status': 'complete', 'crawl_status': 'OK', 'snapshot_hash': 'actual-valid'}
    monkeypatch.setattr(chain, '_run_process', runner([], feed=(1, ''), daily=(0, 'SUMMARY ' + json.dumps(summary) + '\n'), long=(0, '')))
    monkeypatch.setattr(product_bridge, 'publish_product', lambda strict=True: pytest.fail('no feed => no publication'))
    monkeypatch.setattr(publish_daily_runtime, 'publish', lambda *a, **k: {'status': 'PUBLISHED'})
    assert chain.main([]) == 9  # market feed failure is surfaced, never hidden
    state = final_state(tmp_path)
    assert state['stages']['market_publication']['status'] == 'SKIPPED'
    assert state['stages']['daily']['status'] == 'SUCCESS'
    assert state['stages']['runtime_publication']['status'] == 'SUCCESS'
