#!/usr/bin/env bash
# AgriScope v1.0 · 一键全量测试（不训练、不部署）
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PROJECT_ROOT="$ROOT"
FAIL=0
step() { echo; echo "===== $1 ====="; }

step "1/4 Frontend (typecheck + tests + build + verify)"
( cd frontend && npm run typecheck && npm test && npm run build ) || FAIL=1

step "2/4 Backend (acceptance + E2E)"
python3 backend/scripts/acceptance.py || FAIL=1

step "3/4 Final Model"
PYTHONPATH=models/src python3 models/scripts/check_acceptance_final.py || FAIL=1

step "4/4 Daily"
python3 data/daily/acceptance.py || FAIL=1

echo
if [ "$FAIL" -eq 0 ]; then echo "ALL_TESTS_PASS"; else echo "TESTS_FAILED"; fi
exit "$FAIL"