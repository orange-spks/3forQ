#!/bin/zsh
# ============================================================
# 3for 一键启动脚本（macOS）
# 用法：双击本文件即可启动，无需先打开终端 cd 进目录
# 提示：可右键 → 制作替身（Alias），把替身拖到桌面/Dock
# ============================================================

# 切换到脚本所在目录（即项目根目录）
cd -- "$(dirname -- "$0")" || {
  echo "❌ 无法进入项目目录"
  read -k 1 "?按任意键退出..."
  exit 1
}

# 双击启动时 PATH 里没有 nvm/brew 装的 node，需要手动加载
if ! command -v npm >/dev/null 2>&1; then
  # 优先加载用户 shell 配置（nvm 通常在 .zshrc / .zprofile 里初始化）
  [ -f "$HOME/.zprofile" ] && source "$HOME/.zprofile" >/dev/null 2>&1
  [ -f "$HOME/.zshrc" ]    && source "$HOME/.zshrc"    >/dev/null 2>&1
fi

# 兜底：直接用 nvm 目录下最新版本的 node
if ! command -v npm >/dev/null 2>&1 && [ -d "$HOME/.nvm/versions/node" ]; then
  latest_node=$(ls "$HOME/.nvm/versions/node" | sort -V | tail -1)
  export PATH="$HOME/.nvm/versions/node/$latest_node/bin:$PATH"
fi

# 再兜底：Homebrew 常见路径
if ! command -v npm >/dev/null 2>&1; then
  export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ 未找到 npm，请确认已安装 Node.js（推荐用 nvm 安装）"
  read -k 1 "?按任意键退出..."
  exit 1
fi

# 首次使用 / 依赖被清理过时自动安装
if [ ! -d "node_modules" ]; then
  echo "📦 首次运行，正在安装依赖..."
  npm install
fi

echo "🚀 启动 3for..."
npm start
