import json
import shutil
import pytest
from app import config as C
from app.errors import ApiError
from app.services import project_service


def test_frozen_evidence_keeps_percent_units_and_real_time_splits():
    data = project_service.evidence()
    assert len(data['models']) == 54
    row = next(r for r in data['models'] if r['cityId'] == 'shenyang' and r['crop'] == '土豆' and r['horizon'] == 7)
    assert row['wape'] == 2.3137 and row['baselineWape'] == 2.3137
    assert data['trainingCompletedAt'] is None
    assert data['fingerprint'] == json.loads(C.FINAL_RUN_META.read_text())['code_fingerprint']
    for fold in data['folds']:
        assert fold['trainEndMax'] < fold['validationStart']
    assert data['folds'][-1]['validationEndMax'] == '2026-08-14'


def test_tampered_validation_artifact_is_not_displayed(tmp_path, monkeypatch):
    target = tmp_path / 'final'
    (target / 'tables').mkdir(parents=True)
    for name in ['FINAL_RUN_META.json', 'FINAL_MODEL_REGISTRY.csv', 'tables/price_model_folds.csv']:
        shutil.copyfile(C.FINAL_REPORTS_DIR / name, target / name)
    monkeypatch.setattr(C, 'FINAL_REPORTS_DIR', target)
    monkeypatch.setattr(C, 'FINAL_RUN_META', target / 'FINAL_RUN_META.json')
    with (target / 'FINAL_MODEL_REGISTRY.csv').open('ab') as f:
        f.write(b'\nchanged')
    with pytest.raises(ApiError) as error:
        project_service.evidence()
    assert error.value.status_code == 503
