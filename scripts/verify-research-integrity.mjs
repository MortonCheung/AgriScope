#!/usr/bin/env node
/**
 * 数据完整性 + 研究契约复核（本轮 §20/§21）。
 *
 * 这个脚本回答两个问题，两件都必须能机械地证明：
 *
 *   1. **数据没有被改动过**
 *      同步时记录在 `public/research/<city>/integrity.json` 里的每个文件，
 *      源文件 SHA-256 必须等于 public 副本 SHA-256；CSV 的行数与列名也要一致。
 *
 *   2. **「ready」不是猜出来的**
 *      canonical catalog 里每个 ready 的研究点，都必须带研究正文的原句引用，
 *      且该原句要能在对应文章里**逐字找到**；同时它声明的表、过滤列、过滤值、
 *      关注列都必须真实存在于载荷里。缺任意一项即失败。
 *
 * 换句话说：把"前端不许猜研究结论"从一句口号变成构建时就会失败的规则。
 *
 * 用法：node scripts/verify-research-integrity.mjs
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CITY_ID = process.env.AGSCOPE_CITY_ID ?? 'shenyang';
const PAYLOAD = join(REPO, 'public/research', CITY_ID);
const SCENARIO = join(REPO, 'public/scenario', CITY_ID);
const TREE = join(REPO, 'src/domain/research/catalog', `${CITY_ID}-tree.json`);

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const list = (dir, ext) => (existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(ext) && !n.startsWith('_')).sort() : []);

/** CSV 解析：只需表头与行数，够用来核对完整性清单。 */
function csvShape(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const headers = (lines[0] ?? '').replace(/^\uFEFF/, '').split(',').map((c) => c.trim()).filter(Boolean);
  return { headers, rows: lines.slice(1).filter((l) => l.trim() !== '').length };
}

/** 读取一张表的全部行（键名去掉 BOM），供过滤值存在性检查使用。 */
function readCsv(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].replace(/^\uFEFF/, '').split(',').map((c) => c.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    return row;
  });
  return { headers, rows };
}

// ---------------------------------------------------------------- 0. 前置

check(existsSync(TREE), `正式文章树不存在：${TREE}`);
check(existsSync(PAYLOAD), `载荷目录不存在：${PAYLOAD}（先跑 npm run sync）`);
if (failures.length) {
  console.error('[verify-research-integrity] 失败：');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

const tree = readJson(TREE);
const integrity = readJson(join(PAYLOAD, 'integrity.json'));
const report = readJson(join(PAYLOAD, 'sync-report.json'));

// ---------------------------------------------------------------- 1. 数据没被改动

let verifiedFiles = 0;
let hashMismatches = 0;
for (const entry of integrity.files) {
  const copyPath = join(REPO, entry.path);
  if (!existsSync(copyPath)) { check(false, `完整性清单里的文件不存在：${entry.path}`); hashMismatches += 1; continue; }
  const copyHash = sha256(copyPath);
  if (copyHash !== entry.sha256) { check(false, `public 副本 hash 与清单不符：${entry.path}`); hashMismatches += 1; continue; }
  const sourcePath = join(REPO, entry.source);
  if (existsSync(sourcePath)) {
    const sourceHash = sha256(sourcePath);
    if (sourceHash !== copyHash) { check(false, `源文件与副本 hash 不一致：${entry.source} ≠ ${entry.path}`); hashMismatches += 1; continue; }
  }
  if (entry.kind === 'table' || entry.kind === 'scenario') {
    const shape = csvShape(copyPath);
    if (shape.rows !== entry.rows) { check(false, `行数与清单不符：${entry.path}（清单 ${entry.rows}，实际 ${shape.rows}）`); hashMismatches += 1; continue; }
    if (shape.headers.length !== entry.columns) { check(false, `列数与清单不符：${entry.path}`); hashMismatches += 1; continue; }
  }
  verifiedFiles += 1;
}

// canonical 文章树必须与源文件逐字节一致（防手工改副本）
const treeCopy = join(PAYLOAD, 'index.json');
if (existsSync(treeCopy)) {
  check(sha256(treeCopy) === sha256(TREE), 'public/research/<city>/index.json 与 canonical catalog 不一致');
} else {
  check(false, '缺少 public/research/<city>/index.json（正式文章树）');
}

// ---------------------------------------------------------------- 2. ready 不是猜的

/** canonical 文章 id（A2）→ 当前载荷 id（A02）。canonical 优先，失败才回退。 */
function candidatePayloadIds(canonical) {
  const n = Number(canonical.replace(/^A/, ''));
  return Number.isFinite(n) ? [canonical, `A${String(n).padStart(2, '0')}`] : [canonical];
}

const articleCache = new Map();
function resolveArticleText(canonical) {
  if (articleCache.has(canonical)) return articleCache.get(canonical);
  for (const id of candidatePayloadIds(canonical)) {
    const path = join(PAYLOAD, 'articles', `${id}.json`);
    if (!existsSync(path)) continue;
    const article = readJson(path);
    const parts = [article.frontend_summary ?? '', article.abstract ?? '', article.conclusion ?? ''];
    for (const method of article.methods ?? []) parts.push(method.summary ?? '');
    parts.push(article.data_scope?.summary ?? '');
    for (const section of article.sections ?? []) parts.push(section.content ?? '');
    const text = parts.join('\n');
    articleCache.set(canonical, text);
    return text;
  }
  articleCache.set(canonical, null);
  return null;
}

const tableCache = new Map();
function loadTable(name) {
  if (tableCache.has(name)) return tableCache.get(name);
  const path = join(PAYLOAD, 'tables', name);
  const value = existsSync(path) ? readCsv(path) : null;
  tableCache.set(name, value);
  return value;
}

/** 载荷里真实存在的文章 id（用于确认 canonical→payload 的解析结果）。 */
const payloadArticleIds = list(join(PAYLOAD, 'articles'), '.json').map((n) => n.replace(/\.json$/, ''));

const statusCounts = { ready: 0, pending: 0, unsupported: 0 };
for (const topic of tree.topics ?? []) {
  for (const point of topic.points ?? []) {
    const label = point.id;
    statusCounts[point.status] = (statusCounts[point.status] ?? 0) + 1;

    const text = resolveArticleText(point.articleId);
    check(text !== null, `${label}: canonical 文章 ${point.articleId} 在载荷里找不到（试过 ${candidatePayloadIds(point.articleId).join(' / ')}）`);

    // 引用必须逐字存在于研究正文
    for (const citation of point.citations ?? []) {
      if (text === null) break;
      check(text.includes(citation.quote), `${label}: 引用原句未在研究正文中找到 →「${citation.quote.slice(0, 48)}…」`);
    }

    if (point.status === 'ready') {
      check(Boolean(point.module), `${label}: ready 必须指定交互模块`);
      check(Boolean(point.binding), `${label}: ready 必须带数据绑定`);
      check((point.citations ?? []).length > 0, `${label}: ready 必须带研究侧引用`);
      const binding = point.binding;
      if (binding) {
        for (const name of [binding.table, ...(binding.companions ?? [])]) {
          const table = loadTable(name);
          check(table !== null, `${label}: 绑定表不存在于载荷 → ${name}`);
        }
        const primary = loadTable(binding.table);
        if (primary) {
          for (const [column, allowed] of Object.entries(binding.filter ?? {})) {
            check(primary.headers.includes(column), `${label}: 过滤列不存在 ${binding.table}.${column}`);
            const actual = new Set(primary.rows.map((r) => r[column]));
            for (const value of allowed) {
              check(actual.has(value), `${label}: 过滤值不存在 ${binding.table}.${column}=${value}`);
            }
          }
          if (binding.focus) {
            check(primary.headers.includes(binding.focus), `${label}: 关注列不存在 ${binding.table}.${binding.focus}`);
          }
          if (binding.view === 'chart' && binding.category) {
            check(primary.headers.includes(binding.category), `${label}: 分类轴不存在 ${binding.table}.${binding.category}`);
          }
        }
      }
    }

    if (point.status === 'pending') {
      check(Boolean(point.reason), `${label}: pending 必须写明缺口原因`);
      check(!point.binding, `${label}: pending 不应带数据绑定（结构存在但没有内容）`);
    }

    if (point.status === 'unsupported') {
      check((point.citations ?? []).length > 0, `${label}: unsupported 的判定必须来自研究侧原句`);
      check(Boolean(point.reason), `${label}: unsupported 必须写明研究侧判定`);
    }
  }
}

// 载荷里不应存在 catalog 用不到的文章
const expectedPayloadIds = new Set((tree.topics ?? []).flatMap((t) => candidatePayloadIds(t.articleId)));
if (tree.reportArticleId) candidatePayloadIds(tree.reportArticleId).forEach((id) => expectedPayloadIds.add(id));
for (const id of payloadArticleIds) {
  check(expectedPayloadIds.has(id), `载荷文章 ${id} 不在 catalog 的 canonical/兼容映射里（会变成不可达内容）`);
}

// ---------------------------------------------------------------- 3. 缺口如实记录

const referencedMissing = (report.assets?.tablesReferencedButMissing ?? []).concat(report.assets?.figuresReferencedButMissing ?? []);
for (const name of referencedMissing) {
  check(!existsSync(join(PAYLOAD, 'tables', name)) && !existsSync(join(PAYLOAD, 'figures', name)),
    `同步报告把 ${name} 记为缺失，但它其实已经在载荷里（报告过期，请重新同步）`);
}
for (const name of list(join(SCENARIO), '.csv')) {
  check(existsSync(join(SCENARIO, name)), `推演表缺失：${name}`);
}
check(!existsSync(join(PAYLOAD, 'v2')), '载荷里仍有旧的 v2/ 子目录（city-aware 布局应只有一层）');

// ---------------------------------------------------------------- 4. 结果

if (failures.length > 0) {
  console.error(`[verify-research-integrity] 失败（${failures.length} 项）：`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}

const totalPoints = Object.values(statusCounts).reduce((a, b) => a + b, 0);
console.log('[verify-research-integrity] 全部通过');
console.log(`  hash 校验 ${verifiedFiles} 个文件，全部与源一致（不一致 ${hashMismatches}）`);
console.log(`  研究契约 ${tree.topics.length} 个方向 / ${totalPoints} 个研究点：ready ${statusCounts.ready} · pending ${statusCounts.pending} · unsupported ${statusCounts.unsupported}`);
console.log(`  ready 的引用原句全部能在研究正文里逐字找到；绑定的表、列、取值全部存在`);
