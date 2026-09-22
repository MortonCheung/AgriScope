#!/usr/bin/env node
/**
 * AgriScope 内容同步脚本。
 *
 * 数据来源（只读，不修改）：外部研究工程 `../shenyang`。
 *   - SHENYANG_RESEARCH_INDEX.json  结构化研究索引（唯一内容真相源）
 *   - SHENYANG_RESEARCH.md          研究正文（按研究点切分为原文）
 *   - outputs/figures, outputs/tables  仅同步索引真正引用到的图与表
 *
 * 输出：`public/research/shenyang/`，供前端运行时以静态资源方式读取。
 * 这里刻意不做任何数值改写，只做路径归一化与结构切分，
 * 避免把研究结论在前端层重新"创作"一遍。
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const researchRoot = resolve(projectRoot, '..', 'shenyang');
const outRoot = join(projectRoot, 'public', 'research', 'shenyang');
const geoOut = join(projectRoot, 'public', 'geo');

const INDEX_PATH = join(researchRoot, 'SHENYANG_RESEARCH_INDEX.json');
const DOC_PATH = join(researchRoot, 'SHENYANG_RESEARCH.md');
const GEO_SOURCE = join(projectRoot, 'sources', 'liaoning.geo.json');
const GEO_OUT_PATH = join(geoOut, 'liaoning.json');

const REQUIRED_TOPIC_FIELDS = ['id', 'title', 'question', 'summary', 'conclusion', 'evidence_level', 'status'];
const RESEARCH_ID = /^[GC]\d+$/;

function fail(message) {
  console.error(`\n[sync] 同步失败：${message}\n`);
  process.exit(1);
}

function assertReadable(path, label) {
  if (!existsSync(path)) fail(`${label} 不存在：${path}`);
  if (statSync(path).isDirectory()) fail(`${label} 应为文件：${path}`);
}

function ensureClean(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

function publicUrl(kind, relativePath) {
  return `/research/shenyang/${kind}/${basename(relativePath)}`;
}

function validateIndex(index) {
  if (!index || typeof index !== 'object') fail('索引不是对象');
  for (const key of ['city', 'title', 'topics', 'summary_blocks', 'city_conclusion']) {
    if (!(key in index)) fail(`索引缺少顶层字段 ${key}`);
  }
  if (!Array.isArray(index.topics) || index.topics.length === 0) fail('索引 topics 为空');
  const seen = new Set();
  for (const topic of index.topics) {
    for (const field of REQUIRED_TOPIC_FIELDS) {
      if (topic[field] === undefined || topic[field] === null || topic[field] === '') {
        fail(`研究点 ${topic.id ?? '(no id)'} 缺少字段 ${field}`);
      }
    }
    if (seen.has(topic.id)) fail(`研究点 id 重复：${topic.id}`);
    seen.add(topic.id);
    for (const value of [topic.evidence_level, topic.status]) {
      if (typeof value !== 'string' || !value.trim()) fail(`研究点 ${topic.id} 的证据/状态字段无效`);
    }
  }
  return seen;
}

function splitResearchDoc(markdown) {
  const lines = markdown.split(/\r?\n/);
  const articles = new Map();
  let currentId = null;
  let buffer = [];
  let abstract = [];
  const flush = () => {
    if (currentId) articles.set(currentId, buffer.join('\n').trim());
  };
  for (const line of lines) {
    const researchMatch = /^##\s+([GC]\d+)\b(.*)$/.exec(line);
    if (researchMatch && RESEARCH_ID.test(researchMatch[1])) {
      flush();
      currentId = researchMatch[1];
      buffer = [line];
      continue;
    }
    if (currentId) buffer.push(line);
    else if (/^##\s+0\.\s*研究摘要/.test(line)) abstract = [line];
    else if (abstract.length) abstract.push(line);
  }
  flush();
  return { articles, abstract: abstract.join('\n').trim() };
}

/** 把一段研究正文的 Markdown 拆成"小节 → 行"的块，方便前端做渐进式呈现。 */
function blocksFromMarkdown(markdown) {
  const blocks = [];
  let heading = null;
  let lines = [];
  const push = () => {
    const text = lines.join('\n').trim();
    if (heading || text) blocks.push({ heading, lines: text ? text.split('\n') : [] });
  };
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^###\s+(.*)$/.exec(line);
    if (match) {
      push();
      heading = match[1].trim();
      lines = [];
      continue;
    }
    if (/^##\s+/.test(line) && !heading) continue;
    lines.push(line);
  }
  push();
  return blocks.filter((block) => block.heading || block.lines.length);
}

function main() {
  assertReadable(INDEX_PATH, '研究索引');
  assertReadable(DOC_PATH, '研究正文');
  if (!existsSync(GEO_SOURCE)) fail(`辽宁 GeoJSON 源缺失：${GEO_SOURCE}`);

  const index = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  const ids = validateIndex(index);
  const markdown = readFileSync(DOC_PATH, 'utf8');
  const { articles, abstract } = splitResearchDoc(markdown);

  const missingArticles = [...ids].filter((id) => !articles.has(id));
  if (missingArticles.length) console.warn(`[sync] 警告：正文缺少研究点 ${missingArticles.join(', ')}`);

  ensureClean(outRoot);
  const figuresDir = join(outRoot, 'figures');
  const tablesDir = join(outRoot, 'tables');
  const articlesDir = join(outRoot, 'articles');
  mkdirSync(figuresDir, { recursive: true });
  mkdirSync(tablesDir, { recursive: true });
  mkdirSync(articlesDir, { recursive: true });
  mkdirSync(geoOut, { recursive: true });

  const figureSet = new Set();
  const tableSet = new Set();
  const resolveAsset = (kind, relativePath) => {
    const source = join(researchRoot, relativePath);
    if (!existsSync(source)) fail(`索引引用的${kind === 'figures' ? '图' : '表'}不存在：${relativePath}`);
    (kind === 'figures' ? figureSet : tableSet).add(basename(relativePath));
    copyFileSync(source, join(outRoot, kind, basename(relativePath)));
    return publicUrl(kind, relativePath);
  };

  const topics = index.topics.map((topic) => ({
    id: topic.id,
    layer: topic.layer ?? null,
    category: topic.category ?? null,
    title: topic.title,
    question: topic.question,
    why: topic.why ?? null,
    data: topic.data ?? null,
    method: topic.method ?? null,
    summary: topic.summary,
    conclusion: topic.conclusion,
    evidenceLevel: topic.evidence_level,
    status: topic.status,
    frontendText: topic.frontend_text ?? null,
    keyNumbers: topic.key_numbers ?? {},
    limitations: topic.limitations ?? [],
    primaryFigure: topic.figure ? publicUrl('figures', topic.figure) : null,
    figures: (topic.figures ?? []).map((path) => resolveAsset('figures', path)),
    tables: (topic.tables ?? []).map((path) => resolveAsset('tables', path)),
    articleId: articles.has(topic.id) ? topic.id : null,
  }));

  for (const [id, markdownSection] of articles) {
    writeFileSync(join(articlesDir, `${id}.json`), JSON.stringify({
      id,
      title: (index.topics.find((topic) => topic.id === id)?.title) ?? id,
      blocks: blocksFromMarkdown(markdownSection),
    }, null, 2));
  }
  if (abstract) {
    writeFileSync(join(articlesDir, 'abstract.json'), JSON.stringify({
      id: 'abstract',
      title: '研究摘要',
      blocks: blocksFromMarkdown(abstract),
    }, null, 2));
  }

  copyFileSync(GEO_SOURCE, GEO_OUT_PATH);

  const city = index.city;
  writeFileSync(join(outRoot, 'index.json'), JSON.stringify({
    city,
    title: index.title,
    headline: `${city}市农业气象风险与农产品市场响应研究`,
    window: index.window,
    panel: index.panel,
    crops: index.crops ?? [],
    priceUnit: index.price_unit,
    volumeUnit: index.volume_unit,
    evidenceLevels: index.evidence_levels ?? {},
    statusValues: index.status_values ?? {},
    structure: index.structure ?? {},
    topics,
    summaryBlocks: (index.summary_blocks ?? []).map((block) => ({
      id: block.id, title: block.title, covers: block.covers ?? [], text: block.text,
      coversResolved: (block.covers ?? []).filter((id) => ids.has(id)),
    })),
    cityConclusion: index.city_conclusion,
    methodologyNotes: index.methodology_notes ?? [],
    redLines: index.red_lines ?? [],
    methodology: index.methodology ?? null,
    sourceOfTruth: index.source_of_truth ?? {},
    counters: {
      crops: index.n_crops ?? (index.crops ?? []).length,
      topics: (index.summary_blocks ?? []).length,
      studies: topics.length,
    },
  }, null, 2));

  writeFileSync(join(outRoot, 'manifest.json'), JSON.stringify({
    generatedFrom: {
      index: 'shenyang/SHENYANG_RESEARCH_INDEX.json',
      doc: 'shenyang/SHENYANG_RESEARCH.md',
      researchWindow: index.window,
    },
    counters: {
      topics: topics.length,
      summaryBlocks: (index.summary_blocks ?? []).length,
      cityQuestions: (index.city_conclusion?.qas ?? []).length,
      articles: articles.size,
      figures: figureSet.size,
      tables: tableSet.size,
    },
    figures: [...figureSet].sort(),
    tables: [...tableSet].sort(),
    geo: { liaoning: '/geo/liaoning.json' },
  }, null, 2));

  console.log(`[sync] 研究点 ${topics.length} · 专题 ${index.summary_blocks?.length ?? 0} · 原文 ${articles.size} 篇`);
  console.log(`[sync] 图 ${figureSet.size} · 表 ${tableSet.size} · 城问 ${index.city_conclusion?.qas?.length ?? 0}`);
  console.log(`[sync] 输出：${outRoot}`);
}

main();
