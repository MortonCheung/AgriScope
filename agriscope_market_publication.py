"""Read-only market generation resolution; no source adapters or data mutation."""
from __future__ import annotations
import json
from pathlib import Path
from agriscope_daily_publication import digest, generation_id

PREFIX = 'data/market/publications/'
FILES = {'display.json', 'lineage.json'}


def validate_entry(runtime, entry):
    root = Path(runtime).resolve()
    files = entry.get('files') if isinstance(entry, dict) else None
    if (not isinstance(files, dict) or set(files) != FILES or entry.get('schema_version') != 1
            or any(not isinstance(v, str) or len(v) != 64 or any(c not in '0123456789abcdef' for c in v) for v in files.values())
            or entry.get('generation') != PREFIX + generation_id(files)):
        raise ValueError('invalid market publication pointer')
    directory = root / entry['generation']
    if directory.is_symlink() or not directory.is_dir() or not directory.resolve().is_relative_to(root):
        raise ValueError('invalid market publication directory')
    for name, sha in files.items():
        path = directory / name
        if path.is_symlink() or not path.resolve().is_relative_to(directory.resolve()) or digest(path) != sha:
            raise ValueError('market publication integrity mismatch')
    from backend.app.services.market_display_service import validate_display
    data = validate_display(json.loads((directory / 'display.json').read_text()))
    if data['schema_version'] not in ('2', '3'):
        raise ValueError('production market generation requires local observations')
    lineage = json.loads((directory / 'lineage.json').read_text())
    if lineage.get('display_sha256') != files['display.json']:
        raise ValueError('market lineage differs from display')
    evidence = lineage.get('records')
    if not isinstance(evidence, list) or len(evidence) != len(data['records']):
        raise ValueError('market lineage record contract mismatch')
    by_key = {(r.get('region'), r.get('product'), r.get('price_level')): r for r in evidence if isinstance(r, dict)}
    if len(by_key) != len(evidence): raise ValueError('duplicate market lineage')
    for row in data['records']:
        item = by_key.get((row['region'], row['product'], row['price_level']), {})
        adopted = item.get('adopted', {})
        if not isinstance(adopted, dict): raise ValueError('invalid adopted market evidence')
        if (item.get('tier') != 1 or any(adopted.get(k) != row[k] for k in ('region', 'product', 'price_level', 'observation_date', 'collectedAt'))
                or adopted.get('price_per_kg') != row['price']):
            raise ValueError('market lineage must prove a local same-level observation')
    return dict(entry, directory=directory)


def resolve(runtime):
    root = Path(runtime)
    manifest = root / 'manifest.json'
    if not manifest.exists(): return None
    obj = json.loads(manifest.read_text())
    entry = obj.get('market_publication')
    return None if entry is None else validate_entry(root, entry)
