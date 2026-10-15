"""Historical acceptance reads the selected research root from any Git worktree."""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def test_historical_report_lookup_uses_explicit_research_root(tmp_path):
    reports = tmp_path / 'archive/agent_reports'; reports.mkdir(parents=True)
    target = reports / 'LONG_HORIZON_V2_TARGET_REPORT.md'; target.write_text('test-only report')
    env = dict(os.environ, AGRISCOPE_RESEARCH_ROOT=str(tmp_path))
    code = "from pipelines.long_horizon.acceptance_v2 import _deliverable; print(_deliverable('LONG_HORIZON_V2_TARGET_REPORT.md'))"
    completed = subprocess.run([sys.executable, '-c', code], cwd=ROOT, env=env, capture_output=True, text=True)
    assert completed.returncode == 0, completed.stderr
    assert completed.stdout.strip() == str(target)


def test_engineering_gate_keeps_runtime_local_and_research_explicit(tmp_path, monkeypatch):
    monkeypatch.setenv('AGRISCOPE_RESEARCH_ROOT', str(tmp_path))
    spec = importlib.util.spec_from_file_location('long_engineering_paths_test', ROOT / 'scripts/verify_long_horizon.py')
    gate = importlib.util.module_from_spec(spec); spec.loader.exec_module(gate)
    assert gate.PROJECT == tmp_path
    assert gate.RUNTIME == ROOT / 'runtime'
    report = tmp_path / 'archive/agent_reports/PRODUCTION_GATE_REPORT.md'
    report.parent.mkdir(parents=True); report.write_text('test-only report')
    assert gate._find(report.name) == report
