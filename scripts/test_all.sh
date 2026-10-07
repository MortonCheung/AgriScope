#!/usr/bin/env bash
# AgriScope v1.0 · 一键全量测试（不训练、不部署）
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PROJECT_ROOT="$ROOT"
export PYTHONPATH="$ROOT/models/src:$ROOT/models:$ROOT/models/tests:$ROOT"
FAIL=0
step() { echo; echo "===== $1 ====="; }

step "1/6 Frontend (typecheck + tests + build + verify)"
( cd frontend && npm run typecheck && npm test && npm run build ) || FAIL=1

step "2/6 Backend (acceptance + E2E)"
python3 backend/scripts/acceptance.py || FAIL=1

step "3/6 Final Model"
python3 scripts/check_final_freeze.py || FAIL=1
PYTHONPATH=models/src python3 models/scripts/check_acceptance_final.py || FAIL=1

step "4/6 Daily"
python3 data/daily/acceptance.py || FAIL=1

step "5/6 Long-Horizon（一致性门禁，不训练）"
python3 scripts/verify_long_horizon.py || FAIL=1

step "6/6 全层 Python 回归 + 独立指标重算（不训练）"
python3 -m pytest backend/tests models/tests models/long_horizon/tests llm/tests tests --import-mode=importlib -q || FAIL=1
# Daily保留原来的包导入环境，独立进程避免data/long_horizon与models/long_horizon同名。
python3 -m pytest data/daily/tests -q || FAIL=1
python3 scripts/independent_recalculate_v2.py || FAIL=1
python3 scripts/verify_assets.py || FAIL=1

echo
if [ "$FAIL" -eq 0 ]; then echo "ALL_TESTS_PASS"; else echo "TESTS_FAILED"; fi
exit "$FAIL"
