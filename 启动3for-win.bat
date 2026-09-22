@echo off
rem ============================================================
rem 3for 一键启动脚本（Windows）
rem 用法：双击本文件即可启动
rem 提示：右键本文件 → 发送到 → 桌面快捷方式，即可桌面双击启动
rem ============================================================

rem 用 UTF-8 编码显示中文，避免乱码
chcp 65001 >nul

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

echo [启动] 3for...
call npm start

rem 异常退出时暂停，方便看报错信息
if errorlevel 1 pause
