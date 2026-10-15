import hashlib
import json
import os
from types import SimpleNamespace

import pytest

from scripts import run_daily_chain as chain
from pipelines.daily.market_feed import product_bridge
from pipelines.publishing import publish_daily_runtime


FEED = 'pipelines.daily.market_feed'
VALID_SUMMARY = {'snapshot_status': 'complete', 'crawl_status': 'SKIPPED', 'snapshot_hash': 'real-existing'}


def feed_stdout(status='SUCCESS', regions=None):
    rows = regions or [{'region_id': rid, 'status': status, 'counts': {'inserted': 1 if status == 'SUCCESS' else 0}} for rid in chain.REGIONS]
    return 'FEED ' + json.dumps({'overallStatus': status, 'regions': rows}) + '\n'


def runner(calls, *, feed=None, daily=None, long=(0, '')):
    feed = feed if feed is not None else (0, feed_stdout())
    daily = daily if daily is not None else (0, 'SUMMARY ' + json.dumps(VALID_SUMMARY))
    def run(command, env, timeout):
        calls.append((command, env, timeout))
        if '-m' in command and FEED in command:
            outcome = feed
        elif 'pipelines/daily/run_daily.py' in command:
            outcome = daily
        elif 'pipelines/long_horizon/run_long_horizon_job.py' in command:
            outcome = long
        else:
            raise AssertionError(command)
        if isinstance(outcome, Exception):
            raise outcome
        return SimpleNamespace(returncode=outcome[0], stdout=outcome[1])
    return run


@pytest.fixture(autouse=True)
def isolated_chain(tmp_path, monkeypatch):
    monkeypatch.setattr(chain, 'PROJECT', tmp_path / 'worker')
    monkeypatch.setattr(chain, 'RUNTIME', tmp_path / 'runtime')
    monkeypatch.delenv('AGRISCOPE_MARKET_FEED_HOME', raising=False)
    monkeypatch.setattr(chain, '_run_process', runner([]))
    monkeypatch.setattr(chain, '_publication', lambda kind, env, timeout, **kwargs: {
        'exit_code': 0, 'publication': {'status': 'PUBLISHED'}, 'receipt': {'status': 'PUBLISHED'}})
    monkeypatch.setattr(chain, '_presentation', lambda env, timeout: {'exit_code': 0, 'publication': {'status': 'PUBLISHED'}})


def final_state():
    return json.loads((chain.PROJECT / 'data/processed/long_horizon/chain_status.json').read_text())


def test_full_chain_keeps_both_branch_capabilities_and_stage_order(monkeypatch):
    order = []
    run = runner([])
    def process(command, env, timeout):
        order.append('feed' if FEED in command else 'daily' if 'pipelines/daily/run_daily.py' in command else 'long')
        return run(command, env, timeout)
    monkeypatch.setattr(chain, '_run_process', process)
    monkeypatch.setattr(chain, '_publication', lambda kind, *a, **kw: order.append(kind) or {'exit_code': 0, 'publication': {'status': 'PUBLISHED'}})
    monkeypatch.setattr(chain, '_presentation', lambda *a: order.append('presentation') or {'exit_code': 0})
    assert chain.main([]) == 0
    state = final_state()
    assert order == ['feed', 'market', 'daily', 'long', 'runtime', 'presentation']
    assert set(state['collector_cities']) == set(chain.REGIONS)
    assert state['new_market_observations'] == 7 and state['daily_collection_status'] == 'NO_NEW_VALID_OBSERVATIONS'
    assert state['collection_status'] == 'SUCCESS'


def test_failed_daily_cannot_publish_runtime_or_trigger_long_job(monkeypatch):
    calls, publications = [], []
    monkeypatch.setattr(chain, '_run_process', runner(calls, daily=(2, 'SUMMARY {"crawl_status":"FAILED"}\n')))
    monkeypatch.setattr(chain, '_publication', lambda kind, *a, **k: publications.append(kind) or {'exit_code': 0})
    assert chain.main([]) == 2
    state = final_state()
    assert publications == ['market']
    assert state['long_horizon_exit'] is None and state['status'] == 'MARKET_SUCCESS_DAILY_FAILED'
    assert state['stages']['presentation_publication']['status'] == 'SUCCESS'


def test_failed_long_job_publishes_daily_without_advancing_long(monkeypatch):
    publications = []
    monkeypatch.setattr(chain, '_run_process', runner([], long=(2, 'model dependency unavailable')))
    monkeypatch.setattr(chain, '_publication', lambda kind, env, timeout, **kw: publications.append((kind, kw)) or {'exit_code': 0})
    assert chain.main([]) == 5
    assert publications == [('market', {}), ('runtime', {'include_long_horizon': False})]
    assert final_state()['status'] == 'DAILY_SUCCESS_LONG_HORIZON_FAILED'


@pytest.mark.parametrize('kind,expected', [('market', 7), ('runtime', 6)])
@pytest.mark.parametrize('failure', ['process', 'exception', 'timeout'])
def test_publisher_failures_are_distinct_and_other_chains_continue(monkeypatch, kind, expected, failure):
    def publication(stage, *args, **kwargs):
        if stage != kind:
            return {'exit_code': 0}
        if failure == 'timeout':
            raise chain.subprocess.TimeoutExpired(stage, 60)
        if failure == 'exception':
            raise ValueError('incompatible generation')
        return {'exit_code': 3}
    monkeypatch.setattr(chain, '_publication', publication)
    assert chain.main([]) == expected
    state = final_state()
    assert state['stages'][kind + '_publication']['status'] == ('TIMED_OUT' if failure == 'timeout' else 'FAILED')
    assert state['stages']['presentation_publication']['status'] == 'SUCCESS'
    assert state['daily_exit'] == 0


@pytest.mark.parametrize('stdout', ['', 'SUMMARY {broken}\n', 'SUMMARY []\n'])
def test_invalid_summary_records_failure_without_blocking_market(monkeypatch, stdout):
    monkeypatch.setattr(chain, '_run_process', runner([], daily=(0, stdout)))
    assert chain.main([]) == 8
    state = final_state()
    assert state['daily_summary_error'].startswith('SUMMARY_')
    assert state['stages']['daily']['status'] == 'FAILED'
    assert state['stages']['market_publication']['status'] == 'SUCCESS'
    assert state['stages']['runtime_publication']['status'] == 'SKIPPED'


def test_timeout_records_state_and_process_group_is_terminated(monkeypatch):
    monkeypatch.setattr(chain, '_run_process', runner([], daily=chain.subprocess.TimeoutExpired('daily', 2)))
    assert chain.main([]) == 124
    assert final_state()['stages']['daily']['status'] == 'TIMED_OUT'
    monkeypatch.undo()
    with pytest.raises(chain.subprocess.TimeoutExpired):
        chain._run_process([chain.sys.executable, '-c', 'import time; time.sleep(5)'], dict(os.environ), .05)


def test_whole_chain_lock_preserves_active_status(monkeypatch):
    monkeypatch.setattr(chain, '_run_process', lambda *args: pytest.fail('locked task cannot launch'))
    active = chain.PROJECT / 'data/processed/long_horizon/chain_status.json'
    chain.atomic_json(active, {'status': 'RUNNING', 'run_id': 'owner'})
    with chain.chain_lock():
        assert chain.main([]) == 4
    assert json.loads(active.read_text())['run_id'] == 'owner'
    attempts = list((chain.PROJECT / 'data/processed/daily/chain_attempts').glob('*.json'))
    assert len(attempts) == 1 and json.loads(attempts[0].read_text())['status'] == 'LOCKED'


def test_wrong_city_rejected_before_any_subprocess(monkeypatch):
    monkeypatch.setattr(chain, '_run_process', lambda *args: pytest.fail('unregistered city'))
    assert chain.main(['--city', 'chaoyang']) == 2
    assert final_state()['status'] == 'CHAIN_FAILED'


def test_dry_run_never_collects_or_publishes_even_with_valid_child_summary(monkeypatch):
    summary = dict(VALID_SUMMARY, crawl_status='OK', collection_completed_at='actual', records_fetched=10)
    monkeypatch.setattr(chain, '_run_process', runner([], daily=(0, 'SUMMARY ' + json.dumps(summary))))
    monkeypatch.setattr(chain, '_publication', lambda *a, **k: pytest.fail('dry publication'))
    monkeypatch.setattr(chain, '_presentation', lambda *a: pytest.fail('dry presentation'))
    assert chain.main(['--dry-run']) == 0
    state = final_state()
    assert state['status'] == 'DRY_RUN' and state['collection_status'] == 'DRY_RUN'
    assert all(state['stages'][name]['status'] == 'SKIPPED' for name in ['market_feed', 'market_publication', 'runtime_publication', 'presentation_publication'])


def test_one_source_failure_preserves_other_regions_and_inference(monkeypatch):
    rows = [{'region_id': 'shenyang', 'status': 'SUCCESS', 'counts': {'inserted': 2}},
            {'region_id': 'dalian', 'status': 'FAILED', 'counts': {}}]
    monkeypatch.setattr(chain, '_run_process', runner([], feed=(0, feed_stdout('PARTIAL', rows))))
    assert chain.main([]) == 0
    state = final_state()
    assert state['market_collection_status'] == 'PARTIAL' and state['collection_status'] == 'PARTIAL'
    assert state['external_blocked_collector_cities'] == ['dalian']
    assert state['stages']['market_publication']['status'] == 'SUCCESS'


def test_total_source_failure_skips_strict_publication_keeps_model_and_presentation(monkeypatch):
    rows = [{'region_id': rid, 'status': 'FAILED', 'counts': {}} for rid in chain.REGIONS]
    monkeypatch.setattr(chain, '_run_process', runner([], feed=(1, feed_stdout('FAILED', rows))))
    assert chain.main([]) == 10
    state = final_state()
    assert state['collection_status'] == 'FAILED' and state['market_collection_status'] == 'FAILED'
    assert state['stages']['market_publication']['status'] == 'SKIPPED'
    assert state['stages']['runtime_publication']['status'] == 'SUCCESS'
    assert state['stages']['presentation_publication']['status'] == 'SUCCESS'


def test_feed_zero_exit_without_business_summary_is_not_collection_success(monkeypatch):
    monkeypatch.setattr(chain, '_run_process', runner([], feed=(0, 'no summary')))
    assert chain.main([]) == 10
    assert final_state()['stages']['market_feed']['status'] == 'FAILED'
    assert final_state()['stages']['market_publication']['status'] == 'SKIPPED'


def test_no_new_observations_and_unchanged_publication_are_explicit(monkeypatch):
    monkeypatch.setattr(chain, '_run_process', runner([], feed=(0, feed_stdout('NO_NEW_PUBLICATION'))))
    monkeypatch.setattr(chain, '_publication', lambda *a, **k: {'exit_code': 0, 'publication': {'status': 'UNCHANGED'}})
    monkeypatch.setattr(chain, '_presentation', lambda *a: {'exit_code': 0, 'publication': {'status': 'UNCHANGED'}})
    assert chain.main([]) == 0
    state = final_state()
    assert state['collection_status'] == 'NO_NEW_VALID_OBSERVATIONS' and state['new_market_observations'] == 0
    assert all(state['stages'][key]['status'] == 'UNCHANGED' for key in ['market_publication', 'runtime_publication', 'presentation_publication'])


@pytest.mark.parametrize('failure', ['process', 'timeout'])
def test_presentation_failure_keeps_original_daily_failure(monkeypatch, failure):
    monkeypatch.setattr(chain, '_run_process', runner([], daily=(2, 'SUMMARY {"crawl_status":"FAILED"}')))
    def present(*a):
        if failure == 'timeout':
            raise chain.subprocess.TimeoutExpired('presentation', 1)
        return {'exit_code': 3}
    monkeypatch.setattr(chain, '_presentation', present)
    assert chain.main([]) == 2
    state = final_state()
    assert state['presentation_publication_exit'] == 9
    assert state['stages']['presentation_publication']['status'] == ('TIMED_OUT' if failure == 'timeout' else 'FAILED')


def test_only_presentation_failure_returns_own_code_under_no_collect(monkeypatch):
    monkeypatch.setattr(chain, '_presentation', lambda *a: {'exit_code': 1})
    assert chain.main(['--no-collect']) == 9
    state = final_state()
    assert state['status'] == 'PRESENTATION_PUBLICATION_FAILED' and state['daily_exit'] == 0
    assert state['market_collection_status'] == 'SKIPPED' and state['collection_status'] == 'SKIPPED'


def load_real_module(name):
    import importlib.util
    spec = importlib.util.spec_from_file_location(name, chain.__file__)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_presentation_reuses_process_timeout_and_verified_current_feed(monkeypatch):
    module = load_real_module('real_presentation_chain')
    monkeypatch.setattr(module, 'PROJECT', chain.PROJECT)
    calls = []
    snapshot = chain.PROJECT / 'market_feed/publication/market-feed.sqlite'
    snapshot.parent.mkdir(parents=True)
    snapshot.write_bytes(b'checkpointed fixture')
    (snapshot.parent / 'provenance.json').write_text(json.dumps({'sha256': hashlib.sha256(snapshot.read_bytes()).hexdigest()}))
    monkeypatch.setattr(module, '_process_result', lambda command, env, timeout: calls.append((command, env, timeout)) or {'exit_code': 0, 'stdout': '{"status":"UNCHANGED"}\n'})
    assert module._presentation({'fixture': 'env'}, 12)['publication']['status'] == 'UNCHANGED'
    command, env, timeout = calls[0]
    assert command[command.index('--feed-db') + 1] == str(snapshot)
    assert '--frontend-bootstrap' not in command and timeout == 12 and env == {'fixture': 'env'}
    snapshot.write_bytes(b'tampered')
    with pytest.raises(ValueError, match='checksum'):
        module._presentation({}, 12)
    assert len(calls) == 1


@pytest.mark.parametrize('kind', ['market', 'runtime'])
def test_publication_child_process_uses_timeout_and_committed_receipt(monkeypatch, kind):
    module = load_real_module('real_publication_chain_' + kind)
    calls = []
    monkeypatch.setattr(module, '_process_result', lambda command, env, timeout: calls.append((command, timeout)) or {'exit_code': 0, 'stdout': 'PUBLICATION {"status":"UNCHANGED"}\n'})
    assert module._publication(kind, {}, 17, include_long_horizon=True)['publication']['status'] == 'UNCHANGED'
    command, timeout = calls[0]
    assert command[command.index('--publication-stage') + 1] == kind and '--include-long-horizon' in command and timeout == 17
    monkeypatch.setattr(module, '_process_result', lambda *a: {'exit_code': 0, 'stdout': 'PUBLICATION {"status":"FAILED"}'})
    with pytest.raises(ValueError, match='committed generation'):
        module._publication(kind, {}, 17)


def test_internal_child_dispatch_preserves_actual_publish_contract(monkeypatch, capsys):
    seen = []
    monkeypatch.setattr(product_bridge, 'publish_product', lambda strict: seen.append(('market', strict)) or {'publication': {'status': 'PUBLISHED'}})
    monkeypatch.setattr(publish_daily_runtime, 'publish', lambda project, runtime, include_long_horizon: seen.append(('runtime', include_long_horizon)) or {'status': 'UNCHANGED'})
    assert chain.main(['--publication-stage', 'market']) == 0
    assert chain.main(['--publication-stage', 'runtime', '--include-long-horizon']) == 0
    assert seen == [('market', True), ('runtime', True)]
    assert capsys.readouterr().out.count('PUBLICATION ') == 2


def test_failed_run_releases_lock_for_next_attempt(monkeypatch):
    monkeypatch.setattr(chain, '_run_process', runner([], daily=(2, 'broken')))
    assert chain.main(['--no-collect']) == 2
    monkeypatch.setattr(chain, '_run_process', runner([]))
    assert chain.main(['--no-collect']) == 0
    assert final_state()['status'] == 'CHAIN_SUCCESS'


def test_skipped_empty_failed_and_dry_collection_never_get_success_timestamp(monkeypatch):
    from pipelines.daily import run_daily as daily
    monkeypatch.setattr(daily.IO, 'now_str', lambda: 'actual-completion-time')
    def row(status, count=1, schema_ok=True):
        return SimpleNamespace(status=status, count=count, schema_ok=schema_ok)
    assert daily.collection_completed_at([row('SKIPPED')]) is None
    assert daily.collection_completed_at([row('FAILED')]) is None
    assert daily.collection_completed_at([row('OK', 0)]) is None
    assert daily.collection_completed_at([row('OK', schema_ok=False)]) is None
    assert daily.collection_completed_at([row('OK')], True) is None
    assert daily.collection_completed_at([row('OK')]) == 'actual-completion-time'


def test_same_run_raw_evidence_survives_inference_failure_and_checks_hash(monkeypatch):
    from datetime import datetime
    from zoneinfo import ZoneInfo
    dispatch = runner([])
    def process(command, env, timeout):
        if 'pipelines/daily/run_daily.py' not in command:
            return dispatch(command, env, timeout)
        day = chain.PROJECT / 'data/raw/daily/shenyang_clz/2026-10-13'
        day.mkdir(parents=True)
        raw = day / 'mt1.json'
        raw.write_bytes(b'actual saved source response for provenance test')
        attempt = {'status': 'OK', 'schema_ok': True, 'count': 1,
                   'crawl_time': datetime.now(ZoneInfo('Asia/Shanghai')).strftime('%Y-%m-%d %H:%M:%S'),
                   'raw_path': str(raw.relative_to(chain.PROJECT)),
                   'raw_sha256': hashlib.sha256(raw.read_bytes()).hexdigest(),
                   'chain_run_id': env['AGRISCOPE_CHAIN_RUN_ID']}
        (day / 'metadata.json').write_text(json.dumps({'latest_attempts': {'mt1': attempt}}))
        return SimpleNamespace(returncode=1, stdout='inference failed before summary')
    monkeypatch.setattr(chain, '_run_process', process)
    assert chain.main([]) == 1
    state = final_state()
    assert state['daily_collection_status'] == 'SUCCESS'
    assert state['stages']['market_publication']['status'] == 'SUCCESS'
    assert state['stages']['runtime_publication']['status'] == 'SKIPPED'
    raw = chain.PROJECT / 'data/raw/daily/shenyang_clz/2026-10-13/mt1.json'
    raw.write_bytes(b'tampered response')
    assert chain._new_collection({}, state['started_at'], [], state['run_id']) is False
    assert chain._new_collection({}, state['started_at'], [], 'another-run') is False
