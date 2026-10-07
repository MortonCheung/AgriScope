#!/usr/bin/env python3
"""发布时显式冻结资产；日常验证/refresh 不得调用此命令。"""
import json
import sys
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
sys.path.insert(0, str(Path(__file__).resolve().parent))
from verify_assets import ROOT, MANIFEST, sha256
from check_final_freeze import check_final_freeze


def main():
    check_final_freeze()
    prior = json.loads(MANIFEST.read_text())
    meta = json.loads((ROOT / 'models/reports/final/FINAL_RUN_META.json').read_text())
    if prior['code_fingerprint'] != meta['code_fingerprint']:
        raise RuntimeError('Frozen Final fingerprint changed')
    existing = {a['path']: a for a in prior['assets']}
    regression = json.loads((ROOT / 'runtime/legacy_regression_assets.json').read_text())
    for asset in regression['files']:
        existing.setdefault(asset['path'], {**asset, 'required': True})
    # 恢复已有 Daily 原始响应，确保部署包可离线重建；未来采集另按日期追加。
    for path in (ROOT / 'data/raw/daily').rglob('*'):
        if path.is_file():
            existing.setdefault(path.relative_to(ROOT).as_posix(), {'required': True})
    for group in ['models/models/long_horizon_v2', 'models/src', 'backend/app', 'models/long_horizon', 'llm',
                  'data/daily', 'data/long_horizon', 'deploy', 'scripts', 'frontend/dist']:
        for path in (ROOT / group).rglob('*'):
            rel = path.relative_to(ROOT).as_posix()
            if not path.is_file() or '__pycache__' in rel or '/artifacts/' in rel or '/reports/' in rel:
                continue
            if group == 'frontend/dist' or path.suffix in ('.py', '.pkl', '.json', '.yaml', '.md', '.service', '.timer', '.path', '.sh', '.js', '.css', '.html'):
                existing.setdefault(rel, {'path': rel, 'required': True})
    for path in (ROOT / 'models/long_horizon/artifacts/v2').glob('*'):
        if path.is_file() and path.suffix in ('.json', '.parquet', '.csv'):
            rel = path.relative_to(ROOT).as_posix()
            existing.setdefault(rel, {'path': rel, 'required': True})
    for name in ['LONG_HORIZON_V2_REGISTRY.csv', 'LONG_HORIZON_SAMPLE_ACCOUNTING.csv',
                 'backend/openapi.json', 'backend/requirements.txt', 'frontend/package.json', 'frontend/package-lock.json', 'runtime/final_frozen_baseline.json', 'runtime/legacy_regression_assets.json',
                 'scripts/run_daily_chain.py', 'scripts/smoke_rc2.py',
                 'data/processed/long_horizon/snapshots/latest.json',
                 'models/long_horizon/artifacts/v2_protocol.json',
                 'models/long_horizon/artifacts/v2_target_selection.json']:
        if (ROOT / name).is_file():
            existing.setdefault(name, {'path': name, 'required': True})
    assets = []
    for rel, old in sorted(existing.items()):
        path = ROOT / rel
        kind = 'generated' if rel.startswith('data/processed/') else 'immutable'
        if rel.startswith('data/raw/daily/'):
            kind = 'external'
        if rel.endswith(('.pkl', '.joblib')) or 'REGISTRY' in Path(rel).name:
            kind = 'immutable'
        if kind == 'immutable' and old.get('sha256') and rel.startswith(('models/models/final/', 'models/data/', 'data/model_ready/')):
            if sha256(path) != old['sha256']:
                raise RuntimeError('Existing frozen canonical asset drift: ' + rel)
        assets.append({'path': rel, 'destination': str(Path(rel).parent) + '/',
                       'asset_type': kind, 'required': old.get('required', True),
                       'sha256': sha256(path), 'size': path.stat().st_size,
                       'model_version': 'long_horizon_v2' if 'long_horizon_v2' in rel else prior['model_version']})
    prior.update(schema='agriscope.runtime-manifest/2', assets=assets, n_assets=len(assets),
                 total_bytes=sum(a['size'] for a in assets),
                 release_frozen_at=datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(timespec='seconds'),
                 asset_types={kind: sum(a['asset_type'] == kind for a in assets)
                              for kind in ['immutable', 'generated', 'external', 'optional']})
    MANIFEST.write_text(json.dumps(prior, ensure_ascii=False, indent=2) + '\n')
    print('FROZEN', len(assets), 'assets')


if __name__ == '__main__':
    main()
