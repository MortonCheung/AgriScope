#!/usr/bin/env node
/**
 * 沈阳 v2 研究导出 → 前端 public 载荷。
 *
 * 职责边界（V5 §7）：**只做校验 → 复制 → 产出报告，不做任何内容创作。**
 * 不解析 markdown、不拼接文章、不推断单位、不改数字。
 *
 * 分层 fail-fast（V5 决策 D1）：
 *   硬失败（exit 1）——缺文章 JSON、文章缺必需字段、source_id 未声明、manifest 与文章不一致；
 *   记录并继续    ——被引用的 figure / table 资产在研究侧不存在。
 *                    理由：资产缺失是研究侧的发布进度问题，不是前端缺陷；
 *                    静默跳过才是禁止的，所以缺口会写进 payload 报告 + docs 并打印摘要。
 *
 * 用法：
 *   node scripts/sync-shenyang-v2.mjs
 *   SHENYANG_V2_ROOT=/path/to/city_data/shenyang node scripts/sync-shenyang-v2.mjs
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, copyFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

/** 研究侧根目录（V5 审计修正：真实路径带 city_data 一层）。 */
const RESEARCH_ROOT = process.env.SHENYANG_V2_ROOT
  ? resolve(process.env.SHENYANG_V2_ROOT)
  : resolve(REPO, '..', 'city_data', 'shenyang');

const EXPORT_DIR = join(RESEARCH_ROOT, 'workspace/research_v2/exports/frontend');
const REPORTS_DIR = join(RESEARCH_ROOT, 'reports/v2');
/** 输出根：先落在 v2/ 子目录，与旧 v1 载荷并存，避免过渡期把站点弄坏（V5 计划调整）。 */
const OUT_ROOT = join(REPO, 'public/research/shenyang/v2');
const GAPS_DOC = join(REPO, 'docs/SHENYANG_V2_ASSET_GAPS.md');

/** 必须齐备的文章（V5 §8）。缺一篇即失败，不静默继续。 */
const REQUIRED_ARTICLES = ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09'];
/** 受控状态枚举：只有被研究侧接受的稿件才允许进入前端。 */
const ACCEPTED_STATUS = new Set(['ACCEPTED']);
/** 旧 v1 编号，绝不允许出现在 v2 载荷里（V5 §9）。 */
const LEGACY_ID = /^[GC]\d+$/;

const hardErrors = [];
const gaps = { missingFigures: [], missingTables: [] };

function fail(message) {
  hardErrors.push(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function listFiles(dir, ext) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(ext)).sort();
}

function copyInto(fromDir, toDir, names) {
  mkdirSync(toDir, { recursive: true });
  for (const name of names) copyFileSync(join(fromDir, name), join(toDir, name));
}

// ---------------------------------------------------------------- 1. 读取源

if (!existsSync(EXPORT_DIR)) {
  console.error(`[sync:v2] 研究导出不存在：${EXPORT_DIR}`);
  console.error('[sync:v2] 可用 SHENYANG_V2_ROOT 指定 city_data/shenyang 的位置。');
  process.exit(1);
}

const sourceManifest = readJson(join(EXPORT_DIR, 'manifest.json'));
const sources = readJson(join(EXPORT_DIR, 'sources.json'));

if (!Array.isArray(sources)) fail('sources.json 不是数组');
const declaredSourceIds = new Set(sources.map((s) => s.source_id));
for (const source of sources) {
  if (!source.source_id) fail('sources.json 存在缺少 source_id 的条目');
  if (!source.publisher) fail(`来源 ${source.source_id} 缺少 publisher（机构）`);
}

// ---------------------------------------------------------------- 2. 逐篇校验

const manifestIds = (sourceManifest.articles ?? []).map((a) => a.id);
for (const id of REQUIRED_ARTICLES) {
  if (!manifestIds.includes(id)) fail(`manifest 缺少必需文章 ${id}`);
}
for (const id of manifestIds) {
  if (LEGACY_ID.test(id)) fail(`manifest 出现旧 v1 编号 ${id}`);
}

const articles = [];
for (const entry of sourceManifest.articles ?? []) {
  const path = join(EXPORT_DIR, entry.file);
  if (!existsSync(path)) {
    fail(`文章文件不存在：${entry.file}（${entry.id}）`);
    continue;
  }
  const article = readJson(path);

  if (article.id !== entry.id) fail(`${entry.file} 的 id(${article.id}) 与 manifest(${entry.id}) 不一致`);
  if (!article.title) fail(`${entry.id} 缺少 title`);
  if (!Array.isArray(article.sections) || article.sections.length === 0) fail(`${entry.id} 缺少 sections`);
  if (!ACCEPTED_STATUS.has(article.status)) fail(`${entry.id} 的 status=${article.status} 不是 ACCEPTED，拒绝发布`);
  if ((entry.n_sections ?? -1) !== article.sections.length) fail(`${entry.id} manifest 的 n_sections 与实际不一致`);

  for (const sourceId of article.source_ids ?? []) {
    if (!declaredSourceIds.has(sourceId)) fail(`${entry.id} 引用了未声明的来源 ${sourceId}`);
  }
  for (const figure of article.figures ?? []) {
    if (!existsSync(join(REPORTS_DIR, 'figures', figure.file))) gaps.missingFigures.push(`${entry.id} / ${figure.file}`);
  }
  for (const table of article.tables ?? []) {
    if (!existsSync(join(REPORTS_DIR, 'tables', table.file))) gaps.missingTables.push(`${entry.id} / ${table.file}`);
  }

  articles.push({ entry, article });
}

if (articles.length !== REQUIRED_ARTICLES.length) {
  fail(`可发布文章数为 ${articles.length}，期望 ${REQUIRED_ARTICLES.length}`);
}

if (hardErrors.length > 0) {
  console.error('[sync:v2] 硬失败，未写入任何文件：');
  for (const error of hardErrors) console.error(`  ✗ ${error}`);
  process.exit(1);
}

// ---------------------------------------------------------------- 3. 复制

rmSync(OUT_ROOT, { recursive: true, force: true });
mkdirSync(OUT_ROOT, { recursive: true });

copyInto(EXPORT_DIR, OUT_ROOT, ['manifest.json', 'sources.json']);
copyInto(join(EXPORT_DIR, 'articles'), join(OUT_ROOT, 'articles'), listFiles(join(EXPORT_DIR, 'articles'), '.json'));
copyInto(join(REPORTS_DIR, 'figures'), join(OUT_ROOT, 'figures'), listFiles(join(REPORTS_DIR, 'figures'), '.png'));
copyInto(join(REPORTS_DIR, 'tables'), join(OUT_ROOT, 'tables'), listFiles(join(REPORTS_DIR, 'tables'), '.csv'));
if (existsSync(join(REPORTS_DIR, 'references.md'))) {
  copyFileSync(join(REPORTS_DIR, 'references.md'), join(OUT_ROOT, 'references.md'));
}

// ---------------------------------------------------------------- 4. 产出报告

const presentTables = listFiles(join(OUT_ROOT, 'tables'), '.csv');
const presentFigures = listFiles(join(OUT_ROOT, 'figures'), '.png');
const referencedTables = new Set(articles.flatMap(({ article }) => (article.tables ?? []).map((t) => t.file)));
const referencedFigures = new Set(articles.flatMap(({ article }) => (article.figures ?? []).map((f) => f.file)));

const report = {
  generatedBy: 'scripts/sync-shenyang-v2.mjs',
  sourceRoot: EXPORT_DIR,
  outRoot: 'public/research/shenyang/v2',
  articles: articles.map(({ article }) => ({
    id: article.id,
    title: article.title,
    sections: article.sections.length,
    sources: (article.source_ids ?? []).length,
    figures: (article.figures ?? []).map((f) => f.file),
    tables: (article.tables ?? []).map((t) => t.file),
  })),
  counts: {
    articles: articles.length,
    sources: sources.length,
    figuresCopied: presentFigures.length,
    tablesCopied: presentTables.length,
  },
  assets: {
    figuresReferencedButMissing: gaps.missingFigures,
    tablesReferencedButMissing: gaps.missingTables,
    tablesPresentButUnreferenced: presentTables.filter((name) => !referencedTables.has(name)),
    figuresPresentButUnreferenced: presentFigures.filter((name) => !referencedFigures.has(name)),
  },
  /** 研究侧在 manifest 里声明的两条导出约定；语义未文档化，这里只如实转述，不做前端推断。 */
  exportContracts: {
    article_end_marker_required: sourceManifest.article_end_marker_required,
    no_substring_summary: sourceManifest.no_substring_summary,
  },
};
writeFileSync(join(OUT_ROOT, 'sync-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const gapsDoc = `# SHENYANG V2 ASSET GAPS

由 \`scripts/sync-shenyang-v2.mjs\` 自动生成，请勿手改（重新运行同步即可刷新）。

同步策略（V5 决策 D1）：文章 / 来源 / manifest 缺失 = 硬失败；**被引用的图表资产缺失 = 记录并继续**。
资产缺失是研究侧的发布进度问题，不是前端缺陷；前端不会为空缺的资产造内容。

## 被引用但研究侧尚未导出

| 类型 | 引用位置 |
|---|---|
${[...gaps.missingFigures.map((p) => `| figure | ${p} |`), ...gaps.missingTables.map((p) => `| table | ${p} |`)].join('\n') || '| — | 无 |'}

## 已导出但暂无文章引用

| 类型 | 文件 |
|---|---|
${[...presentFigures.filter((n) => !referencedFigures.has(n)).map((n) => `| figure | ${n} |`), ...presentTables.filter((n) => !referencedTables.has(n)).map((n) => `| table | ${n} |`)].join('\n') || '| — | 无 |'}

## 计数

- 文章 ${articles.length}（A01–A09）
- 来源 ${sources.length}
- 图 ${presentFigures.length}（引用 ${referencedFigures.size}）
- 表 ${presentTables.length}（引用 ${referencedTables.size}）
`;
writeFileSync(GAPS_DOC, gapsDoc, 'utf8');

console.log('[sync:v2] 已写出 public/research/shenyang/v2');
console.log(`  文章 ${articles.length} · 来源 ${sources.length} · 图 ${presentFigures.length} · 表 ${presentTables.length}`);
if (gaps.missingFigures.length || gaps.missingTables.length) {
  console.warn(`  ⚠ 被引用但缺失的资产 ${gaps.missingFigures.length + gaps.missingTables.length} 个（已记入 docs/SHENYANG_V2_ASSET_GAPS.md）`);
  for (const item of [...gaps.missingFigures, ...gaps.missingTables]) console.warn(`    - ${item}`);
}
