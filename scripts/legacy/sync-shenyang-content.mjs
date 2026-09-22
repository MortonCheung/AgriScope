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
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const outputRoot = join(projectRoot, 'public', 'research', 'shenyang');
const geoOut = join(projectRoot, 'public', 'geo');

/**
 * 研究工程目录约定（见 `shenyang/README.md`）：
 *   reports/    给人看的研究成果（索引 / 正文 / 核心图表）—— 首选来源
 *   workspace/  分析工程工作区（数据 / 脚本 / 全量输出）—— 回退来源
 * 索引里的图与表路径沿用分析工程内部相对路径，因此这里按 basename 在来源目录中解析，
 * 这样研究工程重组目录结构时前端不需要跟着改。
 */
const reportsRoot = resolve(projectRoot, '..', 'shenyang', 'reports');
const workspaceRoot = resolve(projectRoot, '..', 'shenyang', 'workspace');

const INDEX_CANDIDATES = [
  join(reportsRoot, '03_沈阳研究索引.json'),
  join(workspaceRoot, 'SHENYANG_RESEARCH_INDEX.json'),
];
const DOC_CANDIDATES = [
  join(reportsRoot, '01_沈阳研究总报告.md'),
  join(reportsRoot, '02_沈阳最终总结.md'),
  join(workspaceRoot, 'SHENYANG_RESEARCH.md'),
];
const FIGURE_DIRS = [join(reportsRoot, 'figures'), join(workspaceRoot, 'outputs', 'figures')];
const TABLE_DIRS = [join(reportsRoot, 'tables'), join(workspaceRoot, 'outputs', 'tables')];

const GEO_SOURCE = join(projectRoot, 'sources', 'liaoning.geo.json');
const GEO_OUT_PATH = join(geoOut, 'liaoning.json');

const REQUIRED_TOPIC_FIELDS = ['id', 'title', 'question', 'summary', 'conclusion', 'evidence_level', 'status'];
const RESEARCH_ID = /^[GC]\d+$/;

/**
 * 交互补充表：研究体系已产出、但索引把引用登记在别的节点上的表。
 * 只在对应研究点的交互模块确实需要时补充，避免为了做交互去造表；
 * 前端会把补充表与索引原生的表一并标注为来源。
 */
const INTERACTIVE_SUPPLEMENTS = {
  C2: ['outputs/tables/threshold_bins_explanatory.csv'],
};

function fail(message) {
  console.error(`\n[sync] 同步失败：${message}\n`);
  process.exit(1);
}

function ensureClean(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

/** 按候选顺序取第一个存在的文件；全部缺失时报错，不做静默回退。 */
function firstExisting(candidates, label) {
  for (const candidate of candidates) {
    if (existsSync(candidate) && !statSync(candidate).isDirectory()) return candidate;
  }
  fail(`${label} 不存在。已尝试：\n${candidates.map((path) => `  - ${path}`).join('\n')}`);
}

/** 在来源目录中按文件名解析资源；研究工程重组目录不影响前端。 */
function resolveSourceFile(dirs, fileName, label) {
  for (const dir of dirs) {
    const candidate = join(dir, fileName);
    if (existsSync(candidate)) return candidate;
  }
  fail(`索引引用的${label}不存在：${fileName}\n已尝试目录：\n${dirs.map((dir) => `  - ${dir}`).join('\n')}`);
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
  const indexSource = firstExisting(INDEX_CANDIDATES, '研究索引');
  const docSource = firstExisting(DOC_CANDIDATES, '研究正文');
  if (!existsSync(GEO_SOURCE)) fail(`辽宁 GeoJSON 源缺失：${GEO_SOURCE}`);

  const index = JSON.parse(readFileSync(indexSource, 'utf8'));
  const ids = validateIndex(index);
  const markdown = readFileSync(docSource, 'utf8');
  const { articles, abstract } = splitResearchDoc(markdown);

  const missingArticles = [...ids].filter((id) => !articles.has(id));
  if (missingArticles.length) console.warn(`[sync] 警告：正文缺少研究点 ${missingArticles.join(', ')}`);

  ensureClean(outputRoot);
  const figuresDir = join(outputRoot, 'figures');
  const tablesDir = join(outputRoot, 'tables');
  const articlesDir = join(outputRoot, 'articles');
  mkdirSync(figuresDir, { recursive: true });
  mkdirSync(tablesDir, { recursive: true });
  mkdirSync(articlesDir, { recursive: true });
  mkdirSync(geoOut, { recursive: true });

  const figureSet = new Set();
  const tableSet = new Set();
  const resolveAsset = (kind, relativePath) => {
    const fileName = basename(relativePath);
    const source = resolveSourceFile(
      kind === 'figures' ? FIGURE_DIRS : TABLE_DIRS,
      fileName,
      kind === 'figures' ? '图' : '表',
    );
    (kind === 'figures' ? figureSet : tableSet).add(fileName);
    copyFileSync(source, join(outputRoot, kind, fileName));
    return publicUrl(kind, relativePath);
  };

  const topics = index.topics.map((topic) => {
    const supplemented = [...new Set([...(topic.tables ?? []), ...(INTERACTIVE_SUPPLEMENTS[topic.id] ?? [])])];
    return {
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
      tables: supplemented.map((path) => resolveAsset('tables', path)),
      articleId: articles.has(topic.id) ? topic.id : null,
    };
  });

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
  writeFileSync(join(outputRoot, 'index.json'), JSON.stringify({
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

  writeFileSync(join(outputRoot, 'manifest.json'), JSON.stringify({
    generatedFrom: {
      index: relative(projectRoot, indexSource),
      doc: relative(projectRoot, docSource),
      figuresDir: relative(projectRoot, existsSync(FIGURE_DIRS[0]) ? FIGURE_DIRS[0] : FIGURE_DIRS[1]),
      tablesDir: relative(projectRoot, existsSync(TABLE_DIRS[0]) ? TABLE_DIRS[0] : TABLE_DIRS[1]),
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

  console.log(`[sync] 来源：${relative(projectRoot, indexSource)}`);
  console.log(`[sync] 来源：${relative(projectRoot, docSource)}`);
  console.log(`[sync] 研究点 ${topics.length} · 专题 ${index.summary_blocks?.length ?? 0} · 原文 ${articles.size} 篇`);
  console.log(`[sync] 图 ${figureSet.size} · 表 ${tableSet.size} · 城问 ${index.city_conclusion?.qas?.length ?? 0}`);
  console.log(`[sync] 输出：${outputRoot}`);
}

main();
