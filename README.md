# 师伴（shiban）Agent · 部署指南

> **本文件是一份部署指导**：它告诉你（人）和/或 AI 助手——师伴分发包在哪、如何部署到一个全新的 DSH 环境。
> 全程只安装**空 Agent 框架**，**不含任何真实教学数据**。
>
> **适用版本：v0.5.0-test（预发布）**。本版的安装机制与 v0.4.x **不兼容**，旧部署步骤已失效，请勿混用。
>
> ⚠️ **预发布声明**：本版把素材编排引擎从「正则改写内联」换成了「`iframe srcdoc` 沙箱隔离」，并新增了素材库与编排工具。**真实浏览器渲染与教学科学性尚未验证**（装配环境无可用浏览器）。用于生产教学前请先自行验收。

---

## 0. 本版改了什么（相对 v0.4.x）

| 项 | v0.4.x | v0.5.0-test |
|---|---|---|
| Agent 预设安装 | 拷目录到 `~/.dsh/.agent-presets/shiban/` | **npm bundle**，经 `dsh plugin … add file:` 装进 profile。旧目录自 DSH 0.2.0-rc.2 起**已无任何消费者** |
| 素材能力 | 无（技能 md 之外什么都没有） | 素材库 + 检索 + 复用 + 隔离编排 + 宿主 Tool（`shiban_asset_*` / `shiban_raw_*`） |
| 素材存放 | —— | **独立素材库根**（安装时指定），与工作区本体分离，可整体拷贝带走 |
| 编排产物隔离 | 正则剥脚本 + 改写 CSS/JS | 完整 HTML 文档入 `srcdoc` 沙箱，各节独立数据，可嵌套再组合 |
| CLI 参数容错 | JSON 解析失败时告警后按字符串存 | **报错退出（exit 2）** |

---

## 1. 分发包在哪

| 项 | 值 |
|---|---|
| 仓库 | **`https://github.com/levilou2517/shiban-dist`**（Public） |
| 本版 tag | **`v0.5.0-test`**（预发布，非正式版） |
| 内容 | 六项技能、数据层、两个可安装 bundle、部署脚本与本指南 |

**目录结构**：

```
shiban-dist/
├── README.md                 ← 本指南
├── skills/                   ← 六项技能 + 技能地图 README
│   ├── lesson-plan.md  quiz.md  class-eval.md
│   ├── class-profile.md  teacher-growth.md
│   └── html-material.md      ← 新增：教师素材库（查/积累/复用/编排）
├── services/*.py             ← 持久数据层（Python 标准库，零第三方依赖）
├── bin/shiban-store          ← 数据层入口（唯一数据路径）
├── bundles/                  ← 新增：可安装的 npm bundle
│   ├── dsh-shiban-presets/   ← Agent 预设（@local/dsh-shiban-preset）
│   └── dsh-shiban-bundle/    ← 素材服务 Tool（@local/dsh-shiban-bundle）
└── install.sh                ← 一键部署（推荐，见 §3）
```

> 分发包**不含**教材、`材料/`、`md/`、任何运行数据。素材属教师个人资产，只存在于你自己的素材库根，永不进本仓库。

---

## 2. 部署目标位置

| 组件 | 装到哪 | 说明 |
|---|---|---|
| Agent 预设 + 素材工具 | `$DSH_HOME/profiles/<profile>/node_modules/@local/` | 由 `dsh plugin` 安装，**不要手工拷贝** |
| 技能 | 工作区 `.dsh/skills/` | dsh 技能扫描根 |
| 数据层 | 工作区 `services/` + `bin/` | 纯标准库脚本 |
| **素材库与运行数据** | **你指定的素材库根**（默认 `~/shiban-materials`） | 与本体分离；`SHIBAN_ROOT` 指向它 |

---

## 3. 部署步骤（推荐：install.sh）

```bash
git clone https://github.com/levilou2517/shiban-dist.git
cd shiban-dist
git checkout v0.5.0-test

bash install.sh /path/to/你的工作区 \
     --profile 你的profile名 \
     --assets-root /path/to/素材库
```

脚本做五件事（均为实测通过的路径）：

1. 技能 → `<工作区>/.dsh/skills/`
2. 数据层 → `<工作区>/services/` + `bin/`
3. `dsh plugin --profile <profile> add file:…` 装入两个 bundle
4. **把素材工具的 `cliPath` 写成你工作区的绝对路径、`shibanRoot` 写成素材库根**
5. 在素材库根执行 `shiban-store init`（只建空表，不播种）

**为什么第 4 步必须存在**：素材 bundle 装在 profile 的 `node_modules` 下，与你工作区的 `bin/shiban-store` 没有固定相对关系。任何写死的相对路径在别人机器上都会失效，所以安装期必须填绝对路径。

### 3.1 前置

- 已安装 `dsh` 与 `pnpm`（`dsh plugin` 转发给 pnpm）。
- `python3`（数据层用标准库，无需 pip 安装）。

---

## 4. 部署步骤（给 AI：脚本化）

```
你是部署助手。目标：把 shiban-dist（v0.5.0-test）部署成师伴 Agent。只装空框架，不写任何真实数据。
1. clone 分发包到 <DIST>，确认 tag 为 v0.5.0-test。
2. 直接执行：bash <DIST>/install.sh <工作区> --profile <profile> --assets-root <素材库根> --yes
   （脚本已封装正确机制，不要自行改用 cp 到 ~/.dsh/.agent-presets —— 该目录已无消费者）
3. 校验：
   - <profile>/node_modules/@local/ 下有两个包
   - 其中 dsh-shiban-bundle/cordis.patch.yml 的 cliPath 指向 <工作区>/bin/shiban-store（绝对路径）
   - 工作区 .dsh/skills/ 共 7 个 md = 6 项技能（含 html-material.md）+ 技能地图 README.md
   - 素材库根/data 下有 meta.db 与 reference.db，且无业务数据
4. 提示用户重启 dsh、选对应 profile，会话中 Agent 选「师伴」。
注意：写入 ~/.dsh 与素材库根在 workspace-write 沙箱下可能被拒——按沙箱规则申请升级并说明仅用于部署。
```

---

## 5. 素材库：本版的核心概念

素材是**教师在使用中积累、可跨课复用的外部资产**，与师伴本体分离。

```
<素材库根>/data/assets/
├── <原子id>/main.html + meta.json   ← 单个可复用组件，meta 声明输入契约
├── <编排页id>/main.html             ← 由若干原子组合出的页面
└── vendor/<lib>@<版本>/             ← 内化的第三方库（固定版本）
```

- **备份 = 拷贝这个目录**，它自成整体。
- 换机部署：把素材库根一起拷走，安装时用 `--assets-root` 指过去。
- 素材库根**不应等于工作区**（install.sh 会拒绝），否则素材又混进本体。

### 5.1 常用命令

```bash
export SHIBAN_ROOT=/path/to/素材库
bash bin/shiban-store asset list --kp DNA          # 精确查
bash bin/shiban-store asset suggest --kp 细胞       # 模糊承接（子串）
bash bin/shiban-store asset compose --spec-schema   # 取编排规格契约
bash bin/shiban-store asset compose --spec-file spec.json
```

大段规格请用 `--spec-file` 或 `--spec-stdin`，不要塞进命令行参数。

---

## 6. 数据安全边界

- 分发包**不含**任何班级、学生、教师记录；`init` 只建表，不播种。
- 素材、课堂记录属教师个人资产，只存于素材库根，不进任何公开仓库。

运行数据分层（详见 `skills/README.md`）：

| 层 | 内容 | 可否提交公开仓库 |
|---|---|---|
| **L0 原始材料** | 课堂记录、微格转写、教师笔记（含真实师生对话） | ❌ 绝不可 |
| **L1 进行中工作** | 教案、随堂测、单次评价 | ⚠️ 通常含真实学情 |
| **L2 历史连接** | 归档索引，只含引用与结论 | ❌ 不可，引用了 L0 |

本仓库 `.gitignore` 已预置排除规则。

---

## 7. 验证清单

| 检查 | 期望 |
|---|---|
| `dsh plugin --profile <p> why @local/dsh-shiban-preset` | 已安装 |
| `<profile>/node_modules/@local/dsh-shiban-bundle/cordis.patch.yml` | `cliPath` 为**绝对**路径且文件存在 |
| 工作区 `.dsh/skills/` | 共 7 个 md：6 项技能（含 **html-material.md**）+ 技能地图 README.md |
| `bash bin/shiban-store init` | 返回 `"ok": true`，root 指向素材库根 |
| dsh 会话 Agent 列表 | 出现「师伴」 |
| **浏览器打开一个编排页** | ⚠️ **本版未验证**，须你亲自确认动画、隔离与科学性 |

---

## 8. 常见问题

| 问题 | 处理 |
|---|---|
| 预设列表没有师伴 | 确认装在了**你启动会话所用的 profile**；`dsh plugin --profile <name> add` 的 name 要与启动时一致 |
| 素材 Tool 报"CLI 不存在" | `cordis.patch.yml` 的 `cliPath` 不是绝对路径或指错，重跑 install.sh 第 4 步 |
| 素材 Tool 报 `shibanRoot 必须为绝对路径` | 配置里写了相对路径，改绝对 |
| 素材查不到 | 确认运行环境与 Tool 配置指向**同一个** `SHIBAN_ROOT` |
| 编排页里 vendor 库的素材不渲染 | 已知未验证项：沙箱 `srcdoc` 为不透明源，能否加载相对 `file://` 资源未经浏览器验证。需保留 `data/assets/vendor/` 目录结构，不能单文件搬移 |
| 沙箱拒绝写 `~/.dsh` | 按沙箱规则申请升级权限，仅用于部署框架 |
| 完全重置 | `rm -rf <素材库根>/data` 后重新 `bash bin/shiban-store init` |

---

*本指南只安装师伴空框架，不含任何真实教学数据。数据与素材由使用者首次使用后自行累积在素材库根。*
