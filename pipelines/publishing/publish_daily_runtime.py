#!/usr/bin/env python3
"""Publish only validated Daily inputs into immutable generations; atomically advance manifest."""
from __future__ import annotations
import argparse
import fcntl
import hashlib
import json
import math
import os
import shutil
import sys
import tempfile
from datetime import date, datetime, timezone, timedelta
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from agriscope_daily_publication import EXTENDED_FILES, PREFIX, digest, generation_id, resolve


def _json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def _business_hash(snapshot):
    core = {k: v for k, v in snapshot.items() if k not in ('generated_at', 'updated_at', 'monitor', 'snapshot_hash')}
    return hashlib.sha256(json.dumps(core, ensure_ascii=False, sort_keys=True, default=str).encode()).hexdigest()[:16]


def _validate_daily(snapshot, meta, fingerprint):
    from pipelines.daily.snapshot import validate_snapshot
    if validate_snapshot(snapshot) or snapshot.get('schema_version') != '1.1.0' or snapshot.get('city') != '沈阳':
        raise ValueError('Daily contract invalid')
    if snapshot.get('status') not in ('complete', 'partial') or snapshot.get('crawl_status') == 'FAILED' or snapshot.get('dry_run'):
        raise ValueError('failed or dry-run Daily cannot be published')
    if not snapshot.get('contract_valid') or snapshot.get('snapshot_hash') != _business_hash(snapshot):
        raise ValueError('Daily business hash invalid')
    latest = date.fromisoformat(snapshot['latest_data_date'])
    if latest > date.fromisoformat(snapshot['date']) or date.fromisoformat(snapshot['date']) > datetime.now(timezone(timedelta(hours=8))).date():
        raise ValueError('future observation date')
    for key, source in [('code_fingerprint', 'code_fingerprint'), ('model_version', 'model_version'), ('final_generated_at', 'generated_at')]:
        if fingerprint.get(key) != meta.get(source):
            raise ValueError('input fingerprint incompatible with frozen Final')
    if snapshot['model_version'] != meta['model_version'] or snapshot.get('model_data_version') != meta['data_version']:
        raise ValueError('Daily model version incompatible')
    if snapshot.get('model', {}).get('final_code_fingerprint') != meta['code_fingerprint']:
        raise ValueError('Daily model fingerprint incompatible')
    sources = {s.get('source_id'): s for s in snapshot['sources'] if isinstance(s, dict)}
    seen = set()
    for crop in snapshot['crops']:
        price = crop.get('latest_price')
        source = sources.get(crop.get('source'))
        if not crop.get('crop') or crop['crop'] in seen or crop.get('unit') not in ('元/公斤', '元/kg') or crop.get('price_level') != 'wholesale':
            raise ValueError('duplicate crop or incompatible price unit/level')
        if not source or source.get('city') != '沈阳' or source.get('price_level') != 'wholesale' or not source.get('model_comparable') or not str(source.get('url', '')).startswith(('https://', 'http://')):
            raise ValueError('untraceable or wrong-city Daily source')
        if price is not None and (isinstance(price, bool) or not isinstance(price, (int, float)) or not math.isfinite(price) or price <= 0):
            raise ValueError('invalid observation price')
        if date.fromisoformat(crop['data_date']) > latest:
            raise ValueError('crop observation exceeds published cutoff')
        seen.add(crop['crop'])
    if not seen:
        raise ValueError('empty Daily observations')


def _validate_inputs(directory, latest):
    import pandas as pd
    for city in ['shenyang_core', 'chaoyang_extended', 'jinzhou_extended']:
        path = directory / 'model_ready' / city / 'market_daily.parquet'
        frame = pd.read_parquet(path)
        if frame.empty or not {'observation_date','city','crop_standard','price_per_kg','unit_original','price_level'} <= set(frame.columns):
            raise ValueError('market input missing observations')
        expected={'shenyang_core':'沈阳','chaoyang_extended':'朝阳','jinzhou_extended':'锦州'}[city]
        if not frame['city'].dropna().eq(expected).all():
            raise ValueError('wrong-city input table')
        dates=pd.to_datetime(frame['observation_date'],errors='coerce')
        if city == 'shenyang_core' and dates.max().date().isoformat() != latest:
            raise ValueError('Daily cutoff differs from extended market input')
    for name in EXTENDED_FILES:
        if name.endswith('.parquet'):
            pd.read_parquet(directory / name)  # Parse every whitelisted table before advancing the pointer.


def publish(project_root, runtime_dir, include_long_horizon=True):
    project, runtime = Path(project_root).resolve(), Path(runtime_dir).resolve()
    if not runtime.is_dir() or runtime.is_symlink():
        raise ValueError('existing runtime package required')
    manifest = runtime / 'manifest.json'
    if not manifest.is_file():
        raise ValueError('runtime manifest required')
    publication_dir = runtime / PREFIX.rstrip('/')
    publication_dir.mkdir(parents=True, exist_ok=True)
    if publication_dir.is_symlink() or not publication_dir.resolve().is_relative_to(runtime):
        raise ValueError('publication directory escapes runtime')
    if (publication_dir / '.publish.lock').is_symlink():
        raise ValueError('publication lock cannot be a symlink')
    with (publication_dir / '.publish.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        original = manifest.read_bytes()
        obj = json.loads(original)
        previous = resolve(runtime)
        daily_root = project / 'data/processed/daily'
        extended = daily_root / 'final_input/extended_snapshot'
        latest_path = daily_root / 'snapshots/latest.json'
        snapshot = _json(latest_path)
        meta = _json(runtime / 'models/reports/final/FINAL_RUN_META.json')
        _validate_daily(snapshot, meta, _json(extended / '.source_fingerprint.json'))
        if previous and snapshot['latest_data_date'] < previous['latest_data_date']:
            raise ValueError('observation date regression')
        _validate_inputs(extended, snapshot['latest_data_date'])
        sources = {'daily/latest.json': latest_path, **{'extended_snapshot/' + name: extended / name for name in EXTENDED_FILES}}
        monitor = daily_root / 'monitor/status.json'
        if monitor.is_file():
            _json(monitor)
            sources['daily/monitor.json'] = monitor
        long_path = project / 'data/processed/long_horizon/snapshots/latest.json'
        if include_long_horizon and long_path.is_file():
            long = _json(long_path)
            if long.get('schema_version') != 'lh_forecast_v2' or long.get('as_of') != snapshot['latest_data_date'] or not isinstance(long.get('entries'), list) or not long['entries']:
                raise ValueError('long-horizon snapshot not aligned with Daily')
            from backend.app.services.long_horizon_service import _valid_entry
            keys=[(row.get('crop'),row.get('horizon'),row.get('target_type')) for row in long['entries']]
            if len(keys)!=len(set(keys)) or not all(_valid_entry(row) for row in long['entries']):
                raise ValueError('long-horizon target contract invalid')
            sources['long_horizon/latest.json'] = long_path
        elif previous and 'long_horizon/latest.json' in previous['files']:
            # A failed long job retains its old, explicitly stale snapshot; Daily remains usable.
            sources['long_horizon/latest.json'] = previous['directory'] / 'long_horizon/latest.json'
        files = {name: digest(source) for name, source in sources.items()}
        identity = generation_id(files)
        if previous and previous['generation'] == PREFIX + identity:
            return {'status': 'UNCHANGED', 'generation': previous['generation'], 'copied_files': 0}
        copied, linked = 0, 0
        destination = publication_dir / identity
        if destination.exists():
            if any(digest(destination / name) != sha for name, sha in files.items()):
                raise ValueError('existing generation integrity mismatch')
        else:
            with tempfile.TemporaryDirectory(prefix='.stage-', dir=publication_dir) as temporary:
                staging = Path(temporary) / 'generation'
                staging.mkdir()
                for name, source in sources.items():
                    target = staging / name
                    target.parent.mkdir(parents=True, exist_ok=True)
                    if source.is_symlink():
                        raise ValueError('mutable source symlinks prohibited')
                    if previous and previous['files'].get(name) == files[name]:
                        os.link(previous['directory'] / name, target)
                        linked += 1
                    else:
                        shutil.copyfile(source, target)
                        copied += 1
                    if digest(target) != files[name]:
                        raise ValueError('source changed while publishing')
                    target.chmod(0o440)
                    with target.open('rb') as f:
                        os.fsync(f.fileno())
                if _json(staging / 'daily/latest.json') != snapshot:
                    raise ValueError('Daily source changed during publication')
                _validate_daily(snapshot,meta,_json(staging / 'extended_snapshot/.source_fingerprint.json'))
                _validate_inputs(staging / 'extended_snapshot',snapshot['latest_data_date'])
                for folder in [staging,*[p for p in staging.rglob('*') if p.is_dir()]]:
                    _sync_directory(folder)
                os.replace(staging, destination)
                _sync_directory(publication_dir)
        entry = dict(schema_version=1, generation=PREFIX + identity, files=files,
                     snapshot_hash=snapshot['snapshot_hash'], latest_data_date=snapshot['latest_data_date'],
                     snapshot_generated_at=snapshot['generated_at'], published_at=datetime.now(timezone.utc).isoformat())
        obj['daily_publication'] = entry
        if manifest.read_bytes() != original:
            raise ValueError('manifest changed during publication')
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', prefix='.manifest-', dir=runtime, delete=False) as temporary:
            path = Path(temporary.name)
            try:
                json.dump(obj, temporary, ensure_ascii=False, indent=2)
                temporary.flush(); os.fsync(temporary.fileno())
            except Exception:
                path.unlink(missing_ok=True)
                raise
        try:
            os.replace(path, manifest)
            _sync_directory(runtime)
        finally:
            path.unlink(missing_ok=True)
        return {'status': 'PUBLISHED', 'generation': entry['generation'], 'copied_files': copied, 'linked_files': linked, 'snapshot_hash': snapshot['snapshot_hash']}


def _sync_directory(path):
    fd=os.open(path,os.O_RDONLY)
    try:os.fsync(fd)
    finally:os.close(fd)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project-root', required=True, help='worker data directory, containing data/processed')
    parser.add_argument('--runtime-dir', default=str(ROOT / 'runtime'))
    parser.add_argument('--without-long-horizon', action='store_true')
    args = parser.parse_args()
    print(json.dumps(publish(args.project_root, args.runtime_dir, not args.without_long_horizon), ensure_ascii=False))


if __name__ == '__main__':
    main()
