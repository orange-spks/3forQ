@echo off
rem ============================================================
rem 3for 一键启动脚本（Windows）
rem 用法：双击本文件即可启动
rem 提示：右键本文件 → 发送到 → 桌面快捷方式，即可桌面双击启动
rem ============================================================

rem 切换到脚本所在目录（即项目根目录），/d 兼容跨盘符
cd /d "%~dp0"

rem 检查 npm 是否可用
where npm >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 npm，请确认已安装 Node.js 并加入 PATH
  echo 下载地址: https://nodejs.org/
  pause
  exit /b 1
)

rem 首次使用 / 依赖被清理过时自动安装
if not exist "node_modules" (
  echo [提示] 首次运行，正在安装依赖...
  call npm install
  if errorlevel 1 (
    echo [错误] 依赖安装失败
    pause
    exit /b 1
  )
)

rem 以独立进程方式启动 Electron：与原命令行窗口完全脱离，
rem 关闭本窗口（或任何终端）都不会导致应用退出。
rem 日志输出到 logs\ 目录，方便排查问题。
if not exist "node_modules\electron\dist\electron.exe" (
  echo [错误] 未找到 Electron 程序，请删除 node_modules 目录后重新运行本脚本
  pause
  exit /b 1
)

echo [启动] 3for...
if not exist "logs" mkdir logs
powershell -NoProfile -Command "Start-Process -FilePath '%~dp0node_modules\electron\dist\electron.exe' -ArgumentList '.' -WorkingDirectory '%~dp0' -RedirectStandardOutput '%~dp0logs\app.log' -RedirectStandardError '%~dp0logs\app.err.log'"
if errorlevel 1 (
  echo [错误] 启动失败
  pause
  exit /b 1
)

echo [完成] 3for 已在后台独立运行，本窗口可直接关闭
