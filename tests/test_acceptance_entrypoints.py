"""A Git worktree must not silently treat its parent as the research workspace."""
import os
from pathlib import Path
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize('entrypoint', ['acceptance.sh', 'test_all.sh'])
def test_worktree_without_research_assets_requires_an_explicit_root(tmp_path, entrypoint):
    scripts = tmp_path / 'worktree/scripts'; scripts.mkdir(parents=True)
    shutil.copyfile(ROOT / 'scripts' / entrypoint, scripts / entrypoint)
    env = dict(os.environ)
    for name in ('AGRISCOPE_RESEARCH_ROOT', 'AGRISCOPE_TEST_PROJECT_ROOT'):
        env.pop(name, None)
    completed = subprocess.run(['bash', str(scripts / entrypoint)], env=env, capture_output=True, text=True)
    assert completed.returncode == 2
    assert 'AGRISCOPE_RESEARCH_ROOT' in completed.stderr


@pytest.mark.parametrize('entrypoint', ['acceptance.sh', 'test_all.sh'])
def test_explicit_research_and_worker_roots_reach_separate_test_processes(tmp_path, entrypoint):
    research, worker = tmp_path / 'research', tmp_path / 'worker'
    (research / 'data').mkdir(parents=True); (research / 'models').mkdir()
    worker.mkdir()
    commands = tmp_path / 'commands.txt'; binaries = tmp_path / 'bin'; binaries.mkdir()
    interpreter = binaries / 'test-python'
    interpreter.write_text('#!/bin/sh\nprintf "%s|%s|%s\\n" "$AGRISCOPE_RESEARCH_ROOT" "$PROJECT_ROOT" "$*" >> "$AGRISCOPE_TEST_LOG"\n')
    interpreter.chmod(0o755)
    npm = binaries / 'npm'; npm.write_text('#!/bin/sh\nexit 0\n'); npm.chmod(0o755)
    env = dict(os.environ, AGRISCOPE_RESEARCH_ROOT=str(research), PROJECT_ROOT=str(worker),
               AGRISCOPE_PYTHON=str(interpreter), AGRISCOPE_TEST_LOG=str(commands),
               PATH=str(binaries) + os.pathsep + os.environ.get('PATH', ''))
    env.pop('AGRISCOPE_WORKER_ROOT', None)
    completed = subprocess.run(['bash', str(ROOT / 'scripts' / entrypoint)], env=env, capture_output=True, text=True)
    assert completed.returncode == 0, completed.stderr
    calls = [line.split('|', 2) for line in commands.read_text().splitlines()]
    assert all(line[0] == str(research) for line in calls)
    for target in ('pipelines/daily/tests', 'pipelines/daily/market_feed/tests', 'pipelines/publishing/tests'):
        assert any(line[1] == str(worker) and target in line[2] for line in calls)
    assert any(line[1] == str(ROOT / 'runtime') and 'pipelines/modeling/tests' in line[2] for line in calls)
    assert any('pipelines/modeling/scripts/check_acceptance_final.py' == line[2] for line in calls)


@pytest.mark.parametrize('entrypoint', ['acceptance.sh', 'test_all.sh'])
def test_acceptance_refuses_to_use_historical_research_as_the_worker(tmp_path, entrypoint):
    (tmp_path / 'data').mkdir(); (tmp_path / 'models').mkdir()
    env = dict(os.environ, AGRISCOPE_RESEARCH_ROOT=str(tmp_path), PROJECT_ROOT=str(tmp_path))
    env.pop('AGRISCOPE_WORKER_ROOT', None)
    completed = subprocess.run(['bash', str(ROOT / 'scripts' / entrypoint)], env=env, capture_output=True, text=True)
    assert completed.returncode == 2
    assert 'historical research' in completed.stderr


@pytest.mark.parametrize('entrypoint', ['acceptance.sh', 'test_all.sh'])
def test_acceptance_rejects_conflicting_worker_aliases_before_any_checks(tmp_path, entrypoint):
    research = tmp_path / 'research'
    (research / 'data').mkdir(parents=True); (research / 'models').mkdir()
    first, second = tmp_path / 'first', tmp_path / 'second'
    first.mkdir(); second.mkdir()
    env = dict(os.environ, AGRISCOPE_RESEARCH_ROOT=str(research), PROJECT_ROOT=str(first), AGRISCOPE_WORKER_ROOT=str(second))
    completed = subprocess.run(['bash', str(ROOT / 'scripts' / entrypoint)], env=env, capture_output=True, text=True)
    assert completed.returncode == 2
    assert 'must identify the same worker' in completed.stderr
