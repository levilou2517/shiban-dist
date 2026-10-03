#!/usr/bin/env bash
# 师伴一键部署（v0.5.0-test 起）
#
# 与旧版三处必要差异：
#   1. 预设不再拷进 ~/.dsh/.agent-presets/ —— DSH 0.2.0-rc.2 起该目录无任何消费者。
#      预设与素材工具改为 npm bundle，经 `dsh plugin --profile <name> add file:...` 安装。
#   2. 素材 bundle 的 cliPath 在安装期填成目标工作区的绝对路径：bundle 装在 profile 的
#      node_modules 下，与 <workspace>/bin/shiban-store 无固定相对关系，相对路径必失效。
#   3. 素材库根由安装者指定（默认取工作区之外、可整体带走的目录），落实"素材与本体分离"。
#
# 用法: bash install.sh [目标工作区] [--profile 名] [--assets-root 目录] [--yes]
set -euo pipefail
DIST="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CWD="$PWD"; PROFILE=""; ASSETS=""; ASSUME_YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --profile) PROFILE="${2:?--profile 需要名称}"; shift 2 ;;
    --assets-root) ASSETS="${2:?--assets-root 需要目录}"; shift 2 ;;
    --yes) ASSUME_YES=1; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) CWD="$(cd "$1" && pwd)"; shift ;;
  esac
done
[ -n "$PROFILE" ] || PROFILE="$(basename "$CWD")"
[ -n "$ASSETS" ] || ASSETS="$HOME/shiban-materials"
case "$ASSETS" in /*) ;; *) echo "✗ --assets-root 必须是绝对路径"; exit 1 ;; esac

command -v dsh >/dev/null || { echo "✗ 未找到 dsh（需先安装 DeepSeek Harness）"; exit 1; }

echo "== 师伴部署 =="
echo "  工作区     : $CWD"
echo "  DSH profile: $PROFILE"
echo "  素材库根   : $ASSETS   （教师外部资产，可整体拷贝带走）"
if [ "$CWD" = "$ASSETS" ]; then echo "✗ 素材库根不应等于工作区本体（素材须与本体分离）"; exit 1; fi
[ "$ASSUME_YES" = 1 ] || { printf '确认部署? [y/N] '; read -r a; [ "$a" = y ] || { echo "已取消"; exit 1; }; }

echo "[1/5] 技能 → $CWD/.dsh/skills/"
mkdir -p "$CWD/.dsh/skills"
cp "$DIST"/skills/*.md "$CWD/.dsh/skills/"

echo "[2/5] 数据层 → $CWD/services + $CWD/bin"
mkdir -p "$CWD/services" "$CWD/bin"
cp "$DIST"/services/*.py "$CWD/services/"
cp "$DIST/bin/shiban-store" "$CWD/bin/" && chmod +x "$CWD/bin/shiban-store"

echo "[3/5] bundle 安装（预设 + 素材工具）→ profile '$PROFILE'"
# 目录名以 dist/bundles 下实际存在的为准（目录名 ≠ 包名，勿凭包名推断）
PB="$(find "$DIST/bundles" -maxdepth 1 -type d -name 'dsh-shiban-preset*' | head -1)"
BB="$(find "$DIST/bundles" -maxdepth 1 -type d -name 'dsh-shiban-bundle*' | head -1)"
[ -n "$PB" ] && [ -n "$BB" ] || { echo "✗ dist/bundles 下缺预设或素材工具包（预设=$PB 工具=$BB）"; exit 1; }
dsh plugin --profile "$PROFILE" add "file:$PB" "file:$BB"

echo "[4/5] 素材工具指向本机 CLI（写绝对 cliPath + 素材根）"
PROFILE_DIR="${DSH_HOME:-$HOME/.dsh}/profiles/$PROFILE"
PATCH="$PROFILE_DIR/node_modules/@local/dsh-shiban-bundle/cordis.patch.yml"
[ -f "$PATCH" ] || { echo "✗ 未找到已安装的 patch: $PATCH"; echo "  若 pnpm 以软链安装，请 ls -l 该路径确认后重试"; exit 1; }
python3 - "$PATCH" "$CWD/bin/shiban-store" "$ASSETS" <<'PY'
import re, sys, pathlib
p, cli, assets = map(pathlib.Path, sys.argv[1:4])
t = p.read_text(encoding='utf-8')
assert 'cliPath:' in t, f'patch 内未见 cliPath 行: {p}'
t = re.sub(r'cliPath:.*', f'cliPath: {cli}', t, count=1)
t = re.sub(r'shibanRoot:.*', f'shibanRoot: {assets}', t, count=1)
p.write_text(t, encoding='utf-8')
print(f'  ✓ cliPath    = {cli}')
print(f'  ✓ shibanRoot = {assets}')
PY

echo "[5/5] 初始化素材库（写在外部素材根，不进工作区）"
mkdir -p "$ASSETS"
SHIBAN_ROOT="$ASSETS" bash "$CWD/bin/shiban-store" init

cat <<DONE

✅ 师伴已部署（v0.5.0-test）。

下一步：
  1. 重启/新开 dsh 会话，profile 选「$PROFILE」，Agent 选「师伴」。
  2. 素材库在 $ASSETS —— 外部资产，与本体分离，可整体拷贝带走。
     换机部署时把该目录一起拷走，不要放进工作区。

预发布注意：
  - 素材编排页依赖浏览器渲染，本版本**未做真实浏览器验证**。
  - 引用 vendor/ 的素材需保留 $ASSETS/data/assets/vendor/ 结构，不能单文件搬移。
DONE
