#!/usr/bin/env python3
"""构建源码+必需资产+已构建前端的部署包，明确排除secret/cache/raw全集。"""
import json
import subprocess
import tarfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/rc2'


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    manifest = json.loads((ROOT / 'runtime/manifest.json').read_text())
    paths = set(p for p in tracked if p)
    paths.update(a['path'] for a in manifest['assets'] if a.get('required', True))
    paths.update(p.relative_to(ROOT).as_posix() for p in (ROOT / 'frontend/dist').rglob('*') if p.is_file())
    forbidden = [p for p in paths if Path(p).name == '.env' or any(x in p for x in ['node_modules/', 'llm/artifacts/'])]
    if forbidden:
        raise RuntimeError('Forbidden files in bundle: ' + str(forbidden))
    missing = [p for p in paths if not (ROOT / p).is_file()]
    if missing:
        raise RuntimeError('Missing bundle files: ' + str(missing[:10]))
    out = OUT / 'agriscope-rc2-deploy.tar.gz'
    with tarfile.open(out, 'w:gz') as tf:
        for p in sorted(paths):
            tf.add(ROOT / p, arcname=p, recursive=False)
    print(json.dumps({'bundle': str(out), 'files': len(paths), 'bytes': out.stat().st_size}))


if __name__ == '__main__':
    main()
