#!/usr/bin/env bash
# AgriScope v1.0 · 本地开发：启动唯一正式后端（另开终端跑前端）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

HOST="${AGRISCOPE_API_HOST:-127.0.0.1}"
PORT="${AGRISCOPE_API_PORT:-8787}"

# 不要在这里设置 PROJECT_ROOT=/AGRISCOPE_WORKER_ROOT 指向 $ROOT：
# 路径合同（agriscope_paths）要求 worker 必须位于只读产品目录之外，
# 指向产品自身会直接抛 "worker state must be outside the read-only product"。
# 留空即自动推导到外层研发目录（同时含 data/ 与 AgriScope/ 的父目录）。
# 需要显式指定时：AGRISCOPE_WORKER_ROOT=/path/to/worker ./scripts/dev.sh

echo "AgriScope backend  →  http://$HOST:$PORT  (docs: /docs)"
echo "端口被占用时：AGRISCOPE_API_PORT=8899 ./scripts/dev.sh"
echo "前端另开终端：cd frontend && npm run dev"
exec python3 -m uvicorn app.main:app \
  --app-dir "$ROOT/backend" \
  --host "$HOST" --port "$PORT" --workers 1