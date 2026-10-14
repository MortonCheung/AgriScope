import sys
import hashlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from verify_assets import verify


def test_ok_assets_pass(tmp_path):
    (tmp_path / "runtime").mkdir()
    (tmp_path / "runtime" / "a.pkl").write_bytes(b"x")
    man = {"assets": [{"source": "s", "destination": "runtime/a.pkl",
                       "description": "d", "status": "OK"}]}
    result = verify(man, tmp_path)
    assert result["problems"] == []
    assert result["ok"] == 1 and result["total"] == 1


def test_missing_destination_reported(tmp_path):
    man = {"assets": [{"source": "s", "destination": "runtime/missing.pkl",
                       "description": "d", "status": "OK"}]}
    result = verify(man, tmp_path)
    assert len(result["problems"]) == 1
    assert "missing/empty destination" in result["problems"][0]


def test_empty_destination_reported(tmp_path):
    (tmp_path / "runtime" / "empty").mkdir(parents=True)
    man = {"assets": [{"source": "s", "destination": "runtime/empty",
                       "description": "d", "status": "OK"}]}
    result = verify(man, tmp_path)
    assert result["problems"] == ["missing/empty destination: runtime/empty"]


def test_unavailable_source_reported(tmp_path):
    man = {"assets": [{"source": "s", "destination": "runtime/a",
                       "description": "d", "status": "SKIP(missing-src)"}]}
    result = verify(man, tmp_path)
    assert len(result["problems"]) == 1
    assert "source unavailable" in result["problems"][0]


def test_destination_escape_reported(tmp_path):
    man = {"assets": [{"source": "s", "destination": "../outside.pkl",
                       "description": "d", "status": "OK"}]}
    result = verify(man, tmp_path)
    assert len(result["problems"]) == 1
    assert "escapes AgriScope" in result["problems"][0]


def test_supplied_asset_digest_is_verified_without_changing_legacy_schema(tmp_path):
    path = tmp_path / 'runtime/model.pkl'; path.parent.mkdir(); path.write_bytes(b'frozen')
    asset = {'destination': 'runtime/model.pkl', 'status': 'OK', 'sha256': hashlib.sha256(b'frozen').hexdigest()}
    assert verify({'assets': [asset]}, tmp_path)['problems'] == []
    path.write_bytes(b'tampered')
    assert verify({'assets': [asset]}, tmp_path)['problems'] == ['asset digest mismatch: runtime/model.pkl']


def test_directory_with_only_empty_children_is_not_a_valid_asset(tmp_path):
    (tmp_path / 'runtime/empty/inner').mkdir(parents=True)
    result = verify({'assets': [{'destination': 'runtime/empty', 'status': 'OK'}]}, tmp_path)
    assert result['problems'] == ['missing/empty destination: runtime/empty']


def test_directory_asset_rejects_internal_symlink(tmp_path):
    (tmp_path / 'runtime/models').mkdir(parents=True)
    (tmp_path / 'runtime/real.pkl').write_bytes(b'frozen')
    (tmp_path / 'runtime/models/model.pkl').symlink_to(tmp_path / 'runtime/real.pkl')
    result = verify({'assets': [{'destination': 'runtime/models', 'status': 'OK'}]}, tmp_path)
    assert result['problems'] == ['symlink in destination: runtime/models']


def test_misleading_success_prefix_is_not_an_asset_success(tmp_path):
    from scripts.verify_assets import verify
    p=tmp_path/'runtime/a';p.parent.mkdir();p.write_bytes(b'fixture')
    for status in ['OK_FAILED','OKAY','PUBLISHED-broken']:
        result=verify({'assets':[{'destination':'runtime/a','status':status}]},tmp_path)
        assert result['problems']
