#!/usr/bin/env python3
"""运行时资产清单校验（适配 publishing 生成的新 manifest 结构）。

manifest 由 `AgriScope/pipelines/publishing/publish_runtime.py` 生成，结构：
    {"generated_at", "publisher", "note", "assets": [{"source","destination","description","status"}]}
本脚本校验：每个 asset 的 status 为**成功态**且 destination 在 AgriScope 内实际存在且非空。

成功态词表（与 publishing 的返回值一致）：
    `OK`                        —— copy_item 直接复制成功
    `PUBLISHED(<asset_type>)`   —— 由另一条发布脚本（如 publish_research.py）落地的产品件
失败态（`SKIP(...)` 等）一律计为问题。
不写入、不改动任何资产（--refresh 仅保留兼容参数位，当前无副作用）。
"""
from __future__ import annotations
import json
import sys
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'runtime/manifest.json'
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
OPERATIONAL_MANIFEST_FIELDS = {'daily_publication', 'market_publication', 'publication_rollbacks'}
PRESENTATION_DYNAMIC_FILES = {'runtime/data/market/presentation/latest.json', 'runtime/data/market/presentation/current.json'}

# 成功态前缀；SKIP(missing-src) 等不在其中，仍然会失败。
OK_STATUS_PREFIXES = ('OK', 'PUBLISHED')


def _is_ok_status(status) -> bool:
    return isinstance(status, str) and (status == 'OK' or status == 'PUBLISHED' or status.startswith('PUBLISHED(') and status.endswith(')'))


def _nonempty(p: Path) -> bool:
    if p.is_file():
        return p.stat().st_size > 0
    if p.is_dir():
        return any(child.is_file() and child.stat().st_size > 0 for child in p.rglob('*'))
    return False


def _plain_path(root: Path, relative: str) -> Path:
    path = Path(relative)
    if path.is_absolute() or '..' in path.parts or not path.parts:
        raise ValueError('invalid relative path')
    base = root.resolve()
    target = base / path
    if not target.resolve().is_relative_to(base):
        raise ValueError('path escapes product')
    for candidate in (target, *target.parents):
        if candidate == base:
            break
        if candidate.is_symlink():
            raise ValueError('symlink in product asset')
    return target


def runtime_base_digest(man):
    if not isinstance(man, dict):
        raise ValueError('runtime manifest must be an object')
    base = {key: value for key, value in man.items() if key not in OPERATIONAL_MANIFEST_FIELDS}
    return hashlib.sha256(json.dumps(base, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def verify_deployment(man, root=ROOT):
    """An extracted release carries exact file identities independent of old runtime schemas."""
    problems = []
    files = man.get('files')
    if man.get('schema_version') != 1 or not isinstance(files, dict) or not files:
        return ['invalid deployment file manifest']
    try:
        current_presentation = set(presentation_files(root))
    except (OSError, ValueError, TypeError, KeyError):
        current_presentation = set()
        problems.append('continuous presentation publication invalid')
    for relative, identity in files.items():
        try:
            target = _plain_path(Path(root), relative)
            if not isinstance(identity, dict) or not target.is_file():
                raise ValueError('missing file identity')
            data = target.read_bytes()
            if relative in PRESENTATION_DYNAMIC_FILES and current_presentation:
                # Daily may replace the operational quote release; verify the
                # current receipt and immutable anchors instead of old bytes.
                continue
            if relative == 'runtime/manifest.json' and man.get('runtime_base_manifest_sha256'):
                current = json.loads(data)
                if runtime_base_digest(current) != man['runtime_base_manifest_sha256']:
                    raise ValueError('runtime base identity mismatch')
                publication_files(current, root)
                continue
            if identity.get('size') != len(data) or identity.get('sha256') != hashlib.sha256(data).hexdigest():
                raise ValueError('file identity mismatch')
        except (OSError, ValueError, TypeError):
            problems.append(f'deployment file invalid: {relative}')
    if man.get('runtime_base_manifest_sha256') and 'runtime/manifest.json' not in files:
        problems.append('deployment manifest omits runtime identity')
    return problems


def presentation_generation_files(runtime, receipt):
    """Verify a receipt and its immutable payload/anchor before publish or rollback."""
    runtime = Path(runtime).resolve()
    if not isinstance(receipt, dict):
        raise ValueError('invalid presentation receipt')
    expected_release = receipt.get('sha256')
    if not isinstance(expected_release, str) or len(expected_release) != 64 or any(c not in '0123456789abcdef' for c in expected_release):
        raise ValueError('invalid presentation generation digest')
    if receipt.get('path') not in {'data/market/presentation/latest.json', 'data/market/presentation/releases/' + expected_release + '.json'}:
        raise ValueError('invalid presentation generation path')
    generation = _plain_path(runtime, receipt['path'])
    if (receipt.get('schema_version') != 'presentation-release-1'
            or expected_release != hashlib.sha256(generation.read_bytes()).hexdigest()):
        raise ValueError('continuous presentation receipt mismatch')
    from backend.app.services.market_presentation_service import validate
    payload = validate(json.loads(generation.read_text(encoding='utf-8')))
    anchor = receipt.get('anchor_asset')
    if not isinstance(anchor, dict) or anchor != payload.get('provenance', {}).get('anchor_asset'):
        raise ValueError('continuous presentation omits selected anchors')
    expected = anchor.get('sha256')
    if not isinstance(expected, str) or len(expected) != 64 or any(c not in '0123456789abcdef' for c in expected):
        raise ValueError('invalid selected anchor digest')
    if anchor.get('path') != 'data/market/presentation/inputs/' + expected + '.json':
        raise ValueError('invalid selected anchor path')
    anchor_path = _plain_path(runtime, anchor['path'])
    if hashlib.sha256(anchor_path.read_bytes()).hexdigest() != expected:
        raise ValueError('selected anchor digest mismatch')
    return generation, anchor_path


def presentation_files(root=ROOT, *, require_current_alias=False):
    """Select the verified current generation and its public compatibility export."""
    root = Path(root).resolve()
    latest = _plain_path(root, 'runtime/data/market/presentation/latest.json')
    receipt_path = _plain_path(root, 'runtime/data/market/presentation/current.json')
    if not latest.exists() and not receipt_path.exists():
        return []  # Backwards compatible releases do not require this feature.
    receipt = json.loads(receipt_path.read_text(encoding='utf-8'))
    generation, anchor_path = presentation_generation_files(root / 'runtime', receipt)
    selected = [generation, receipt_path, anchor_path]
    if latest.exists():
        from backend.app.services.market_presentation_service import validate
        validate(json.loads(latest.read_text(encoding='utf-8')))
        selected.append(latest)
    # Publication may leave the alias at the previous valid generation after an
    # interrupted export. Serving current.json remains safe, but a new package
    # must carry an alias matching the generation it actually ships.
    if require_current_alias and (not latest.is_file() or latest.read_bytes() != generation.read_bytes()):
        raise ValueError('presentation compatibility export is missing or stale; republish before packaging')
    return sorted(p.relative_to(root).as_posix() for p in selected)


def publication_files(man, root=ROOT):
    """Validate and select current immutable generations, never their research source tree."""
    selected = []
    runtime = Path(root) / 'runtime'
    for name in ('daily_publication', 'market_publication'):
        entry = man.get(name)
        if entry is None:
            continue
        if name == 'daily_publication':
            from agriscope_daily_publication import resolve
        else:
            from agriscope_market_publication import resolve
        verified = resolve(runtime)
        if not verified or {key: value for key, value in verified.items() if key != 'directory'} != entry:
            raise ValueError('publication changed during verification')
        directory = _plain_path(runtime, verified['generation'])
        if not directory.is_dir():
            raise ValueError('missing ' + name + ' generation')
        for relative, expected in entry['files'].items():
            path = _plain_path(directory, relative)
            if not isinstance(expected, str) or not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
                raise ValueError('digest mismatch in ' + name)
            selected.append(path.relative_to(Path(root).resolve()).as_posix())
        receipt = runtime / 'publication_history' / name / (Path(entry['generation']).name + '.json')
        if receipt.exists():
            receipt = _plain_path(Path(root), receipt.relative_to(Path(root)).as_posix())
            if json.loads(receipt.read_text()) != entry:
                raise ValueError('publication receipt differs from current pointer')
            selected.append(receipt.relative_to(Path(root).resolve()).as_posix())
    return selected


def verify(man, root=ROOT, refresh=False):
    if not isinstance(man, dict):
        return {'ok': 0, 'total': 0, 'problems': ['runtime manifest must be an object']}
    problems, ok = [], 0
    assets = man.get('assets', [])
    if not isinstance(assets, list):
        return {'ok': 0, 'total': 0, 'problems': ['manifest assets must be a list']}
    if not assets:
        problems.append('manifest has no assets')
    seen = set()
    for asset in assets:
        if not isinstance(asset, dict):
            problems.append('manifest asset must be an object')
            continue
        dest = asset.get('destination') or asset.get('path', '')
        status = asset.get('status')
        if not dest or dest in seen:
            problems.append(f'invalid/duplicate destination: {dest}')
            continue
        seen.add(dest)
        try:
            p = _plain_path(Path(root), dest)
        except (ValueError, TypeError):
            problems.append(f'destination escapes AgriScope or uses symlink: {dest}')
            continue
        if not asset.get('required', True) and not p.exists():
            continue
        if not _is_ok_status(status) and not (status is None and 'path' in asset):
            problems.append(f'source unavailable -> {dest} (status={status!r}, source={asset.get("source")})')
            continue
        if not _nonempty(p):
            problems.append(f'missing/empty destination: {dest}')
            continue
        if p.is_dir() and any(child.is_symlink() for child in p.rglob('*')):
            problems.append(f'symlink in destination: {dest}')
            continue
        expected = asset.get('sha256')
        if expected is not None and (not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest() != expected):
            problems.append(f'asset digest mismatch: {dest}')
            continue
        ok += 1
    try:
        publication_files(man, root)
        presentation_files(root)
    except (OSError, ValueError, TypeError):
        problems.append('immutable publication invalid')
    return {'ok': ok, 'total': len(assets), 'problems': problems,
            'generated_at': man.get('generated_at'), 'publisher': man.get('publisher')}


def main(argv=None):
    refresh = '--refresh' in (sys.argv[1:] if argv is None else argv)
    man = json.loads(MANIFEST.read_text())
    result = verify(man, refresh=refresh)
    release_manifest = ROOT / 'deployment-manifest.json'
    if release_manifest.is_file():
        try:
            result['problems'].extend(verify_deployment(json.loads(release_manifest.read_text()), ROOT))
        except (OSError, ValueError, TypeError):
            result['problems'].append('deployment manifest unreadable')
    print(json.dumps(result, ensure_ascii=False))
    print('ASSETS_VERIFY_FAILED' if result['problems'] else 'ASSETS_VERIFY_OK')
    return 1 if result['problems'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
