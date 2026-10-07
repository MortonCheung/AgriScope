import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from verify_assets import verify, sha256


def test_generated_refresh_does_not_refresh_immutable(tmp_path):
    model, generated = tmp_path / "model.pkl", tmp_path / "latest.json"
    model.write_bytes(b"frozen")
    generated.write_text("old")
    assets = [{"path": p.name, "asset_type": kind, "size": p.stat().st_size,
               "sha256": sha256(p), "required": True}
              for p, kind in [(model, "immutable"), (generated, "generated")]]
    old_hash = assets[0]["sha256"]
    model.write_bytes(b"corrupt")
    generated.write_text("new")
    result = verify({"n_assets": 2, "assets": assets}, tmp_path, refresh=True)
    assert result["problems"] == ["hash/size mismatch: model.pkl"]
    assert result["refreshed"] == ["latest.json"]
    assert assets[0]["sha256"] == old_hash


def test_processed_model_cannot_be_marked_generated(tmp_path):
    path = tmp_path / "data/processed/model.pkl"
    path.parent.mkdir(parents=True)
    path.write_bytes(b"model")
    asset = {"path": "data/processed/model.pkl", "asset_type": "generated", "size": 5,
             "sha256": sha256(path)}
    result = verify({"n_assets": 1, "assets": [asset]}, tmp_path, refresh=True)
    assert result["problems"] == ["protected asset must be immutable: data/processed/model.pkl"]
