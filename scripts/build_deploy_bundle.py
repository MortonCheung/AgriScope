#!/usr/bin/env python3
"""构建源码+必需资产+已构建前端的部署包，明确排除secret/cache/raw全集。"""
import argparse
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from verify_assets import _plain_path, publication_files, presentation_files, runtime_base_digest, verify


def forbidden_file(path):
    parts = Path(path).parts
    name = Path(path).name
    return (name == '.env' or name.startswith('.env.') and not name.endswith('.example')
            or name in {'id_rsa', 'id_ed25519'} or Path(path).suffix.lower() in {'.pem', '.key', '.p12', '.pfx'}
            or any(part in {'.git', '.ssh', '.venv', 'node_modules'} for part in parts)
            or path.startswith('llm/artifacts/'))

def bundle_paths(root, tracked, manifest):
    """Resolve either manifest schema without depending on external source paths."""
    root = Path(root).resolve()
    problems = verify(manifest, root)['problems']
    if problems:
        raise RuntimeError('Runtime assets invalid: ' + '; '.join(problems))
    paths = set(p for p in tracked if p and p != 'deployment-manifest.json')
    current_publication_files = set(publication_files(manifest, root))
    current_publication_files.update(presentation_files(root))
    paths.update(current_publication_files)
    for asset in manifest['assets']:
        if not asset.get('required', True):
            continue
        destination = asset.get('path') or asset.get('destination')
        if not destination:
            raise RuntimeError('Missing runtime destination')
        target = _plain_path(root, destination)
        if not target.exists():
            raise RuntimeError('Missing runtime asset: ' + destination)
        files = [target] if target.is_file() else sorted(target.rglob('*'))
        paths.update(p.relative_to(root).as_posix() for p in files if p.is_file())
    index = _plain_path(root, 'frontend/dist/index.html')
    if not index.is_file() or not index.stat().st_size:
        raise RuntimeError('Missing built frontend/dist/index.html')
    paths.update(p.relative_to(root).as_posix() for p in (root / 'frontend/dist').rglob('*') if p.is_file())
    paths = {p for p in paths if '__pycache__' not in Path(p).parts and not p.endswith(('.pyc', '.pyo'))}
    generation_roots = ('runtime/data/processed/daily/publications/', 'runtime/data/market/publications/', 'runtime/publication_history/', 'runtime/data/market/presentation/')
    paths = {p for p in paths if not p.startswith(generation_roots) or p in current_publication_files}
    for path in paths:
        try:
            resolved = _plain_path(root, path)
        except (TypeError, ValueError) as exc:
            raise RuntimeError('Invalid bundle file: ' + path) from exc
        if not resolved.is_file():
            raise RuntimeError('Invalid bundle file: ' + path)
        if forbidden_file(path):
            raise RuntimeError('Forbidden file in bundle: ' + path)
    return sorted(paths)


def build_bundle(root, paths, output, *, source=None, manifest=None):
    """Hash and pack selected bytes; a failed build never replaces a valid release."""
    root, output = Path(root).resolve(), Path(output)
    if manifest is not None and json.loads((root / 'runtime/manifest.json').read_text()) != manifest:
        raise RuntimeError('Runtime manifest changed before packaging')
    identities = {}
    for relative in paths:
        path = _plain_path(root, relative)
        if forbidden_file(relative):
            raise RuntimeError('Forbidden file in bundle: ' + relative)
        data = path.read_bytes()
        identities[relative] = {'sha256': hashlib.sha256(data).hexdigest(), 'size': len(data)}
    metadata = {'schema_version': 1, 'source': source or {}, 'files': identities,
                'runtime_manifest_sha256': identities.get('runtime/manifest.json', {}).get('sha256'),
                'runtime_base_manifest_sha256': runtime_base_digest(manifest) if manifest is not None else None,
                'publications': {name: (manifest or {}).get(name) for name in ('daily_publication', 'market_publication') if (manifest or {}).get(name)}}
    output.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.' + output.name + '.', suffix='.tmp', dir=output.parent)
    os.close(fd)
    try:
        with tarfile.open(temporary, 'w:gz') as archive:
            for relative in paths:
                path = _plain_path(root, relative)
                data = path.read_bytes()
                if hashlib.sha256(data).hexdigest() != identities[relative]['sha256']:
                    raise RuntimeError('Source changed while packaging: ' + relative)
                info = archive.gettarinfo(str(path), arcname=relative)
                info.uid = info.gid = 0
                info.uname = info.gname = ''
                archive.addfile(info, io.BytesIO(data))
            data = json.dumps(metadata, ensure_ascii=False, sort_keys=True, indent=2).encode()
            info = tarfile.TarInfo('deployment-manifest.json')
            info.mode, info.size = 0o644, len(data)
            archive.addfile(info, io.BytesIO(data))
        with open(temporary, 'rb') as handle:
            os.fsync(handle.fileno())
        os.replace(temporary, output)
        directory_fd = os.open(output.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        Path(temporary).unlink(missing_ok=True)
    return metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--label", default="release", help="发布标签，只允许字母、数字、点、下划线与短横线")
    parser.add_argument("--output-dir", type=Path, help="显式指定归档目录")
    parser.add_argument("--allow-dirty", action='store_true', help="显式打包未提交工作区，并在部署清单记录该状态")
    args = parser.parse_args()
    label = args.label.strip()
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', label) or label in {'.', '..'}:
        parser.error('Invalid release label')
    dirty = bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT).strip())
    if dirty and not args.allow_dirty:
        parser.error('Commit product changes before creating a deployment release')
    out_dir = args.output_dir or ROOT.parent / 'archive' / 'build_artifacts' / 'deployment' / label
    out_dir.mkdir(parents=True, exist_ok=True)
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    manifest = json.loads((ROOT / 'runtime/manifest.json').read_text())
    paths = bundle_paths(ROOT, tracked, manifest)
    out = out_dir / f'agriscope-{label}-deploy.tar.gz'
    source = {'commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip(), 'dirty': dirty}
    build_bundle(ROOT, paths, out, source=source, manifest=manifest)
    print(json.dumps({'bundle': str(out), 'files': len(paths) + 1, 'bytes': out.stat().st_size,
                      'sha256': hashlib.sha256(out.read_bytes()).hexdigest(), 'source': source}))


if __name__ == '__main__':
    main()
