#!/usr/bin/env python3
"""构建源码+必需资产+已构建前端的部署包，明确排除secret/cache/raw全集。"""
import argparse
import json
import subprocess
import tarfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def bundle_paths(root, tracked, manifest):
    """Resolve either manifest schema without depending on external source paths."""
    paths = set(p for p in tracked if p)
    for asset in manifest['assets']:
        if not asset.get('required', True):
            continue
        destination = asset.get('path') or asset.get('destination')
        if not destination:
            raise RuntimeError('Missing runtime destination')
        target = (root / destination).resolve()
        if not target.is_relative_to(root.resolve()):
            raise RuntimeError('Runtime destination escapes product: ' + destination)
        if not target.exists():
            raise RuntimeError('Missing runtime asset: ' + destination)
        files = [target] if target.is_file() else sorted(target.rglob('*'))
        paths.update(p.relative_to(root).as_posix() for p in files if p.is_file())
    paths.update(p.relative_to(root).as_posix() for p in (root / 'frontend/dist').rglob('*') if p.is_file())
    paths = {p for p in paths if '__pycache__' not in Path(p).parts and not p.endswith(('.pyc', '.pyo'))}
    for path in paths:
        resolved = (root / path).resolve()
        if not resolved.is_relative_to(root.resolve()) or not resolved.is_file():
            raise RuntimeError('Invalid bundle file: ' + path)
        if Path(path).name == '.env' or 'node_modules' in Path(path).parts or path.startswith('llm/artifacts/'):
            raise RuntimeError('Forbidden file in bundle: ' + path)
    return sorted(paths)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--label", default="rc3", help="发布标签，用于输出目录与包名，如 rc3")
    parser.add_argument("--output-dir", type=Path, help="显式指定归档目录")
    args = parser.parse_args()
    label = args.label.strip() or "rc3"
    out_dir = args.output_dir or ROOT / f"output/{label}"
    out_dir.mkdir(parents=True, exist_ok=True)
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    manifest = json.loads((ROOT / 'runtime/manifest.json').read_text())
    paths = bundle_paths(ROOT, tracked, manifest)
    out = out_dir / f'agriscope-{label}-deploy.tar.gz'
    with tarfile.open(out, 'w:gz') as tf:
        for p in sorted(paths):
            tf.add(ROOT / p, arcname=p, recursive=False)
    print(json.dumps({'bundle': str(out), 'files': len(paths), 'bytes': out.stat().st_size}))


if __name__ == '__main__':
    main()
