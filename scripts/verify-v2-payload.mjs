#!/usr/bin/env node
/**
 * v2 载荷守卫（V5 §9 + 决策 D1）。
 *
 * 这是**内容级**校验，跑在同步产物上，而不是跑在源码上：
 * 它保证 public 里的 v2 载荷真的可发布 —— 文章齐、来源可解析、旧 v1 编号已绝迹、
 * 并且在研究侧缺资产时同步**确实把缺口记下来了**（防止静默跳过）。
 *
 * 用法：node scripts/verify-v2-payload.mjs
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAYLOAD = join(REPO, 'public/research/shenyang/v2');
const REQUIRED = ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09'];
const LEGACY_ID = /^[GC]\d+$/;
/** v1 时代才有的索引字段，v2 载荷里出现即视为回退。 */
const LEGACY_KEYS = ['sourceOfTruth', 'frontendText', 'provenance'];

const failures = [];
function check(ok, message) {
  if (!ok) failures.push(message);
}
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
function list(dir, ext) {
  return existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(ext)).sort() : [];
}

check(existsSync(PAYLOAD), `载荷目录不存在：${PAYLOAD}（先跑 npm run sync）`);
if (failures.length === 0) {
  const report = readJson(join(PAYLOAD, 'sync-report.json'));
  const sources = readJson(join(PAYLOAD, 'sources.json'));
  const manifest = readJson(join(PAYLOAD, 'manifest.json'));

  // 1. 文章齐备、编号正确
  const articleFiles = list(join(PAYLOAD, 'articles'), '.json');
  const ids = articleFiles.map((name) => name.replace(/\.json$/, ''));
  check(ids.length === REQUIRED.length, `文章数为 ${ids.length}，期望 ${REQUIRED.length}`);
  for (const id of REQUIRED) check(ids.includes(id), `缺少文章 ${id}`);
  for (const id of ids) check(!LEGACY_ID.test(id), `载荷出现旧 v1 编号 ${id}`);

  const sourceIds = new Set(sources.map((s) => s.source_id));

  // 2. 每篇文章可发布，且引用的来源都能解析
  for (const name of articleFiles) {
    const article = readJson(join(PAYLOAD, 'articles', name));
    const label = `articles/${name}`;
    check(article.status === 'ACCEPTED', `${label} status=${article.status}`);
    check(typeof article.title === 'string' && article.title.length > 0, `${label} 缺 title`);
    check(Array.isArray(article.sections) && article.sections.length > 0, `${label} 缺 sections`);
    check(Array.isArray(article.source_ids) && article.source_ids.length > 0, `${label} 缺 source_ids`);
    for (const id of article.source_ids ?? []) {
      check(sourceIds.has(id), `${label} 引用未声明来源 ${id}`);
    }
    for (const key of LEGACY_KEYS) {
      check(!(key in article), `${label} 含 v1 字段 ${key}`);
    }
    check(JSON.stringify(article).includes('"G1"') === false, `${label} 出现旧编号 G1`);
  }

  // 3. 同步必须**如实**记录资产缺口（防止静默跳过）
  const figureFiles = new Set(list(join(PAYLOAD, 'figures'), '.png'));
  const tableFiles = new Set(list(join(PAYLOAD, 'tables'), '.csv'));
  const expectedMissingFigures = [];
  const expectedMissingTables = [];
  for (const name of articleFiles) {
    const article = readJson(join(PAYLOAD, 'articles', name));
    for (const figure of article.figures ?? []) {
      if (!figureFiles.has(figure.file)) expectedMissingFigures.push(`${article.id} / ${figure.file}`);
    }
    for (const table of article.tables ?? []) {
      if (!tableFiles.has(table.file)) expectedMissingTables.push(`${article.id} / ${table.file}`);
    }
  }
  const reportedMissingFigures = report.assets.figuresReferencedButMissing;
  const reportedMissingTables = report.assets.tablesReferencedButMissing;
  check(
    reportedMissingFigures.length === expectedMissingFigures.length,
    `缺失图记录数 ${reportedMissingFigures.length} 与实际 ${expectedMissingFigures.length} 不一致（同步可能静默跳过了资产）`,
  );
  check(
    reportedMissingTables.length === expectedMissingTables.length,
    `缺失表记录数 ${reportedMissingTables.length} 与实际 ${expectedMissingTables.length} 不一致（同步可能静默跳过了资产）`,
  );

  // 4. manifest / 报告计数自洽
  check(report.counts.articles === ids.length, 'sync-report 的文章计数与载荷不一致');
  check(report.counts.sources === sources.length, 'sync-report 的来源计数与载荷不一致');
  check(manifest.n_articles === ids.length, 'manifest.n_articles 与载荷不一致');

  // 5. About 的「知识来源」需要 references.md（V5 §52）
  check(existsSync(join(PAYLOAD, 'references.md')), '缺少 references.md（About 知识来源需要）');

  /*
   * 6. 受控列名映射必须覆盖**界面会渲染的每一列**（V5 §36/§76）。
   *    否则会以原始英文 key 泄漏（YEAR / PRICE_MEDIAN / gate_min_r2 …）。
   *    覆盖范围 = v2 载荷的全部表 + 推演页读取的 v1 情景表。
   */
  const metricsSource = readFileSync(join(REPO, 'src/domain/research/v2/metrics.ts'), 'utf8');
  const metaBlock = (metricsSource.split('export const COLUMN_META')[1] ?? '').split('export const VALUE_LABELS')[0];
  const registered = new Set([...metaBlock.matchAll(/^\s{2}([A-Za-z_0-9]+):\s*\{/gm)].map((match) => match[1]));

  const tableDirs = [join(PAYLOAD, 'tables')];
  /*
   * 推演页读取的是 v1 情景表；从页面源码里取出它真正渲染的文件名，
   * 这样检查会跟着页面走，不会因为硬编码清单而失效。
   */
  const scenarioSource = readFileSync(join(REPO, 'src/features/scenario/ScenarioPage.tsx'), 'utf8');
  const scenarioFiles = [...scenarioSource.matchAll(/file: '([^']+\.csv)'/g)].map((match) => match[1]);
  const v1TablesDir = join(REPO, 'public/research/shenyang/tables');
  const usedColumns = new Set();
  for (const dir of tableDirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.csv'))) {
      const header = readFileSync(join(dir, name), 'utf8').split(/\r?\n/)[0].replace(/^\uFEFF/, '');
      header.split(',').forEach((column) => { if (column.trim()) usedColumns.add(column.trim()); });
    }
  }
  for (const name of scenarioFiles) {
    const path = join(v1TablesDir, name);
    check(existsSync(path), `推演页引用的情景表不存在：${name}`);
    if (!existsSync(path)) continue;
    const header = readFileSync(path, 'utf8').split(/\r?\n/)[0].replace(/^\uFEFF/, '');
    header.split(',').forEach((column) => { if (column.trim()) usedColumns.add(column.trim()); });
  }
  const unregistered = [...usedColumns].filter((column) => !registered.has(column));
  check(
    unregistered.length === 0,
    `以下列未登记中文映射，会以原始英文 key 泄漏到界面：${unregistered.join(', ')}`,
  );
}

if (failures.length > 0) {
  console.error('[verify-v2-payload] 失败：');
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log('[verify-v2-payload] 全部通过：9 篇 A01–A09 可发布 · 来源可解析 · 无旧 v1 编号 · 缺口已如实记录');
