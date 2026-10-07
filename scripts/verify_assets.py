#!/usr/bin/env python3
"""按显式资产类型校验；--refresh 只能更新 generated，不能放宽模型/Registry/schema/prompt/代码。"""
from __future__ import annotations
import hashlib
import json
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'runtime/manifest.json'
TYPES = {'immutable', 'generated', 'external', 'optional'}


def sha256(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def verify(man, root=ROOT, refresh=False):
    problems, drift, optional_missing, updated = [], [], [], []
    assets = man.get('assets', [])
    if man.get('n_assets') != len(assets):
        problems.append('n_assets does not match actual entries')
    seen, ok = set(), 0
    for asset in assets:
        rel, kind = asset.get('path', ''), asset.get('asset_type')
        p = (root / rel).resolve()
        if not rel or rel in seen or not p.is_relative_to(root.resolve()):
            problems.append(f'invalid/duplicate asset path: {rel}')
            continue
        seen.add(rel)
        if kind not in TYPES:
            problems.append(f'unknown/missing asset_type: {rel}')
            continue
        # 关键资产不因存放在 processed 下而失去强校验。
        protected = (rel.endswith(('.pkl', '.joblib', '.py', '.js', '.ts', '.tsx', '.sh')) or 'REGISTRY' in Path(rel).name or
                     '/prompts/' in rel or '/schemas/' in rel or
                     rel.startswith(('backend/app/', 'models/long_horizon/', 'llm/')))
        if protected and kind != 'immutable':
            problems.append(f'protected asset must be immutable: {rel}')
            continue
        if not p.is_file():
            (problems if asset.get('required', kind != 'optional') else optional_missing).append(f'missing: {rel}')
            continue
        size, actual_hash = p.stat().st_size, sha256(p)
        if actual_hash == asset.get('sha256') and size == asset.get('size'):
            ok += 1
        elif kind == 'generated':
            drift.append(rel)
            if refresh:
                asset.update(size=size, sha256=actual_hash)
                updated.append(rel)
        else:
            problems.append(f'hash/size mismatch: {rel}')
    return {'ok': ok, 'total': len(assets), 'problems': problems, 'generated_drift': drift,
            'optional_missing': optional_missing, 'refreshed': updated}


def main(argv=None):
    refresh = '--refresh' in (sys.argv[1:] if argv is None else argv)
    man = json.loads(MANIFEST.read_text())
    result = verify(man, refresh=refresh)
    if refresh and result['refreshed'] and not result['problems']:
        man['refreshed_at'] = datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(timespec='seconds')
        man['refresh_note'] = 'Only explicitly generated assets refreshed; immutable hashes unchanged.'
        man['total_bytes'] = sum(a['size'] for a in man['assets'])
        MANIFEST.write_text(json.dumps(man, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False))
    print('ASSETS_VERIFY_FAILED' if result['problems'] else 'ASSETS_VERIFY_OK')
    return 1 if result['problems'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
