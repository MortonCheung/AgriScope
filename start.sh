#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo
echo "========================================"
echo " AgriScope 穹衡 一键启动"
echo "========================================"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 未检测到 Node.js。"
  echo "请先安装 Node.js 20 或更高版本：https://nodejs.org/"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[错误] 未检测到 npm。"
  echo "请重新安装包含 npm 的 Node.js：https://nodejs.org/"
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "[错误] 当前 Node.js 版本过低：$(node -v)"
  echo "请升级到 Node.js 20 或更高版本：https://nodejs.org/"
  exit 1
fi

echo "[环境] Node.js $(node -v)"
echo "[环境] npm $(npm -v)"
echo

if [ ! -d "node_modules" ]; then
  echo "[1/2] 首次运行，正在安装依赖..."
  if [ -f "package-lock.json" ]; then
    npm ci
  else
    npm install
  fi
else
  echo "[1/2] 已检测到 node_modules，跳过依赖安装。"
fi

echo
echo "[2/2] 正在启动 AgriScope..."
echo "启动后请打开终端显示的 Local 地址。"
echo

npm run dev -- --host
