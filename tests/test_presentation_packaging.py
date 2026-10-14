"""Deployment/worker independence using explicit synthetic test-only anchors."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tarfile

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / 'scripts'))
from pipelines.publishing import publish_market_presentation as publisher
from pipelines.publishing.tests.test_market_presentation import inputs, predict
from verify_assets import presentation_files, verify_deployment


def module():
    spec = importlib.util.spec_from_file_location('presentation_bundle_test', ROOT / 'scripts/build_deploy_bundle.py')
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result)
    return result


@pytest.fixture
def release(tmp_path, monkeypatch):
    project = tmp_path / 'source'; project.mkdir()
    path = project / publisher.INPUTS['market']; path.parent.mkdir(parents=True); path.write_bytes(b'test-only fixture input')
    monkeypatch.setattr(publisher.Reader, 'rows', lambda _reader, _family: [point for series in inputs() for point in series.points])
    product = tmp_path / 'product'; runtime = product / 'runtime'; runtime.mkdir(parents=True)
    payload = publisher.build_release(project, runtime, predict=predict, as_of='2025-01-03')
    publisher.publish(payload, runtime)
    return product, project, payload


def test_worker_can_republish_from_only_selected_runtime_anchors(release, tmp_path):
    product, _project, first = release
    isolated = tmp_path / 'empty-worker'; isolated.mkdir()
    result = publisher.build_release(isolated, product / 'runtime', predict=predict, as_of='2025-01-03')
    assert result['input_hash'] == first['input_hash']
    assert publisher.publish(result, product / 'runtime')['status'] == 'UNCHANGED'
    assert len(result['records']) == 224
    assert not any(isolated.rglob('*.parquet'))


def test_corrupt_anchor_rejects_update_and_keeps_latest_bytes(release, tmp_path):
    product, _project, first = release
    runtime = product / 'runtime'; path = runtime / publisher.RELATIVE_PATH; before = path.read_bytes()
    anchor = runtime / first['provenance']['anchor_asset']['path']; anchor.chmod(0o640); anchor.write_text('{broken}')
    with pytest.raises(ValueError, match='checksum'):
        publisher.build_release(tmp_path / 'empty', runtime, predict=predict, as_of='2025-01-03')
    assert path.read_bytes() == before


def test_bundle_carries_only_current_selected_anchors_and_verifies_after_extract(release, tmp_path):
    product, _project, payload = release
    (product / 'frontend/dist').mkdir(parents=True); (product / 'frontend/dist/index.html').write_text('<main>test build</main>')
    (product / 'runtime/base.txt').write_text('test base asset')
    manifest = {'assets': [{'path': 'runtime/base.txt'}]}
    (product / 'runtime/manifest.json').write_text(json.dumps(manifest))
    archive = product / 'runtime/data/market/presentation/releases/old.json'; archive.parent.mkdir(exist_ok=True); archive.write_text('old unpublished file')
    builder = module(); paths = builder.bundle_paths(product, ['runtime/manifest.json'], manifest)
    selected = presentation_files(product)
    assert len(selected) == 3 and all(path in paths for path in selected)
    assert 'runtime/data/market/presentation/releases/old.json' not in paths
    target = tmp_path / 'presentation.tar.gz'; metadata = builder.build_bundle(product, paths, target, manifest=manifest)
    extracted = tmp_path / 'extracted'; extracted.mkdir()
    with tarfile.open(target) as bundle: bundle.extractall(extracted)
    assert verify_deployment(metadata, extracted) == []
    assert presentation_files(extracted) == selected
    current = publisher.committed_path(extracted / 'runtime')
    data = json.loads(current.read_text()); data['records'][0]['price'] += 1; current.chmod(0o640); current.write_text(json.dumps(data))
    assert verify_deployment(metadata, extracted)


def test_valid_daily_presentation_update_does_not_change_frozen_base_identity(release, tmp_path):
    product, _project, _payload = release
    (product / 'runtime/base.txt').write_text('test base asset')
    manifest = {'assets': [{'path': 'runtime/base.txt'}]}; (product / 'runtime/manifest.json').write_text(json.dumps(manifest))
    (product / 'frontend/dist').mkdir(parents=True); (product / 'frontend/dist/index.html').write_text('test build')
    builder = module(); paths = builder.bundle_paths(product, ['runtime/manifest.json'], manifest)
    metadata = builder.build_bundle(product, paths, tmp_path / 'initial.tar.gz', manifest=manifest)
    payload = publisher.build_release(tmp_path / 'empty-worker', product / 'runtime', predict=predict, as_of='2025-01-04')
    publisher.publish(payload, product / 'runtime')
    assert verify_deployment(metadata, product) == []
    assert json.loads((product / 'runtime/manifest.json').read_text()) == manifest


@pytest.mark.parametrize('failed_file', ['generation', 'pointer', 'alias'])
def test_interrupted_publish_keeps_a_verified_restartable_generation(release, tmp_path, monkeypatch, failed_file):
    product, _project, first = release
    runtime = product / 'runtime'
    (runtime / 'base.txt').write_text('test base asset')
    manifest = {'assets': [{'path': 'runtime/base.txt'}]}; (runtime / 'manifest.json').write_text(json.dumps(manifest))
    (product / 'frontend/dist').mkdir(parents=True); (product / 'frontend/dist/index.html').write_text('test build')
    builder = module(); paths = builder.bundle_paths(product, ['runtime/manifest.json'], manifest)
    metadata = builder.build_bundle(product, paths, tmp_path / 'before.tar.gz', manifest=manifest)
    second = publisher.build_release(tmp_path / 'empty-worker', runtime, predict=predict, as_of='2025-01-04')
    original = publisher.atomic_bytes
    def interrupted(path, body, *args, **kwargs):
        path = Path(path)
        if ((failed_file == 'pointer' and path.name == 'current.json')
                or (failed_file == 'generation' and path.parent.name == 'releases')
                or (failed_file == 'alias' and path.name == 'latest.json')):
            raise OSError('isolated publication interruption')
        return original(path, body, *args, **kwargs)
    monkeypatch.setattr(publisher, 'atomic_bytes', interrupted)
    if failed_file == 'alias':
        assert publisher.publish(second, runtime)['status'] == 'PUBLISHED'
        assert json.loads(publisher.committed_path(runtime).read_text())['input_hash'] == second['input_hash']
    else:
        with pytest.raises(OSError): publisher.publish(second, runtime)
        assert json.loads(publisher.committed_path(runtime).read_text())['input_hash'] == first['input_hash']
    assert verify_deployment(metadata, product) == []
    monkeypatch.setattr(publisher, 'atomic_bytes', original)
    publisher.publish(second, runtime)
    assert verify_deployment(metadata, product) == []
    assert json.loads(publisher.committed_path(runtime).read_text())['input_hash'] == second['input_hash']
