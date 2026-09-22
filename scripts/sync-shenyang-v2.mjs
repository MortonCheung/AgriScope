#!/usr/bin/env node
/**
 * 沈阳研究导出 → 前端 public 载荷。
 *
 * 职责边界（V5 §7 / 本轮 §20）：**只做校验 → 复制 → 产出报告，不做任何内容创作。**
 * 不解析 markdown、不拼接文章、不推断单位、不改数字、不重算结果。
 *
 * 目录布局（本轮 §6）：一切按城市分目录，不再把 shenyang 或 v2 写死在路径里。
 *   public/research/<cityId>/index.json        正式文章树（canonical，见 §7）
 *   public/research/<cityId>/manifest.json     研究侧清单
 *   public/research/<cityId>/articles/*.json   文章（当前为 A01…A09 兼容载荷）
 *   public/research/<cityId>/figures/*.png
 *   public/research/<cityId>/tables/*.csv
 *   public/research/<cityId>/sources.json
 *   public/research/<cityId>/references.md
 *   public/research/<cityId>/sync-report.json
 *   public/research/<cityId>/integrity.json    SHA-256 完整性清单（§20）
 *   public/scenario/<cityId>/*.csv             推演（与「研究」不同产品入口，§30）
 *
 * 资产来源是**多来源**的（本轮 §20 修正）：
 *   文章 / manifest / sources → exports/frontend
 *   表 / 图                   → reports/v2（出版物口径，优先）
 *                            → workspace/research_v2/results（研究管线口径，兜底）
 * 两条来源的同名文件已逐字节比对一致；不一致会在报告里单独列出，
 * 绝不静默择一。
 *
 * 分层 fail-fast：
 *   硬失败（exit 1）——缺文章 JSON、文章缺必需字段、source_id 未声明、manifest 与文章不一致；
 *   记录并继续    ——被引用的资产在研究侧任何来源都找不到。
 *
 * 用法：
 *   node scripts/sync-shenyang-v2.mjs
 *   SHENYANG_V2_ROOT=/path/to/city_data/shenyang node scripts/sync-shenyang-v2.mjs
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, copyFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

/** 城市配置：新增城市只加一行，不改下面的任何逻辑。 */
const CITY = {
  cityId: process.env.AGSCOPE_CITY_ID ?? 'shenyang',
  researchRoot: process.env.SHENYANG_V2_ROOT
    ? resolve(process.env.SHENYANG_V2_ROOT)
    : resolve(REPO, '..', 'city_data', process.env.AGSCOPE_CITY_ID ?? 'shenyang'),
};

const EXPORT_DIR = join(CITY.researchRoot, 'workspace/research_v2/exports/frontend');
const REPORTS_DIR = join(CITY.researchRoot, 'reports/v2');
/** 表 / 图的来源，按优先级排列：出版物口径优先，研究管线口径兜底。 */
const TABLE_SOURCES = [
  join(REPORTS_DIR, 'tables'),
  join(CITY.researchRoot, 'workspace/research_v2/results/tables'),
];
const FIGURE_SOURCES = [
  join(REPORTS_DIR, 'figures'),
  join(CITY.researchRoot, 'workspace/research_v2/results/figures'),
];
/** 推演表的来源（v1 场景输出；与研究文章是不同产品入口）。 */
const SCENARIO_SOURCES = [
  join(CITY.researchRoot, 'reports/tables'),
  join(CITY.researchRoot, 'workspace/outputs/tables'),
];
const SCENARIO_TABLES = ['counterfactual_gate.csv', 'counterfactual_severity.csv', 'counterfactual_buffer.csv'];

const OUT_ROOT = join(REPO, 'public/research', CITY.cityId);
const SCENARIO_OUT = join(REPO, 'public/scenario', CITY.cityId);
const TREE_SOURCE = join(REPO, 'src/domain/research/catalog', `${CITY.cityId}-tree.json`);
const GAPS_DOC = join(REPO, 'docs/SHENYANG_V2_ASSET_GAPS.md');
const INTEGRITY_DOC = join(REPO, 'docs/DATA_INTEGRITY_REPORT.md');

/** 必须齐备的文章（§8）。缺一篇即失败，不静默继续。 */
const REQUIRED_ARTICLES = ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09'];
const ACCEPTED_STATUS = new Set(['ACCEPTED']);
/** 旧 v1 编号，绝不允许出现在新载荷里。 */
const LEGACY_ID = /^[GC]\d+$/;
/** 内部预览文件不对外发布。 */
const INTERNAL_NAME = /^_/;

const hardErrors = [];
const gaps = { missingFigures: [], missingTables: [], missingScenario: [] };
/** 同名文件在两个来源里内容不一致的情况，必须显式报告。 */
const sourceConflicts = [];

function fail(message) { hardErrors.push(message); }
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function sha256(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
function listNames(dir, ext) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(ext) && !INTERNAL_NAME.test(name)).sort();
}

/** 在多个来源里按优先级解析一个资产；返回选中的绝对路径与来源目录。 */
function resolveAsset(sources, name) {
  for (const dir of sources) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) return { path: candidate, from: dir };
  }
  return null;
}

/** 合并多个来源的文件名；同名但内容不同的，记入冲突清单并保留优先级更高者。 */
function mergeAssetNames(sources, ext) {
  const chosen = new Map();
  for (const dir of sources) {
    for (const name of listNames(dir, ext)) {
      if (!chosen.has(name)) { chosen.set(name, dir); continue; }
      const incumbent = join(chosen.get(name), name);
      const contender = join(dir, name);
      if (sha256(incumbent) !== sha256(contender)) {
        sourceConflicts.push({ name, kept: incumbent, other: contender });
      }
    }
  }
  return chosen;
}

function copyFile(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

/** CSV 的规模摘要（§20：rows / columns / headers / sha256）。 */
function csvSummary(path) {
  const text = readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/);
  const header = (lines[0] ?? '').replace(/^\uFEFF/, '');
  const headers = header.split(',').map((cell) => cell.trim()).filter(Boolean);
  const rows = lines.slice(1).filter((line) => line.trim() !== '').length;
  return { rows, columns: headers.length, headers };
}

// ---------------------------------------------------------------- 1. 读取源

if (!existsSync(EXPORT_DIR)) {
  console.error(`[sync] 研究导出不存在：${EXPORT_DIR}`);
  console.error('[sync] 可用 SHENYANG_V2_ROOT 指定 city_data/<city> 的位置。');
  process.exit(1);
}
if (!existsSync(TREE_SOURCE)) {
  console.error(`[sync] 正式文章树不存在：${TREE_SOURCE}（见 §7，必须先建立 canonical catalog）`);
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
  if (!existsSync(path)) { fail(`文章文件不存在：${entry.file}（${entry.id}）`); continue; }
  const article = readJson(path);

  if (article.id !== entry.id) fail(`${entry.file} 的 id(${article.id}) 与 manifest(${entry.id}) 不一致`);
  if (!article.title) fail(`${entry.id} 缺少 title`);
  if (!Array.isArray(article.sections) || article.sections.length === 0) fail(`${entry.id} 缺少 sections`);
  if (!ACCEPTED_STATUS.has(article.status)) fail(`${entry.id} 的 status=${article.status} 不是 ACCEPTED，拒绝发布`);
  if ((entry.n_sections ?? -1) !== article.sections.length) fail(`${entry.id} manifest 的 n_sections 与实际不一致`);
  for (const sourceId of article.source_ids ?? []) {
    if (!declaredSourceIds.has(sourceId)) fail(`${entry.id} 引用了未声明的来源 ${sourceId}`);
  }
  articles.push({ entry, article });
}
if (articles.length !== REQUIRED_ARTICLES.length) fail(`可发布文章数为 ${articles.length}，期望 ${REQUIRED_ARTICLES.length}`);

if (hardErrors.length > 0) {
  console.error('[sync] 硬失败，未写入任何文件：');
  for (const error of hardErrors) console.error(`  ✗ ${error}`);
  process.exit(1);
}

// ---------------------------------------------------------------- 3. 解析资产（多来源）

const tableNames = mergeAssetNames(TABLE_SOURCES, '.csv');
const figureNames = mergeAssetNames(FIGURE_SOURCES, '.png');

/** 文章声明但任何来源都没有的资产 → 记录 gap（不静默、不造）。 */
const referencedTables = new Set(articles.flatMap(({ article }) => (article.tables ?? []).map((t) => t.file)));
const referencedFigures = new Set(articles.flatMap(({ article }) => (article.figures ?? []).map((f) => f.file)));
for (const name of referencedTables) if (!tableNames.has(name)) gaps.missingTables.push(name);
for (const name of referencedFigures) if (!figureNames.has(name)) gaps.missingFigures.push(name);

// ---------------------------------------------------------------- 4. 复制

rmSync(OUT_ROOT, { recursive: true, force: true });
mkdirSync(OUT_ROOT, { recursive: true });

const integrity = { generatedBy: 'scripts/sync-shenyang-v2.mjs', cityId: CITY.cityId, files: [] };

function record(kind, fromPath, toPath, extra = {}) {
  const sourceHash = sha256(fromPath);
  const copyHash = sha256(toPath);
  if (sourceHash !== copyHash) fail(`复制后 hash 不一致：${toPath}`);
  integrity.files.push({
    kind,
    path: toPath.replace(`${REPO}/`, ''),
    source: fromPath.replace(`${REPO}/`, ''),
    bytes: statSync(toPath).size,
    sha256: copyHash,
    ...extra,
  });
}

// 文章树（canonical，§7）
copyFile(TREE_SOURCE, join(OUT_ROOT, 'index.json'));
record('tree', TREE_SOURCE, join(OUT_ROOT, 'index.json'));

copyFile(join(EXPORT_DIR, 'manifest.json'), join(OUT_ROOT, 'manifest.json'));
record('manifest', join(EXPORT_DIR, 'manifest.json'), join(OUT_ROOT, 'manifest.json'));
copyFile(join(EXPORT_DIR, 'sources.json'), join(OUT_ROOT, 'sources.json'));
record('sources', join(EXPORT_DIR, 'sources.json'), join(OUT_ROOT, 'sources.json'));

for (const name of listNames(join(EXPORT_DIR, 'articles'), '.json')) {
  const from = join(EXPORT_DIR, 'articles', name);
  const to = join(OUT_ROOT, 'articles', name);
  copyFile(from, to);
  record('article', from, to);
}

for (const [name, dir] of tableNames) {
  const from = join(dir, name);
  const to = join(OUT_ROOT, 'tables', name);
  copyFile(from, to);
  record('table', from, to, csvSummary(to));
}
for (const [name, dir] of figureNames) {
  const from = join(dir, name);
  const to = join(OUT_ROOT, 'figures', name);
  copyFile(from, to);
  record('figure', from, to);
}

const referencesSource = join(REPORTS_DIR, 'references.md');
if (existsSync(referencesSource)) {
  copyFile(referencesSource, join(OUT_ROOT, 'references.md'));
  record('references', referencesSource, join(OUT_ROOT, 'references.md'));
} else {
  gaps.missingTables.push('references.md');
}

// 推演表：与研究树分开的入口（§30）
rmSync(SCENARIO_OUT, { recursive: true, force: true });
mkdirSync(SCENARIO_OUT, { recursive: true });
for (const name of SCENARIO_TABLES) {
  const found = resolveAsset(SCENARIO_SOURCES, name);
  if (!found) { gaps.missingScenario.push(name); continue; }
  const to = join(SCENARIO_OUT, name);
  copyFile(found.path, to);
  record('scenario', found.path, to, csvSummary(to));
}

// ---------------------------------------------------------------- 5. 产出报告

const presentTables = listNames(join(OUT_ROOT, 'tables'), '.csv');
const presentFigures = listNames(join(OUT_ROOT, 'figures'), '.png');

const report = {
  generatedBy: 'scripts/sync-shenyang-v2.mjs',
  cityId: CITY.cityId,
  sourceRoot: EXPORT_DIR,
  outRoot: `public/research/${CITY.cityId}`,
  assetSources: { tables: TABLE_SOURCES, figures: FIGURE_SOURCES },
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
    scenarioTablesCopied: listNames(SCENARIO_OUT, '.csv').length,
  },
  assets: {
    figuresReferencedButMissing: gaps.missingFigures,
    tablesReferencedButMissing: gaps.missingTables,
    scenarioReferencedButMissing: gaps.missingScenario,
    tablesPresentButUnreferenced: presentTables.filter((name) => !referencedTables.has(name)),
    figuresPresentButUnreferenced: presentFigures.filter((name) => !referencedFigures.has(name)),
    /** 同名资产在两条来源里内容不同：绝不静默择一。 */
    sourceConflicts: sourceConflicts.map((c) => c.name),
  },
  exportContracts: {
    article_end_marker_required: sourceManifest.article_end_marker_required,
    no_substring_summary: sourceManifest.no_substring_summary,
  },
};
writeFileSync(join(OUT_ROOT, 'sync-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

integrity.counts = report.counts;
integrity.gaps = report.assets;
writeFileSync(join(OUT_ROOT, 'integrity.json'), `${JSON.stringify(integrity, null, 1)}\n`, 'utf8');

// ---------------------------------------------------------------- 6. 文档

const gapRows = [
  ...gaps.missingFigures.map((name) => `| figure | ${name} |`),
  ...gaps.missingTables.map((name) => `| table | ${name} |`),
  ...gaps.missingScenario.map((name) => `| scenario | ${name} |`),
];
const unreferencedRows = [
  ...presentFigures.filter((n) => !referencedFigures.has(n)).map((n) => `| figure | ${n} |`),
  ...presentTables.filter((n) => !referencedTables.has(n)).map((n) => `| table | ${n} |`),
];

writeFileSync(GAPS_DOC, `# 沈阳 v2 资产缺口

由 \`scripts/sync-shenyang-v2.mjs\` 自动生成，请勿手改（重新运行同步即可刷新）。

同步策略：文章 / 来源 / manifest 缺失 = 硬失败；**被引用的图表资产缺失 = 记录并继续**。
资产缺失是研究侧的发布进度问题，不是前端缺陷；前端不会为空缺的资产造内容，也不会去 v1 管线里找替身。

## 被引用但任何来源都没有

| 类型 | 文件 |
|---|---|
${gapRows.join('\n') || '| — | 无 |'}

## 已导出但暂无文章引用

| 类型 | 文件 |
|---|---|
${unreferencedRows.join('\n') || '| — | 无 |'}

## 资产来源

| 目录 | 角色 |
|---|---|
| \`reports/v2/tables\`、\`reports/v2/figures\` | 出版物口径，优先 |
| \`workspace/research_v2/results/tables\`、\`figures\` | 研究管线口径，兜底 |

同名文件逐字节比对：本次冲突 ${sourceConflicts.length} 个。
${sourceConflicts.map((c) => `- ⚠ ${c.name}：保留 ${c.kept}，另有 ${c.other}`).join('\n')}

## 计数

- 文章 ${articles.length}（A01–A09）
- 来源 ${sources.length}
- 图 ${presentFigures.length}（引用 ${referencedFigures.size}）
- 表 ${presentTables.length}（引用 ${referencedTables.size}）
- 推演表 ${report.counts.scenarioTablesCopied}
`, 'utf8');

const csvFiles = integrity.files.filter((f) => f.kind === 'table' || f.kind === 'scenario');
writeFileSync(INTEGRITY_DOC, `# 数据完整性报告（沈阳）

由 \`scripts/sync-shenyang-v2.mjs\` 生成，\`scripts/verify-research-integrity.mjs\` 复核。
口径（§20）：**源文件 SHA-256 必须等于 public 副本 SHA-256**；CSV 额外记录行数与列名。

- 文件总数 ${integrity.files.length}
- CSV ${csvFiles.length}（表 ${report.counts.tablesCopied} + 推演 ${report.counts.scenarioTablesCopied}）
- 图 ${report.counts.figuresCopied}
- 文章 ${report.counts.articles}
- 来源 ${report.counts.sources}

| 文件 | 字节 | 行数 | 列数 | sha256 |
|---|---|---|---|---|
${csvFiles.map((f) => `| ${f.path} | ${f.bytes} | ${f.rows} | ${f.columns} | ${f.sha256.slice(0, 16)}… |`).join('\n')}

## 缺口

| 类型 | 文件 |
|---|---|
${gapRows.join('\n') || '| — | 无 |'}
`, 'utf8');

console.log(`[sync] 已写出 public/research/${CITY.cityId}`);
console.log(`  文章 ${report.counts.articles} · 来源 ${report.counts.sources} · 图 ${presentFigures.length} · 表 ${presentTables.length} · 推演表 ${report.counts.scenarioTablesCopied}`);
if (gapRows.length) {
  console.warn(`  ⚠ 任何来源都找不到的资产 ${gapRows.length} 个（已记入 docs/SHENYANG_V2_ASSET_GAPS.md）`);
  for (const row of gapRows) console.warn(`    - ${row}`);
}
if (sourceConflicts.length) {
  console.warn(`  ⚠ 同名资产内容不一致 ${sourceConflicts.length} 个，已按优先级保留并在文档中列出`);
  for (const c of sourceConflicts) console.warn(`    - ${c.name}`);
}
