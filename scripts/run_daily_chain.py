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
        code = value.get('exit_code', 0) if isinstance(value, dict) else 0
        publication = value.get('publication', {}) if isinstance(value, dict) else {}
        status = 'FAILED' if code else 'UNCHANGED' if publication.get('status') == 'UNCHANGED' else 'SUCCESS'
        result['stages'][name] = {'status': status, 'finished_at': _now(), 'result': recorded}; _record(result)
        return value, code
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


def _marked_json(stdout, marker):
    lines = [line[len(marker):] for line in (stdout or '').splitlines() if line.startswith(marker)]
    if not lines:
        raise ValueError(f'{marker.strip()} summary missing')
    value = json.loads(lines[-1])
    if not isinstance(value, dict):
        raise ValueError(f'{marker.strip()} summary must be an object')
    return value


def _feed_outcome(stdout):
    summary = _marked_json(stdout, 'FEED ')
    regions = summary.get('regions')
    if summary.get('overallStatus') not in {'SUCCESS', 'PARTIAL', 'NO_NEW_PUBLICATION', 'FAILED'} or not isinstance(regions, list) or not regions:
        raise ValueError('Invalid market feed business result')
    seen = set()
    for row in regions:
        if not isinstance(row, dict) or row.get('region_id') not in REGIONS or row['region_id'] in seen:
            raise ValueError('Invalid/duplicate market feed region')
        seen.add(row['region_id'])
        if row.get('status') not in {'SUCCESS', 'PARTIAL', 'NO_NEW_PUBLICATION', 'FAILED', 'SOURCE_SCHEMA_CHANGED'}:
            raise ValueError('Invalid market feed region status')
        counts = row.get('counts', {})
        if not isinstance(counts, dict) or any(type(counts.get(key, 0)) is not int or counts.get(key, 0) < 0 for key in ('inserted', 'updated', 'unchanged', 'rejected')):
            raise ValueError('Invalid market feed observation counts')
    return summary


def _verified_feed_snapshot():
    home = _market_feed_home(PROJECT).resolve()
    snapshot = home / 'publication/market-feed.sqlite'
    receipt = snapshot.parent / 'provenance.json'
    if not snapshot.exists() and not receipt.exists():
        return None
    if (snapshot.is_symlink() or receipt.is_symlink() or not snapshot.resolve().is_relative_to(home)
            or not receipt.resolve().is_relative_to(home)):
        raise ValueError('Feed publication snapshot escapes worker')
    expected = json.loads(receipt.read_text(encoding='utf-8')).get('sha256')
    if hashlib.sha256(snapshot.read_bytes()).hexdigest() != expected:
        raise ValueError('Feed publication snapshot checksum mismatch')
    return snapshot


def _publication(kind, env, timeout, include_long_horizon=False):
    command = [sys.executable, str(_CODE_PRODUCT / 'scripts/run_daily_chain.py'), '--publication-stage', kind]
    if include_long_horizon:
        command.append('--include-long-horizon')
    value = _process_result(command, env, timeout)
    if not value['exit_code']:
        payload = _marked_json(value['stdout'], 'PUBLICATION ')
        publication = payload.get('publication', payload)
        if not isinstance(publication, dict) or publication.get('status') not in {'PUBLISHED', 'UNCHANGED'}:
            raise ValueError('Publication did not return a committed generation')
        value['publication'] = publication
        value['receipt'] = payload
    return value


def _presentation(env, timeout):
    # Consume the same checkpointed, receipted seven-region input as strict V3.
    # Runtime anchors remain usable when this is the first/no-collect run.
    command = [sys.executable, str(_CODE_PRODUCT / 'pipelines/publishing/publish_market_presentation.py'),
               '--project-root', str(PROJECT), '--runtime-root', str(RUNTIME)]
    snapshot = _verified_feed_snapshot()
    if snapshot is not None:
        command.extend(['--feed-db', str(snapshot)])
    value = _process_result(command, env, timeout)
    if not value['exit_code']:
        lines = [line for line in value['stdout'].splitlines() if line.startswith('{')]
        payload = json.loads(lines[-1]) if lines else None
        if not isinstance(payload, dict) or payload.get('status') not in {'PUBLISHED', 'UNCHANGED'}:
            raise ValueError('Presentation did not return a committed generation')
        value['publication'] = payload
    return value


REGIONS = ['shenyang', 'tieling', 'chaoyang', 'jinzhou', 'dandong', 'dalian', 'liaoning']


def _execute(argv, result):
    probe = argparse.ArgumentParser(add_help=False)
    probe.add_argument('--city', choices=['沈阳', 'shenyang'], default='沈阳')
    probe.parse_known_args(argv)
    env = dict(os.environ, PROJECT_ROOT=str(PROJECT), AGRISCOPE_WORKER_ROOT=str(PROJECT), AGRISCOPE_ROOT=str(ROOT), AGRISCOPE_CHAIN_RUN_ID=result['run_id'],
               PYTHONPATH=os.pathsep.join([str(ROOT), str(ROOT / 'pipelines/modeling'), str(ROOT / 'pipelines/modeling/src')]))
    daily_timeout = float(os.environ.get('AGRISCOPE_DAILY_TIMEOUT_SECONDS', '900'))
    long_timeout = float(os.environ.get('AGRISCOPE_LONG_TIMEOUT_SECONDS', '900'))
    market_timeout = float(os.environ.get('AGRISCOPE_MARKET_TIMEOUT_SECONDS', '900'))
    publication_timeout = float(os.environ.get('AGRISCOPE_PUBLICATION_TIMEOUT_SECONDS', '60'))
    presentation_timeout = float(os.environ.get('AGRISCOPE_PRESENTATION_TIMEOUT_SECONDS', '300'))
    if any(not 0 < timeout <= 86400 for timeout in (daily_timeout, long_timeout, market_timeout, publication_timeout, presentation_timeout)):
        raise ValueError('invalid stage timeout')
    dry_run, no_collect = '--dry-run' in argv, '--no-collect' in argv

    # One failed region cannot discard another region's validated observations.
    feed_exit = 0
    feed_summary = None
    if not dry_run and not no_collect:
        feed, feed_exit = _stage(result, 'market_feed', lambda: _process_result(
            [sys.executable, '-m', 'pipelines.daily.market_feed', 'daily'], env, market_timeout))
        result['market_feed_exit'] = feed_exit
        result['market_collection_status'] = 'FAILED'
        if feed:
            try:
                feed_summary = _feed_outcome(feed['stdout'])
                result['market_regions'] = feed_summary['regions']
                result['market_collection_status'] = feed_summary['overallStatus']
                result['stages']['market_feed']['business_status'] = feed_summary['overallStatus']
                if feed_summary['overallStatus'] == 'FAILED' and not feed_exit:
                    feed_exit = result['market_feed_exit'] = 1
                    result['stages']['market_feed']['status'] = 'FAILED'
            except (ValueError, TypeError, KeyError) as exc:
                result['market_feed_summary_error'] = str(exc)
                if not feed_exit:
                    feed_exit = result['market_feed_exit'] = 8
                    result['stages']['market_feed']['status'] = 'FAILED'
        result['external_blocked_collector_cities'] = [row['region_id'] for row in (feed_summary or {}).get('regions', [])
                                                       if row['status'] in {'FAILED', 'SOURCE_SCHEMA_CHANGED'}]
    else:
        result['market_feed_exit'] = None
        result['market_collection_status'] = 'DRY_RUN' if dry_run else 'SKIPPED'

    market_exit = 0
    published_ok = False
    if not dry_run and not no_collect and not feed_exit:
        publication, market_exit = _stage(result, 'market_publication', lambda: _publication('market', env, publication_timeout))
        result['market_publication_exit'] = 7 if market_exit else 0
        published_ok = not market_exit and publication is not None
        if publication is not None:
            result['market_publication'] = publication.get('receipt', publication)

    daily, failure = _stage(result, 'daily', lambda: _process_result([sys.executable, 'pipelines/daily/run_daily.py', *argv], env, daily_timeout))
    summary, summary_error = _summary(daily['stdout']) if daily else ({}, 'DAILY_NOT_COMPLETED')
    result['daily_exit'] = daily['exit_code'] if daily else failure
    result['daily_snapshot_hash'] = summary.get('snapshot_hash')
    if summary_error:
        result['daily_summary_error'] = summary_error
    if result['daily_exit'] or summary_error:
        result['stages']['daily']['status'] = 'FAILED' if not failure else result['stages']['daily']['status']
    daily_collection = _new_collection(summary, result['started_at'], argv, result['run_id'])
    result['daily_collection_status'] = 'SUCCESS' if daily_collection else 'DRY_RUN' if dry_run else 'SKIPPED' if no_collect else 'NO_NEW_VALID_OBSERVATIONS'
    feed_new = sum(row.get('counts', {}).get('inserted', 0) + row.get('counts', {}).get('updated', 0) for row in (feed_summary or {}).get('regions', []))
    result['new_market_observations'] = feed_new
    result['collection_status'] = ('DRY_RUN' if dry_run else 'SKIPPED' if no_collect else
                                   'PARTIAL' if feed_new and result.get('market_collection_status') == 'PARTIAL' else
                                   'SUCCESS' if feed_new or daily_collection else
                                   'FAILED' if feed_exit else 'NO_NEW_VALID_OBSERVATIONS')

    if eligible(summary, result['daily_exit']) and not dry_run:
        long, long_failure = _stage(result, 'long_horizon', lambda: _process_result([sys.executable, 'pipelines/long_horizon/run_long_horizon_job.py'], env, long_timeout))
        long_exit = long['exit_code'] if long else long_failure
        result['long_horizon_exit'] = long_exit
        publication, pub_failure = _stage(result, 'runtime_publication', lambda: _publication('runtime', env, publication_timeout, include_long_horizon=long_exit == 0))
        result['runtime_publication_exit'] = 6 if pub_failure else 0
        if publication is not None:
            result['runtime_publication'] = publication.get('receipt', publication)
        result['status'] = 'RUNTIME_PUBLICATION_FAILED' if pub_failure else 'DAILY_SUCCESS_LONG_HORIZON_FAILED' if long_exit else 'CHAIN_SUCCESS'
    else:
        result['long_horizon_exit'] = None
        result['status'] = 'DRY_RUN' if dry_run and not result['daily_exit'] else 'LONG_HORIZON_SKIPPED_DAILY_NOT_SUCCESSFUL'
    if market_exit:
        result['status'] = 'MARKET_PUBLICATION_FAILED'
    elif published_ok and result['daily_exit']:
        result['status'] = 'MARKET_SUCCESS_DAILY_FAILED'
    elif feed_exit:
        result['status'] = 'MARKET_FEED_FAILED'
    if not result['daily_exit'] and summary_error:
        result['daily_exit'] = 8
    # 9 belongs to Presentation; 10 distinguishes market collection failure.
    original_exit = (result['daily_exit'] or result.get('runtime_publication_exit', 0) or result.get('market_publication_exit', 0)
                     or (10 if feed_exit else 0) or (5 if result.get('long_horizon_exit') else 0))
    if not dry_run:
        presentation, presentation_exit = _stage(result, 'presentation_publication', lambda: _presentation(env, presentation_timeout))
        result['presentation_publication_exit'] = 9 if presentation_exit else 0
        if presentation is not None:
            result['presentation_publication'] = presentation.get('publication')
        if presentation_exit and not original_exit:
            result['status'] = 'PRESENTATION_PUBLICATION_FAILED'
    return original_exit or result.get('presentation_publication_exit', 0)


def _publication_main(argv):
    # Internal child entry keeps each publication under the process-group timeout.
    parser = argparse.ArgumentParser()
    parser.add_argument('--publication-stage', choices=['market', 'runtime'], required=True)
    parser.add_argument('--include-long-horizon', action='store_true')
    args = parser.parse_args(argv)
    if args.publication_stage == 'market':
        from pipelines.daily.market_feed.product_bridge import publish_product
        result = publish_product(strict=True)
    else:
        from pipelines.publishing.publish_daily_runtime import publish
        result = publish(PROJECT, RUNTIME, include_long_horizon=args.include_long_horizon)
    print('PUBLICATION ' + json.dumps(result, ensure_ascii=False))
    return 0


def main(argv=None):
    argv = list(argv or [])
    if '--publication-stage' in argv:
        return _publication_main(argv)
    result = {'run_id': uuid.uuid4().hex, 'started_at': _now(), 'status': 'STARTING',
              'collector_cities': list(REGIONS), 'external_blocked_collector_cities': [],
              'stages': {key: {'status': 'SKIPPED'} for key in ['market_feed', 'market_publication', 'daily', 'long_horizon', 'runtime_publication', 'presentation_publication']}}
    active = False
    try:
        with chain_lock():
            active = True
            _record(result)
            code = _execute(argv, result)
            result['finished_at'] = _now()
            _record(result)
    except BlockingIOError:
        result.update(status='LOCKED', finished_at=_now())
        _record(result, active=False)
        code = 4
    except (Exception, SystemExit) as exc:
        result.update(status='CHAIN_FAILED', error_type=type(exc).__name__, reason=str(exc)[:250], finished_at=_now())
        _record(result, active=active)
        code = int(exc.code or 1) if isinstance(exc, SystemExit) else 1
    print('CHAIN ' + json.dumps(result, ensure_ascii=False))
    return code


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
