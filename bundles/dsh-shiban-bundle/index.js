/**
 * 师伴素材服务 Tool（v0.4.3）
 *
 * 架构：单一数据路径
 *   Agent Tool ──spawn──▶ bin/shiban-store(CLI) ──▶ services/shiban_cli.py ──▶ shiban_store.py
 * 本插件不实现任何数据逻辑，只做「类型化参数 → CLI 调用 → 结构化结果」的桥接，
 * 与 CLI 共享同一实现，避免第二套数据通路漂移。
 *
 * 素材是**外部成长资产**（SHIBAN_ROOT/data/assets/），不随师伴本体迁移。
 */
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 只硬依赖 tools；subprocess 为可选（用 ctx.get 取，缺失时工具给出清晰错误而非整体失效）
export const inject = ['tools'];

// 行配置（patch 的 config 原样传入 apply）：
//   cliPath    启动器路径；相对路径以本 bundle 为基准
//   shibanRoot 数据根 SHIBAN_ROOT；留空则继承运行环境，再空则用 store 默认 ~/.shiban
//   timeoutMs  单次 CLI 调用超时（毫秒），默认 20000
// 不导出 Config：避免与宿主 schema 方言（Schemastery）不一致导致激活失败；
// 参数在 apply 内做防御性校验。
const BUNDLE_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CLI = resolve(BUNDLE_DIR, '../DSH_AI_Edu/bin/shiban-store');

const ASSET_KINDS = ['html', 'report', 'transcript', 'note'];

/** 统一 CLI 调用：argv 数组直传（不经 shell，无注入面），收集输出并解析 JSON。 */
function makeRunner(ctx, config) {
  const cfg = config || {};
  const cliPath = cfg.cliPath ? resolve(BUNDLE_DIR, cfg.cliPath) : DEFAULT_CLI;
  const timeoutMs = cfg.timeoutMs ?? 20000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('timeoutMs 必须是正整数');
  if (cfg.shibanRoot && !isAbsolute(cfg.shibanRoot)) throw new Error('shibanRoot 必须为绝对路径');
  const workspaceRoot = dirname(dirname(cliPath));

  return async function runCli(args, input) {
    const subprocess = ctx.get('subprocess');
    if (!subprocess) {
      return { ok: false, error: '宿主未提供 subprocess 服务，无法调用师伴 CLI' };
    }
    let bash;
    try {
      bash = await subprocess.resolveExecutable('bash');
    } catch (e) {
      return { ok: false, error: `无法解析 bash: ${e && e.message ? e.message : e}` };
    }
    const env = {
      ...process.env,
      // 运行时差异（主 GUI ~/.shiban vs 沙箱 .dsh-sandbox/...）由环境/行配置区分
      ...(cfg.shibanRoot
        ? { SHIBAN_ROOT: cfg.shibanRoot }
        : process.env.SHIBAN_ROOT
          ? { SHIBAN_ROOT: process.env.SHIBAN_ROOT }
          : {}),
    };
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
      ? AbortSignal.timeout(timeoutMs)
      : undefined;
    let handle;
    try {
      handle = subprocess.spawn({
        argv: [bash, cliPath, ...args],
        cwd: workspaceRoot,
        stdio: {
          stdin: input === undefined ? 'ignore' : { data: input },
          stdout: { maxBytes: 8 * 1024 * 1024 },
          stderr: { maxBytes: 1024 * 1024 },
        },
        graceMs: 5000,
        ...(signal ? { signal } : {}),
        env,
      });
    } catch (e) {
      return { ok: false, error: `无法启动 CLI: ${e && e.message ? e.message : e}` };
    }
    let outcome;
    try { outcome = await handle.done; }
    catch (e) { return { ok: false, error: `CLI 执行失败: ${e.message || e}` }; }
    const out = handle.collected.stdout?.readFrom(0);
    const err = handle.collected.stderr?.readFrom(0);
    if (out?.lossy || err?.lossy) return { ok: false, error: 'CLI 输出超过收集上限，请缩小查询范围或通过 CLI 读取文件' };
    const stdout = out?.text || '';
    const stderr = err?.text || '';
    if (!outcome || outcome.exitCode !== 0) {
      return {
        ok: false,
        error: (stderr || '').trim() || `退出码 ${outcome ? outcome.exitCode : '未知'}`,
        code: outcome ? outcome.exitCode : null,
      };
    }
    try {
      return { ok: true, data: JSON.parse(stdout) };
    } catch {
      return { ok: false, error: 'CLI 输出非 JSON', raw: stdout.slice(0, 2000) };
    }
  };
}


export function apply(ctx, config) {
  const runCli = makeRunner(ctx, config);
  const disposers = [];

  const register = (def) => disposers.push(ctx.tools.register(def));

  /** 把 {ok,data} 统一包装为 Tool 返回值与渲染。 */
  const wrap = (label) => (args, result) => {
    if (!result.ok) return { ok: false, tool: label, error: result.error };
    return Array.isArray(result.data)
      ? { ok: true, tool: label, items: result.data, count: result.data.length }
      : { ok: true, tool: label, result: result.data };
  };
  const textOut = (extra) => ({
    schema: {
      type: 'object',
      properties: { ok: { type: 'boolean' }, tool: { type: 'string' }, ...extra },
      additionalProperties: true,
    },
    render: (_args, value) =>
      value && value.ok
        ? [{ type: 'text', text: `${value.tool}: 成功${value.count !== undefined ? `（${value.count} 项）` : ''}` }]
        : [{ type: 'text', text: `${(value && value.tool) || 'tool'}: 失败 — ${(value && value.error) || '未知错误'}` }],
  });

  // ── 素材（外部成长资产）────────────────────────────────────────────
  register({
    name: 'shiban_asset_list',
    description:
      '查询师伴素材库（外部成长资产）。按知识点/类型/学科过滤，返回素材清单。' +
      '这是「先查后建」的第一步：生成新素材前先查是否已有可复用的。',
    parameters: {
      type: 'object',
      properties: {
        knowledge_point: { type: 'string', description: '知识点过滤，如 DNA' },
        kind: { type: 'string', enum: ASSET_KINDS, description: '素材类型' },
        subject: { type: 'string', description: '学科，如 生物' },
      },
      additionalProperties: false,
    },
    output: textOut({ items: { type: 'array' }, count: { type: 'number' } }),
    async execute(args) {
      const argv = ['asset', 'list'];
      if (args.knowledge_point) argv.push('--kp', args.knowledge_point);
      if (args.kind) argv.push('--kind', args.kind);
      if (args.subject) argv.push('--subject', args.subject);
      return wrap('shiban_asset_list')(args, await runCli(argv));
    },
  });

  register({
    name: 'shiban_asset_get',
    description: '取单个素材的完整信息（含 file_path、interface 契约、assembly 编排、reuse_count）。',
    parameters: {
      type: 'object',
      properties: { asset_id: { type: 'string', description: '素材 id' } },
      required: ['asset_id'],
      additionalProperties: false,
    },
    output: textOut({}),
    async execute(args) {
      return wrap('shiban_asset_get')(args, await runCli(['asset', 'get', '--id', args.asset_id]));
    },
  });

  register({
    name: 'shiban_asset_add',
    description:
      '登记一个素材到统一素材库（外部成长资产）。会把源文件拷入数据根并写索引，' +
      '同内容自动查重（返回已有 id）。interface_schema 声明该原子的输入契约。',
    parameters: {
      type: 'object',
      properties: {
        asset_id: { type: 'string', description: '素材 id（字母数字中文下划线连接符）' },
        kind: { type: 'string', enum: ASSET_KINDS, description: '素材类型' },
        title: { type: 'string', description: '标题' },
        file: { type: 'string', description: '源文件绝对路径' },
        subject: { type: 'string' },
        knowledge_point: { type: 'string', description: '对齐课节知识点，便于跨课检索' },
        source_lesson: { type: 'string' },
        tags: { type: 'string', description: '逗号分隔' },
        interface_schema: { type: 'object', description: '原子输入契约（JSON Schema 片段）' },
        parent_asset: { type: 'string', description: '若本素材是更大页面的组件，填宿主页 id' },
        assembly: { type: 'object', description: '若本素材是编排页面，记录引用子组件与喂数' },
      },
      required: ['asset_id', 'kind', 'title', 'file'],
      additionalProperties: false,
    },
    output: textOut({}),
    async execute(args) {
      const argv = ['asset', 'add', '--id', args.asset_id, '--kind', args.kind, '--title', args.title, '--file', args.file];
      if (args.subject) argv.push('--subject', args.subject);
      if (args.knowledge_point) argv.push('--kp', args.knowledge_point);
      if (args.source_lesson) argv.push('--lesson', args.source_lesson);
      if (args.tags) argv.push('--tags', args.tags);
      if (args.interface_schema) argv.push('--params', JSON.stringify({ interface: args.interface_schema }));
      if (args.parent_asset) argv.push('--parent', args.parent_asset);
      if (args.assembly) argv.push('--assembly', JSON.stringify(args.assembly));
      return wrap('shiban_asset_add')(args, await runCli(argv));
    },
  });

  register({
    name: 'shiban_asset_reuse',
    description: '声明复用某素材（reuse_count +1），返回其 file_path。编排页面引用既有原子时记账。',
    parameters: {
      type: 'object',
      properties: { asset_id: { type: 'string' } },
      required: ['asset_id'],
      additionalProperties: false,
    },
    output: textOut({}),
    async execute(args) {
      return wrap('shiban_asset_reuse')(args, await runCli(['asset', 'reuse', '--id', args.asset_id]));
    },
  });

  register({
    name: 'shiban_asset_scan',
    description: '扫描数据根下现存产物并统一索引（只登记不移动）。dry_run=true 仅预览。',
    parameters: {
      type: 'object',
      properties: { dry_run: { type: 'boolean' } },
      additionalProperties: false,
    },
    output: textOut({}),
    async execute(args) {
      const argv = ['asset', 'scan'];
      if (args.dry_run) argv.push('--dry-run');
      return wrap('shiban_asset_scan')(args, await runCli(argv));
    },
  });

  register({
    name: 'shiban_asset_suggest',
    description:
      '先查后建第一步（只读）：按知识点/类型/学科查库存素材，' +
      'html 原子附 interface 输入契约，返回建议编排方式。' +
      '把方案转述给教师确认预期交互后，再用 shiban_asset_compose 编排。',
    parameters: {
      type: 'object',
      properties: {
        knowledge_point: { type: 'string', description: '知识点，如 DNA复制' },
        kind: { type: 'string', enum: ASSET_KINDS, description: '素材类型过滤' },
        subject: { type: 'string', description: '学科过滤' },
      },
      additionalProperties: false,
    },
    output: textOut({}),
    async execute(args) {
      const argv = ['asset', 'suggest'];
      if (args.knowledge_point) argv.push('--kp', args.knowledge_point);
      if (args.kind) argv.push('--kind', args.kind);
      if (args.subject) argv.push('--subject', args.subject);
      return wrap('shiban_asset_suggest')(args, await runCli(argv));
    },
  });

  register({
    name: 'shiban_asset_compose_schema',
    description: '读取当前编排规格的 JSON Schema；调用 compose 前用它发现必填字段、布局和 sections 结构。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: textOut({}),
    async execute(args) {
      return wrap('shiban_asset_compose_schema')(args, await runCli(['asset', 'compose', '--spec-schema']));
    },
  });

  register({
    name: 'shiban_asset_compose',
    description:
      '编排页面：按各素材 interface 契约校验输入，以独立 srcdoc 文档隔离实例，生成离线单文件 HTML。' +
      '→ 自包含单文件 HTML 落 data/assets/<page_id>/main.html 并入库。' +
      '编排即复用：引用原子 reuse_count+1、parent_asset 指回本页；页面 assembly 记引用与喂数。' +
      '先查库；布局或输入不明确时询问教师，已明确时直接编排。完整规格用 shiban_asset_compose_schema 查询。',
    // spec 契约单一真源：store `asset compose --spec-schema` 返回的 JSON Schema 派生
    parameters: {
      type: 'object',
      properties: {
        spec: {
          type: 'object',
          description: '编排规格：先调用 shiban_asset_compose_schema 获取必填字段与完整 JSON Schema。',
        },
      },
      required: ['spec'],
      additionalProperties: false,
    },
    output: textOut({}),
    async execute(args) {
      return wrap('shiban_asset_compose')(
        args,
        await runCli(['asset', 'compose', '--spec-stdin'], JSON.stringify(args.spec)),
      );
    },
  });

  // ── 原始证据（L0，只追加）──────────────────────────────────────────
  register({
    name: 'shiban_raw_list',
    description: '列出原始证据（课堂记录/微格转写/笔记）。分析转录前先查盘，避免依赖对话内粘贴。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: textOut({ items: { type: 'array' }, count: { type: 'number' } }),
    async execute(args) {
      return wrap('shiban_raw_list')(args, await runCli(['raw', 'list']));
    },
  });

  register({
    name: 'shiban_raw_read',
    description: '读取一份原始证据的全文（name 来自 shiban_raw_list）。',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
    },
    output: textOut({}),
    async execute(args) {
      return wrap('shiban_raw_read')(args, await runCli(['raw', 'read', '--name', args.name]));
    },
  });

  register({
    name: 'shiban_raw_save',
    description:
      '落盘一份原始证据（只追加、同名拒绝覆盖；更正请另存新版本名）。' +
      '用户粘贴转录/课堂记录时应先落盘再分析，保证证据可追溯。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '文件名（含扩展名，如 l1_20261003.transcript.txt）' },
        text: { type: 'string', description: '证据全文' },
      },
      required: ['name', 'text'],
      additionalProperties: false,
    },
    output: textOut({}),
    async execute(args) {
      return wrap('shiban_raw_save')(args, await runCli(['raw', 'save', '--name', args.name, '--stdin'], args.text));
    },
  });

  return () => {
    for (const d of disposers) {
      try {
        d();
      } catch {
        /* 卸载期忽略单个 disposer 异常 */
      }
    }
  };
}
