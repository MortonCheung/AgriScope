#!/usr/bin/env python3
"""Verify an immutable data generation and atomically roll its pointer back; no models change."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from agriscope_publication import atomic_bytes, publication_lock, retain_entry


def rollback(runtime, kind, identity):
    if kind not in ('daily', 'market') or not re.fullmatch('[0-9a-f]{24}', identity):
        raise ValueError('explicit kind and 24-character generation identity required')
    root = Path(runtime).resolve()
    field = kind + '_publication'
    receipt = root / 'publication_history' / field / (identity + '.json')
    if receipt.is_symlink() or not receipt.resolve().is_relative_to(root):
        raise ValueError('invalid publication receipt path')
    with publication_lock(root):
        manifest = root / 'manifest.json'
        if manifest.is_symlink(): raise ValueError('manifest cannot be a symlink')
        original = json.loads(manifest.read_text())
        entry = json.loads(receipt.read_text())
        if kind == 'daily':
            from agriscope_daily_publication import validate_entry, _verified
            _verified.cache_clear()
        else:
            from agriscope_market_publication import validate_entry
        validate_entry(root, entry)
        old = original.get(field)
        if old and old['generation'] == entry['generation']:
            return {'status': 'UNCHANGED', 'generation': entry['generation']}
        if old:
            validate_entry(root, old)
            retain_entry(root, field, old)
        original[field] = entry
        # Append an audit event inside the same manifest transaction; frozen base remains unchanged.
        original.setdefault('publication_rollbacks', []).append(dict(kind=kind,
            previous_generation=old.get('generation') if old else None, generation=entry['generation'],
            applied_at=datetime.now(timezone.utc).isoformat()))
        original['publication_rollbacks'] = original['publication_rollbacks'][-100:]
        atomic_bytes(manifest, json.dumps(original, ensure_ascii=False, indent=2).encode())
        return {'status': 'ROLLED_BACK', 'generation': entry['generation'], 'previous_generation': old.get('generation') if old else None}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime-dir', type=Path, default=ROOT / 'runtime')
    parser.add_argument('--kind', required=True, choices=['daily', 'market'])
    parser.add_argument('--generation', required=True, help='24 hex characters from publication status/history')
    args = parser.parse_args(argv)
    try:
        print(json.dumps(rollback(args.runtime_dir, args.kind, args.generation), ensure_ascii=False))
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print('Publication rollback refused: ' + type(exc).__name__, file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__': raise SystemExit(main())
