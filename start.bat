@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ========================================
echo  AgriScope 穹衡 一键启动
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js。
    echo 请先安装 Node.js 20 或更高版本：
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 npm。
    echo 请重新安装包含 npm 的 Node.js：
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 20 (
    echo [错误] 当前 Node.js 版本过低：
    node -v
    echo 请升级到 Node.js 20 或更高版本：
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [环境] Node.js
node -v
echo [环境] npm
npm -v
echo.

if not exist node_modules (
    echo [1/2] 首次运行，正在安装依赖...
    if exist package-lock.json (
        call npm ci
    ) else (
        call npm install
    )
    if errorlevel 1 (
        echo.
        echo [错误] 依赖安装失败，请检查网络或 npm 配置。
        pause
        exit /b 1
    )
) else (
    echo [1/2] 已检测到 node_modules，跳过依赖安装。
)

echo.
echo [2/2] 正在启动 AgriScope...
echo 启动后请打开终端显示的 Local 地址。
echo.

call npm run dev -- --host

echo.
pause
