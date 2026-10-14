"""Shared immutable Daily publication contract. No writes, model loads or pipeline execution."""
from __future__ import annotations
import hashlib
import json
from functools import lru_cache
from pathlib import Path

EXTENDED_FILES = (
    'datasets/decision_dataset_沈阳.parquet', 'datasets/decision_dataset_朝阳.parquet',
    *('model_ready/shenyang_core/' + n + '.parquet' for n in ['market_daily', 'environment_daily', 'crop_context', 'cost_reference', 'phenology']),
    *('model_ready/' + city + '/' + n + '.parquet' for city in ['chaoyang_extended', 'jinzhou_extended'] for n in ['market_daily', 'environment_daily', 'phenology']),
    *('model_ready/climate/' + n + '.parquet' for n in ['climate_daily', 'vegetation_anomaly']),
    *('model_ready/profit/' + n + '.parquet' for n in ['crop_cost', 'cost_components', 'cost_proxy']),
    *('model_ready/recommendation/' + n + '.parquet' for n in ['market_nodes', 'structural_context']),
    'model_ready/hri/hri_inputs.parquet', 'model_ready/FEATURE_SOURCE_MAP.csv', '.source_fingerprint.json',
)
REQUIRED = {'daily/latest.json', *('extended_snapshot/' + n for n in EXTENDED_FILES)}
ALLOWED = REQUIRED | {'daily/monitor.json', 'long_horizon/latest.json'}
PREFIX = 'data/processed/daily/publications/'


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def generation_id(files):
    return hashlib.sha256(json.dumps(files, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:24]


@lru_cache(maxsize=8)
def _verified(root, relative, encoded_files):
    base = Path(root).resolve()
    directory = base / relative
    if directory.is_symlink() or not directory.is_dir() or not directory.resolve().is_relative_to(base):
        raise ValueError('publication directory unavailable')
    files = json.loads(encoded_files)
    for name, sha in files.items():
        p = directory / name
        if not p.resolve().is_relative_to(directory.resolve()) or p.is_symlink() or digest(p) != sha:
            raise ValueError('publication integrity mismatch')
    return directory


def resolve(runtime_dir):
    """Return the whole generation from one manifest read; legacy packages have no pointer."""
    runtime = Path(runtime_dir)
    manifest = runtime / 'manifest.json'
    if not manifest.exists():
        return None
    obj = json.loads(manifest.read_text(encoding='utf-8'))
    entry = obj.get('daily_publication')
    if entry is None:
        return None
    return validate_entry(runtime, entry)


def validate_entry(runtime, entry):
    runtime = Path(runtime)
    if not isinstance(entry, dict):
        raise ValueError('invalid Daily publication pointer')
    files = entry.get('files')
    relative = entry.get('generation')
    if entry.get('schema_version') != 1 or not isinstance(files, dict) or not REQUIRED <= set(files) <= ALLOWED:
        raise ValueError('invalid publication file contract')
    if any(not isinstance(sha, str) or len(sha) != 64 or any(c not in '0123456789abcdef' for c in sha) for sha in files.values()):
        raise ValueError('invalid publication digest')
    if relative != PREFIX + generation_id(files):
        raise ValueError('invalid generation identity')
    directory = _verified(str(runtime.resolve()), relative, json.dumps(files, sort_keys=True, ensure_ascii=False))
    return dict(entry, directory=directory)
