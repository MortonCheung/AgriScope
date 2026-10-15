#!/usr/bin/env bash
# AgriScope v1.0 · 一键全量测试（不训练、不部署）
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"       # AgriScope（产品仓）
RESEARCH="${AGRISCOPE_RESEARCH_ROOT:-${AGRISCOPE_TEST_PROJECT_ROOT:-$ROOT/..}}"
if [ ! -d "$RESEARCH/data" ] || [ ! -d "$RESEARCH/models" ]; then
  echo "Set AGRISCOPE_RESEARCH_ROOT to the research workspace containing data/ and models/." >&2
  exit 2
fi
RESEARCH="$(cd "$RESEARCH" && pwd)"
PROJECT="${PROJECT_ROOT:-${AGRISCOPE_WORKER_ROOT:-}}"
if [ -z "$PROJECT" ] || [ ! -d "$PROJECT" ]; then
  echo "Set PROJECT_ROOT to a prepared independent test worker directory." >&2
  exit 2
fi
PROJECT="$(cd "$PROJECT" && pwd -P)"
if [ -n "${AGRISCOPE_WORKER_ROOT:-}" ] && [ "$(cd "$AGRISCOPE_WORKER_ROOT" 2>/dev/null && pwd -P)" != "$PROJECT" ]; then
  echo "PROJECT_ROOT and AGRISCOPE_WORKER_ROOT must identify the same worker." >&2
  exit 2
fi
case "$PROJECT" in
  "$RESEARCH"|"$RESEARCH/data"|"$RESEARCH/data/"*|"$RESEARCH/models"|"$RESEARCH/models/"*|"$ROOT"|"$ROOT/"*)
    echo "Test worker must not write into the product or historical research data/models." >&2
    exit 2 ;;
esac
PYTHON="${AGRISCOPE_PYTHON:-python3}"
export AGRISCOPE_RESEARCH_ROOT="$RESEARCH"
export AGRISCOPE_ROOT="${AGRISCOPE_ROOT:-$ROOT}"
export PROJECT_ROOT="$PROJECT"
export AGRISCOPE_WORKER_ROOT="$PROJECT"
cd "$ROOT"
export PYTHONPATH="$ROOT/pipelines/modeling/src:$ROOT/pipelines/modeling:$ROOT/pipelines/modeling/tests:$ROOT/pipelines:$ROOT"
FAIL=0
step() { echo; echo "===== $1 ====="; }

step "1/6 Frontend (typecheck + tests + build + verify)"
( cd frontend && npm run typecheck && npm test && npm run build ) || FAIL=1

step "2/6 Backend (acceptance + E2E)"
"$PYTHON" backend/scripts/acceptance.py || FAIL=1

step "3/6 Final Model"
"$PYTHON" scripts/check_final_freeze.py || FAIL=1
"$PYTHON" pipelines/modeling/scripts/check_acceptance_final.py || FAIL=1

step "4/6 Daily"
PROJECT_ROOT="$PROJECT" "$PYTHON" pipelines/daily/acceptance.py || FAIL=1

step "5/6 Long-Horizon（一致性门禁，不训练）"
"$PYTHON" scripts/verify_long_horizon.py || FAIL=1

step "6/6 全层 Python 回归 + 独立指标重算（不训练）"
# Backend 单独进程：产品只读 runtime/models/src；避免与 pipelines/modeling/src 同名包互相污染。
"$PYTHON" -m pytest backend/tests -q || FAIL=1
PROJECT_ROOT="$PROJECT" "$PYTHON" -m pytest pipelines/long_horizon/tests tests --import-mode=importlib -q || FAIL=1
env -u AGRISCOPE_WORKER_ROOT PROJECT_ROOT="$ROOT/runtime" "$PYTHON" -m pytest pipelines/modeling/tests --import-mode=importlib -q || FAIL=1
PROJECT_ROOT="$PROJECT" "$PYTHON" -m pytest llm/tests -q || FAIL=1
PROJECT_ROOT="$PROJECT" "$PYTHON" -m pytest pipelines/daily/tests -q || FAIL=1
PROJECT_ROOT="$PROJECT" "$PYTHON" -m pytest pipelines/daily/market_feed/tests -q || FAIL=1
PROJECT_ROOT="$PROJECT" "$PYTHON" -m pytest pipelines/publishing/tests --import-mode=importlib -q || FAIL=1
"$PYTHON" scripts/independent_recalculate_v2.py || FAIL=1
"$PYTHON" scripts/verify_assets.py || FAIL=1

echo
if [ "$FAIL" -eq 0 ]; then echo "ALL_TESTS_PASS"; else echo "TESTS_FAILED"; fi
exit "$FAIL"
