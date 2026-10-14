#!/usr/bin/env python3
"""Isolated worker chain with independent collection, inference and publication outcomes."""
from __future__ import annotations
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import uuid
from zoneinfo import ZoneInfo

_CODE_PRODUCT = Path(__file__).resolve().parents[1]
if str(_CODE_PRODUCT) not in sys.path: sys.path.insert(0, str(_CODE_PRODUCT))
from agriscope_paths import paths
_PATHS = paths()
ROOT, PROJECT, RUNTIME = _PATHS.product, _PATHS.worker, _PATHS.runtime

def _now(): return datetime.now(timezone.utc).isoformat()

def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.chain-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(value, stream, ensure_ascii=False, allow_nan=False)
            stream.flush(); os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name): os.unlink(name)

def _record(result, active=True):
    result['updated_at'] = _now()
    if active: atomic_json(PROJECT / 'data/processed/long_horizon/chain_status.json', result)
    atomic_json(PROJECT / 'data/processed/daily/chain_attempts' / (result['run_id'] + '.json'), result)

@contextmanager
def chain_lock():
    path = PROJECT / 'data/processed/daily/.chain.lock'
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_symlink(): raise ValueError('chain lock cannot be a symlink')
    with path.open('a') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try: yield
        finally: fcntl.flock(stream, fcntl.LOCK_UN)

def _run_process(command, env, timeout):
    """Timeout terminates the whole process group, including inference children."""
    with subprocess.Popen(command, cwd=ROOT, env=env, text=True, stdout=subprocess.PIPE,
                          stderr=subprocess.STDOUT, start_new_session=True) as process:
        try: output, _ = process.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            try: os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError: pass
            try: process.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                try: os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError: pass
                process.communicate()
            raise
        return subprocess.CompletedProcess(command, process.returncode, output)

def _summary(stdout):
    lines = [line[8:] for line in (stdout or '').splitlines() if line.startswith('SUMMARY ')]
    if not lines: return {}, 'SUMMARY_MISSING'
    try: result = json.loads(lines[-1])
    except (ValueError, TypeError): return {}, 'SUMMARY_INVALID_JSON'
    return (result, None) if isinstance(result, dict) else ({}, 'SUMMARY_NOT_OBJECT')

def eligible(summary, code):
    return (code == 0 and summary.get('dry_run') is not True and
            summary.get('snapshot_status') in ('complete', 'partial') and
            summary.get('crawl_status') in ('OK', 'PARTIAL', 'SKIPPED') and
            isinstance(summary.get('snapshot_hash'), str) and bool(summary['snapshot_hash']))

def _new_collection(summary, started_at, argv, run_id=None):
    if '--dry-run' in argv or '--no-collect' in argv: return False
    if (summary.get('crawl_status') in ('OK', 'PARTIAL') and summary.get('collection_completed_at')
            and isinstance(summary.get('records_fetched'), int) and summary['records_fetched'] > 0): return True
    # An inference failure may prevent SUMMARY. Same-run immutable success evidence still
    # allows the independent strict market publisher to validate and adopt actual prices.
    start = datetime.fromisoformat(started_at).replace(microsecond=0)
    for path in (PROJECT / 'data/raw/daily/shenyang_clz').glob('*/metadata.json'):
        try:
            metadata = json.loads(path.read_text(encoding='utf-8'))
            for attempt in metadata.get('latest_attempts', {}).values():
                if run_id is not None and attempt.get('chain_run_id') != run_id: continue
                if attempt.get('status') != 'OK' or attempt.get('schema_ok') is not True or not isinstance(attempt.get('count'), int) or attempt['count'] <= 0: continue
                collected = datetime.fromisoformat(attempt['crawl_time']).replace(tzinfo=ZoneInfo('Asia/Shanghai'))
                raw = PROJECT / attempt['raw_path']
                if (collected >= start and raw.is_file() and not raw.is_symlink()
                        and raw.resolve().is_relative_to(path.parent.resolve())
                        and hashlib.sha256(raw.read_bytes()).hexdigest() == attempt['raw_sha256']): return True
        except (OSError, ValueError, KeyError, TypeError, AttributeError): continue
    return False

def _stage(result, name, call):
    result['stages'][name] = {'status': 'RUNNING', 'started_at': _now()}; _record(result)
    try:
        value = call()
        recorded = {key: item for key, item in value.items() if key != 'stdout'} if isinstance(value, dict) else value
        status = 'FAILED' if isinstance(value, dict) and value.get('exit_code', 0) != 0 else 'SUCCESS'
        result['stages'][name] = {'status': status, 'finished_at': _now(), 'result': recorded}; _record(result)
        return value, 0
    except subprocess.TimeoutExpired as exc:
        status, code, reason = 'TIMED_OUT', 124, f'process exceeded {exc.timeout}s'
    except Exception as exc:
        status, code, reason = 'FAILED', 1, f'{type(exc).__name__}: {str(exc)[:250]}'
    result['stages'][name] = {'status': status, 'exit_code': code, 'reason': reason, 'finished_at': _now()}; _record(result)
    return None, code

def _process_result(command, env, timeout):
    completed = _run_process(command, env, timeout)
    output = getattr(completed, 'stdout', '') or ''
    print(output, end='')
    return {'exit_code': completed.returncode, 'stdout': output}

def _market_feed_home(project):
    return Path(os.environ.get('AGRISCOPE_MARKET_FEED_HOME') or (Path(project) / 'market_feed'))

def _market_regions(project):
    """Read the per-region states the market feed just published (never inferred from exit code)."""
    index = _market_feed_home(project) / 'snapshots' / 'index.json'
    try: data = json.loads(index.read_text(encoding='utf-8'))
    except (OSError, ValueError): return []
    return [{'region': r.get('regionId'), 'status': r.get('status'),
             'latest_observation_date': r.get('latestObservationDate'),
             'freshness': r.get('freshness'), 'records': r.get('recordCount')}
            for r in data.get('regions', [])]

def _execute(argv, result):
    probe = argparse.ArgumentParser(add_help=False)
    probe.add_argument('--city', choices=['沈阳', 'shenyang'], default='沈阳')
    probe.parse_known_args(argv)
    env = dict(os.environ, PROJECT_ROOT=str(PROJECT), AGRISCOPE_WORKER_ROOT=str(PROJECT), AGRISCOPE_ROOT=str(ROOT), AGRISCOPE_CHAIN_RUN_ID=result['run_id'],
               PYTHONPATH=os.pathsep.join([str(ROOT), str(ROOT / 'pipelines/modeling'), str(ROOT / 'pipelines/modeling/src')]))
    daily_timeout = float(os.environ.get('AGRISCOPE_DAILY_TIMEOUT_SECONDS', '900'))
    long_timeout = float(os.environ.get('AGRISCOPE_LONG_TIMEOUT_SECONDS', '900'))
    market_timeout = float(os.environ.get('AGRISCOPE_MARKET_TIMEOUT_SECONDS', '900'))
    if not 0 < daily_timeout <= 86400 or not 0 < long_timeout <= 86400 or not 0 < market_timeout <= 86400:
        raise ValueError('invalid stage timeout')
    dry_run, no_collect = '--dry-run' in argv, '--no-collect' in argv

    # 1) Seven-region market feed — fully decoupled from the Shenyang model chain.
    #    One region failing must never stop the other six.
    market_feed_exit = 0
    if not dry_run and not no_collect:
        feed, feed_failure = _stage(result, 'market_feed', lambda: _process_result(
            [sys.executable, '-m', 'pipelines.daily.market_feed', 'daily'], env, market_timeout))
        market_feed_exit = feed['exit_code'] if feed else feed_failure
        result['market_feed_exit'] = market_feed_exit
        result['market_regions'] = _market_regions(PROJECT)
    else:
        result['market_feed_exit'] = None

    # 2) Strict V3 publication from the feed observation DB. It never depends on the
    #    Shenyang model chain; a model failure cannot discard other regions' verified prices.
    market_exit = 0
    published_ok = False
    if not dry_run and not no_collect and market_feed_exit == 0:
        from pipelines.daily.market_feed.product_bridge import publish_product
        publication, market_exit = _stage(result, 'market_publication', lambda: publish_product(strict=True))
        published_ok = market_exit == 0 and publication is not None
        result['market_publication_exit'] = 7 if market_exit else 0
        if publication is not None: result['market_publication'] = publication

    # 3) Shenyang Daily model chain (collection + Final inference + snapshot).
    daily, failure = _stage(result, 'daily', lambda: _process_result([sys.executable, 'pipelines/daily/run_daily.py', *argv], env, daily_timeout))
    summary, summary_error = _summary(daily['stdout']) if daily else ({}, 'DAILY_NOT_COMPLETED')
    result['daily_exit'] = daily['exit_code'] if daily else failure
    result['daily_snapshot_hash'] = summary.get('snapshot_hash')
    if summary_error: result['daily_summary_error'] = summary_error
    if result['daily_exit'] or summary_error:
        result['stages']['daily']['status'] = 'FAILED' if not failure else result['stages']['daily']['status']
    collection = _new_collection(summary, result['started_at'], argv, result['run_id'])
    result['collection_status'] = 'SUCCESS' if collection else 'DRY_RUN' if dry_run else 'SKIPPED' if no_collect else 'NO_NEW_VALID_OBSERVATIONS'

    # 4) Long horizon forecast + 5) immutable Daily runtime publication.
    if eligible(summary, result['daily_exit']) and not dry_run:
        long, long_failure = _stage(result, 'long_horizon', lambda: _process_result([sys.executable, 'pipelines/long_horizon/run_long_horizon_job.py'], env, long_timeout))
        long_exit = long['exit_code'] if long else long_failure
        result['long_horizon_exit'] = long_exit
        if long_exit and long: result['stages']['long_horizon']['status'] = 'FAILED'
        from pipelines.publishing.publish_daily_runtime import publish
        publication, pub_failure = _stage(result, 'runtime_publication', lambda: publish(PROJECT, RUNTIME, include_long_horizon=long_exit == 0))
        result['runtime_publication_exit'] = 6 if pub_failure else 0
        if publication is not None: result['runtime_publication'] = publication
        result['status'] = 'RUNTIME_PUBLICATION_FAILED' if pub_failure else 'DAILY_SUCCESS_LONG_HORIZON_FAILED' if long_exit else 'CHAIN_SUCCESS'
    else:
        result['long_horizon_exit'] = None
        result['status'] = 'DRY_RUN' if dry_run and not result['daily_exit'] else 'LONG_HORIZON_SKIPPED_DAILY_NOT_SUCCESSFUL'
    # Market outcome is reported without ever overwriting the model-chain outcome.
    if market_exit: result['status'] = 'MARKET_PUBLICATION_FAILED'
    elif published_ok and result['daily_exit']: result['status'] = 'MARKET_SUCCESS_DAILY_FAILED'
    elif result.get('market_feed_exit'): result['status'] = 'MARKET_FEED_FAILED'
    if not result['daily_exit'] and summary_error: result['daily_exit'] = 8
    return (result['daily_exit'] or result.get('runtime_publication_exit', 0) or result.get('market_publication_exit', 0)
            or (9 if result.get('market_feed_exit') else 0) or (5 if result.get('long_horizon_exit') else 0))

def main(argv=None):
    argv = list(argv or [])
    result = {'run_id': uuid.uuid4().hex, 'started_at': _now(), 'status': 'STARTING',
              'collector_cities': ['shenyang', 'tieling', 'chaoyang', 'jinzhou', 'dandong', 'dalian', 'liaoning'],
              'external_blocked_collector_cities': [],
              'stages': {key: {'status': 'SKIPPED'} for key in ['market_feed', 'market_publication', 'daily', 'long_horizon', 'runtime_publication']}}
    active = False
    try:
        with chain_lock():
            active = True; _record(result)
            code = _execute(argv, result)
            result['finished_at'] = _now(); _record(result)
    except BlockingIOError:
        result.update(status='LOCKED', finished_at=_now()); _record(result, active=False); code = 4
    except (Exception, SystemExit) as exc:
        result.update(status='CHAIN_FAILED', error_type=type(exc).__name__, reason=str(exc)[:250], finished_at=_now())
        _record(result, active=active); code = int(exc.code or 1) if isinstance(exc, SystemExit) else 1
    print('CHAIN ' + json.dumps(result, ensure_ascii=False))
    return code

if __name__ == '__main__': raise SystemExit(main(sys.argv[1:]))
