#!/usr/bin/env bash
# AgriScope v1.0 · 一键正式验收（只读校验 + 各层验收；禁止训练）
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PROJECT_ROOT="$ROOT"
export PYTHONPATH="$ROOT/models/src:$ROOT/models:$ROOT/models/tests:$ROOT"
FAIL=0

echo "===== 0. 运行时资产清单校验 ====="
python3 scripts/verify_assets.py || FAIL=1

echo; echo "===== 1. Backend 正式验收 ====="
python3 backend/scripts/acceptance.py || FAIL=1

echo; echo "===== 2. Final Model 验收 ====="
python3 scripts/check_final_freeze.py || FAIL=1
PYTHONPATH=models/src python3 models/scripts/check_acceptance_final.py || FAIL=1

echo; echo "===== 3. Daily 验收 ====="
python3 data/daily/acceptance.py || FAIL=1

echo; echo "===== 4. Long-Horizon 一致性门禁 ====="
python3 scripts/verify_long_horizon.py || FAIL=1

echo "===== 5. 长期/LLM/运行时/契约边界测试 ====="
python3 -m pytest models/long_horizon/tests llm/tests tests backend/tests --import-mode=importlib -q || FAIL=1
python3 scripts/independent_recalculate_v2.py || FAIL=1

echo
if [ "$FAIL" -eq 0 ]; then echo "ACCEPTANCE_PASS"; else echo "ACCEPTANCE_FAILED"; fi
exit "$FAIL"
