"""The release must include the published runtime, never its external source tree."""
import importlib.util
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
    manifest = {'assets': [{'destination': 'runtime/research', 'source': '../data/research'}, {'destination': 'runtime/llm/artifacts/v2/outcome_labels.json'}]}
    paths = module.bundle_paths(tmp_path, ['backend/app/main.py'], manifest)
    assert 'runtime/research/product/tieling/A07.json' in paths
    assert 'runtime/llm/artifacts/v2/outcome_labels.json' in paths
    assert 'frontend/dist/index.html' in paths
    assert not any('__pycache__' in path for path in paths)


def test_legacy_file_manifest_and_optional_missing_assets(tmp_path):
    write(tmp_path, 'runtime/model.pkl')
    assert module.bundle_paths(tmp_path, [], {'assets': [{'path': 'runtime/model.pkl'}, {'path': 'missing', 'required': False}]}) == ['runtime/model.pkl']


@pytest.mark.parametrize('destination', ['../outside', '.env', 'runtime/missing'])
def test_invalid_destinations_fail_instead_of_producing_an_incomplete_bundle(tmp_path, destination):
    write(tmp_path, '.env')
    with pytest.raises(RuntimeError):
        module.bundle_paths(tmp_path, [], {'assets': [{'destination': destination}]})
