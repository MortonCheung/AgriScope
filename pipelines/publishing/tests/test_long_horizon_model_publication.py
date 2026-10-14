"""Publish existing frozen weights only; no fitting, fake prices or source writes."""
import hashlib
import json
from pathlib import Path
import pytest
from pipelines.publishing.publish_long_horizon_models import publish,selected_files
ROOT=Path(__file__).resolve().parents[3]
SOURCE=ROOT.parent/'models/long_horizon'


def test_existing_selected_assets_are_immutable_and_manifested(tmp_path):
    runtime=tmp_path/'runtime';runtime.mkdir();(runtime/'manifest.json').write_text('{"assets":[],"generated_at":"frozen"}')
    obj,files=selected_files(SOURCE)
    assert len(files)==61 and obj['model_version']=='long_horizon_v2_rc2'
    before={name:hashlib.sha256((SOURCE/name).read_bytes()).hexdigest() for name in files}
    result=publish(SOURCE,runtime);assert result['files']==61
    manifest=runtime/'manifest.json';same=manifest.read_bytes();assert len(json.loads(same)['assets'])==61
    assert all(hashlib.sha256((runtime/'models/models/long_horizon'/name).read_bytes()).hexdigest()==sha for name,sha in before.items())
    publish(SOURCE,runtime);assert manifest.read_bytes()==same
    assert all(hashlib.sha256((SOURCE/name).read_bytes()).hexdigest()==sha for name,sha in before.items())
    assert not list((runtime/'models/models').glob('.stage-*'))


def test_existing_different_frozen_release_is_not_overwritten(tmp_path):
    runtime=tmp_path/'runtime';runtime.mkdir();(runtime/'manifest.json').write_text('{"assets":[]}')
    publish(SOURCE,runtime);before=(runtime/'manifest.json').read_bytes()
    path=runtime/'models/models/long_horizon/index.json';path.chmod(0o600);path.write_bytes(b'corrupt')
    with pytest.raises(ValueError):publish(SOURCE,runtime)
    assert (runtime/'manifest.json').read_bytes()==before and path.read_bytes()==b'corrupt'
