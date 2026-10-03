# 师伴素材工具桥接

本 bundle 只把宿主工具调用转成 CLI 调用，素材数据仍归独立 `SHIBAN_ROOT`。

## 路径配置

`cliPath` 可以是绝对路径，也可以相对 bundle 目录；本开发工作区默认指向 `../DSH_AI_Edu/bin/shiban-store`，不依赖个人 HOME 或 lab 副本。独立部署时必须配置实际安装的启动器路径。

`shibanRoot` 留空时继承环境 `SHIBAN_ROOT`，未设置时沿用 store 的用户级默认 `~/.shiban`。显式配置必须是绝对路径。不复制教师素材进插件目录，不安装或升级素材依赖。

## 契约与大输入

`shiban_asset_compose_schema` 返回 store 当前 `compose_spec_schema()`，它是编排规格的唯一真源。模型先查 schema，再提交 `shiban_asset_compose({spec})`。这是显式契约发现，不是动态生成第二份工具参数 schema。

compose 规格和 raw 保存全文通过 stdin 传输，不作为单个命令行参数。输出截断、子进程拒绝或非零退出均返回失败。超时由 `timeoutMs` 控制，默认 20000ms。

## 基础检查

```bash
node --check dsh-shiban-bundle/index.js
node --test dsh-shiban-bundle/tests/interface.test.js
```

测试使用模拟 subprocess 服务，不修改真实素材库，也不证明当前 GUI 已挂载更新。此轮不执行插件安装。
