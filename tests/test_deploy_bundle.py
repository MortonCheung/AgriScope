"""The release must include the published runtime, never its external source tree."""
import importlib.util
import json
import shutil
import tarfile
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location('build_deploy_bundle', Path(__file__).resolve().parents[1] / 'scripts/build_deploy_bundle.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def write(root, path):
    target = root / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text('fixture')


def test_current_directory_manifest_includes_research_and_published_llm_evidence(tmp_path):
    for name in ['frontend/dist/index.html', 'runtime/research/research_catalog.json', 'runtime/research/product/tieling/A07.json', 'runtime/research/__pycache__/cache.pyc', 'runtime/llm/artifacts/v2/outcome_labels.json', 'backend/app/main.py']:
        write(tmp_path, name)
    manifest = {'assets': [{'destination': 'runtime/research', 'source': '../data/research', 'status': 'OK'}, {'destination': 'runtime/llm/artifacts/v2/outcome_labels.json', 'status': 'OK'}]}
    paths = module.bundle_paths(tmp_path, ['backend/app/main.py'], manifest)
    assert 'runtime/research/product/tieling/A07.json' in paths
    assert 'runtime/llm/artifacts/v2/outcome_labels.json' in paths
    assert 'frontend/dist/index.html' in paths
    assert not any('__pycache__' in path for path in paths)


def test_legacy_file_manifest_and_optional_missing_assets(tmp_path):
    write(tmp_path, 'runtime/model.pkl')
    write(tmp_path, 'frontend/dist/index.html')
    assert module.bundle_paths(tmp_path, [], {'assets': [{'path': 'runtime/model.pkl'}, {'path': 'missing', 'required': False}]}) == ['frontend/dist/index.html', 'runtime/model.pkl']


@pytest.mark.parametrize('destination', ['../outside', '.env', 'runtime/missing'])
def test_invalid_destinations_fail_instead_of_producing_an_incomplete_bundle(tmp_path, destination):
    write(tmp_path, '.env')
    with pytest.raises(RuntimeError):
        module.bundle_paths(tmp_path, [], {'assets': [{'destination': destination}]})


@pytest.mark.parametrize('defect', ['missing_dist', 'empty_dist', 'empty_asset', 'failed_asset'])
def test_incomplete_release_is_refused(tmp_path, defect):
    write(tmp_path, 'runtime/model.pkl')
    write(tmp_path, 'frontend/dist/index.html')
    manifest = {'assets': [{'path': 'runtime/model.pkl', 'status': 'OK'}]}
    if defect == 'missing_dist': (tmp_path / 'frontend/dist/index.html').unlink()
    if defect == 'empty_dist': (tmp_path / 'frontend/dist/index.html').write_bytes(b'')
    if defect == 'empty_asset': (tmp_path / 'runtime/model.pkl').write_bytes(b'')
    if defect == 'failed_asset': manifest['assets'][0]['status'] = 'SKIP(missing-src)'
    with pytest.raises(RuntimeError): module.bundle_paths(tmp_path, [], manifest)


@pytest.mark.parametrize('path', ['.env', 'backend/.env.production', 'private.pem', '.ssh/id_ed25519', 'node_modules/secret.json'])
def test_private_files_are_never_packed(tmp_path, path):
    write(tmp_path, 'runtime/model.pkl'); write(tmp_path, 'frontend/dist/index.html'); write(tmp_path, path)
    with pytest.raises(RuntimeError, match='Forbidden'):
        module.bundle_paths(tmp_path, [path], {'assets': [{'path': 'runtime/model.pkl'}]})


@pytest.mark.parametrize('destination', ['runtime/link', 'runtime'])
def test_even_in_product_symlinks_cannot_escape_into_release(tmp_path, destination):
    write(tmp_path, 'internal/model.pkl'); write(tmp_path, 'frontend/dist/index.html')
    (tmp_path / 'runtime').mkdir(); (tmp_path / 'runtime/link').symlink_to(tmp_path / 'internal/model.pkl')
    with pytest.raises(RuntimeError): module.bundle_paths(tmp_path, [], {'assets': [{'path': destination}]})


def release_fixture(root):
    for name in ['backend/app/main.py', 'frontend/dist/index.html', 'runtime/models/frozen.bin']:
        write(root, name)
    manifest = {'generated_at': 'frozen', 'publisher': 'fixture', 'assets': [{'destination': 'runtime/models/frozen.bin', 'status': 'OK'}]}
    (root / 'runtime/manifest.json').write_text(json.dumps(manifest))
    return manifest


def test_bundle_byte_manifest_and_failed_build_keep_previous_release(tmp_path, monkeypatch):
    from verify_assets import verify_deployment
    manifest = release_fixture(tmp_path)
    tracked = ['backend/app/main.py', 'runtime/manifest.json']
    paths = module.bundle_paths(tmp_path, tracked, manifest)
    output = tmp_path / 'release.tar.gz'
    metadata = module.build_bundle(tmp_path, paths, output, source={'commit': 'fixture', 'dirty': False}, manifest=manifest)
    assert verify_deployment(metadata, tmp_path) == []
    with tarfile.open(output) as archive:
        assert 'deployment-manifest.json' in archive.getnames()
        assert json.load(archive.extractfile('deployment-manifest.json')) == metadata
        assert not any(member.issym() for member in archive)
    original = output.read_bytes()
    monkeypatch.setattr(tarfile.TarFile, 'addfile', lambda *args, **kwargs: (_ for _ in ()).throw(OSError('isolated disk failure')))
    with pytest.raises(OSError): module.build_bundle(tmp_path, paths, output, manifest=manifest)
    assert output.read_bytes() == original
    assert not list(tmp_path.glob('.release.tar.gz.*.tmp'))


def published_release(root):
    from pipelines.publishing.tests.test_observed_market import observed, audit
    from pipelines.publishing.publish_market_display import publish_generation
    manifest = release_fixture(root)
    first = publish_generation(root / 'runtime', observed(False), audit(observed(False)))
    manifest = json.loads((root / 'runtime/manifest.json').read_text())
    paths = module.bundle_paths(root, ['backend/app/main.py', 'runtime/manifest.json'], manifest)
    metadata = module.build_bundle(root, paths, root / 'release.tar.gz', manifest=manifest)
    return metadata, first


def test_normal_publication_and_verified_rollback_keep_release_base_valid(tmp_path):
    from verify_assets import verify, verify_deployment
    from pipelines.publishing.tests.test_observed_market import observed, audit
    from pipelines.publishing.publish_market_display import publish_generation
    from scripts.rollback_publication import rollback
    metadata, first = published_release(tmp_path)
    original_manifest_hash = metadata['runtime_manifest_sha256']
    publish_generation(tmp_path / 'runtime', observed(), audit(observed()))
    assert module.hashlib.sha256((tmp_path / 'runtime/manifest.json').read_bytes()).hexdigest() != original_manifest_hash
    assert verify_deployment(metadata, tmp_path) == []
    assert verify(json.loads((tmp_path / 'runtime/manifest.json').read_text()), tmp_path)['problems'] == []
    rollback(tmp_path / 'runtime', 'market', Path(first['generation']).name)
    assert verify_deployment(metadata, tmp_path) == []


def test_daily_worker_publish_does_not_invalidate_deployed_release_hashes(tmp_path):
    from verify_assets import verify_deployment
    from pipelines.publishing.tests.test_daily_runtime import package
    from pipelines.publishing.publish_daily_runtime import publish
    worker, runtime = package.__wrapped__(tmp_path)
    write(tmp_path, 'backend/app/main.py'); write(tmp_path, 'frontend/dist/index.html')
    manifest = {'generated_at': 'frozen', 'publisher': 'fixture', 'assets': [{'destination': 'runtime/models', 'status': 'OK'}]}
    (runtime / 'manifest.json').write_text(json.dumps(manifest))
    first = publish(worker, runtime, False)
    manifest = json.loads((runtime / 'manifest.json').read_text())
    paths = module.bundle_paths(tmp_path, ['backend/app/main.py', 'runtime/manifest.json'], manifest)
    metadata = module.build_bundle(tmp_path, paths, tmp_path / 'daily-release.tar.gz', manifest=manifest)
    monitor = worker / 'data/processed/daily/monitor/status.json'
    state = json.loads(monitor.read_text()); state['last_attempt_at'] = '2026-10-14 20:30:00'
    monitor.write_text(json.dumps(state))
    second = publish(worker, runtime, False)
    assert first['generation'] != second['generation']
    assert verify_deployment(metadata, tmp_path) == []


def test_correct_file_hashes_cannot_bypass_publication_generation_contract(tmp_path):
    from verify_assets import verify_deployment
    metadata, first = published_release(tmp_path)
    runtime = tmp_path / 'runtime'; manifest = json.loads((runtime / 'manifest.json').read_text())
    invalid = 'data/market/publications/invalid-identity'
    shutil.copytree(runtime / first['generation'], runtime / invalid)
    manifest['market_publication']['generation'] = invalid
    (runtime / 'manifest.json').write_text(json.dumps(manifest))
    assert verify_deployment(metadata, tmp_path) == ['deployment file invalid: runtime/manifest.json']


@pytest.mark.parametrize('field', ['assets', 'generated_at', 'publisher', 'unknown_schema'])
def test_only_defined_operational_manifest_fields_may_change(tmp_path, field):
    from verify_assets import verify_deployment
    metadata, _ = published_release(tmp_path)
    path = tmp_path / 'runtime/manifest.json'; manifest = json.loads(path.read_text())
    manifest[field] = [] if field == 'assets' else 'changed'
    path.write_text(json.dumps(manifest))
    assert verify_deployment(metadata, tmp_path) == ['deployment file invalid: runtime/manifest.json']


def test_new_unbundled_generation_still_requires_semantic_and_byte_integrity(tmp_path):
    from verify_assets import verify_deployment
    from pipelines.publishing.tests.test_observed_market import observed, audit
    from pipelines.publishing.publish_market_display import publish_generation
    metadata, _ = published_release(tmp_path)
    current = publish_generation(tmp_path / 'runtime', observed(), audit(observed()))
    display = tmp_path / 'runtime' / current['generation'] / 'display.json'
    display.chmod(0o600); display.write_bytes(b'corrupt')
    assert verify_deployment(metadata, tmp_path) == ['deployment file invalid: runtime/manifest.json']


def test_bundle_selects_only_current_generation_and_its_verified_receipt(tmp_path):
    from pipelines.publishing.tests.test_observed_market import observed, audit
    from pipelines.publishing.publish_market_display import publish_generation
    _, first = published_release(tmp_path)
    second = publish_generation(tmp_path / 'runtime', observed(), audit(observed()))
    manifest = json.loads((tmp_path / 'runtime/manifest.json').read_text())
    manifest['assets'].append({'destination': 'runtime/data/market', 'status': 'OK'})
    (tmp_path / 'runtime/manifest.json').write_text(json.dumps(manifest))
    paths = module.bundle_paths(tmp_path, ['runtime/manifest.json'], manifest)
    assert 'runtime/' + second['generation'] + '/display.json' in paths
    assert 'runtime/' + first['generation'] + '/display.json' not in paths
    assert 'runtime/publication_history/market_publication/' + Path(second['generation']).name + '.json' in paths
