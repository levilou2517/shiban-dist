#!/usr/bin/env bash
# 师伴一键部署脚本（空框架，无真实数据）
set -euo pipefail
DIST="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CWD="${1:-$(pwd)}"   # 目标 dsh 工作区；不传则用当前目录

echo "[1/4] 安装 Agent 预设 → ~/.dsh/.agent-presets/shiban/"
mkdir -p "$HOME/.dsh/.agent-presets"
cp -r "$DIST/agent-presets/shiban" "$HOME/.dsh/.agent-presets/shiban"

echo "[2/4] 安装技能 → $CWD/.dsh/skills/"
mkdir -p "$CWD/.dsh/skills"
cp "$DIST"/skills/*.md "$CWD/.dsh/skills/"

echo "[3/4] 安装数据层 → $CWD/services + $CWD/bin"
mkdir -p "$CWD/services" "$CWD/bin"
cp "$DIST"/services/*.py "$CWD/services/"
cp "$DIST/bin/shiban-store" "$CWD/bin/" && chmod +x "$CWD/bin/shiban-store"

echo "[4/4] 初始化空的 ~/.shiban/data"
(cd "$CWD" && bash bin/shiban-store init)

echo
echo "✅ 师伴已部署。请重启/新开 dsh 会话并选择预设「师伴」。"
echo "   数据层入口：$CWD/bin/shiban-store（~/.shiban/data，跨会话继承）"
