import { parseEvidenceLevel, parseStatus } from './evidence';
import type {
  CityConclusion,
  CityResearchIndex,
  ResearchArticle,
  ResearchFigure,
  ResearchKeyNumber,
  ResearchPoint,
  ResearchTopic,
} from './types';

/**
 * Research Adapter：把同步脚本产出的原始 JSON 转成前端领域模型。
 * 组件只消费领域模型，不理解研究工程目录结构。
 */

export interface RawTopic {
  id: string;
  layer: string | null;
  category: string | null;
  title: string;
  question: string;
  why: string | null;
  data: string | null;
  method: string | null;
  summary: string;
  conclusion: string;
  evidenceLevel: string;
  status: string;
  frontendText: string | null;
  keyNumbers: Record<string, string | number>;
  limitations: string[];
  primaryFigure: string | null;
  figures: string[];
  tables: string[];
  articleId: string | null;
}

export interface RawSummaryBlock {
  id: string;
  title: string;
  covers: string[];
  coversResolved: string[];
  text: string;
}

export interface RawCityConclusion {
  title: string;
  risk_profile: string;
  definition: string;
  qas: { q: string; a: string }[];
  caveats: string[];
}

export interface RawCityIndex {
  city: string;
  title: string;
  headline: string;
  window: string;
  panel: string;
  crops: string[];
  priceUnit: string;
  volumeUnit: string;
  evidenceLevels: Record<string, string>;
  statusValues: Record<string, string>;
  structure?: Record<string, string>;
  topics: RawTopic[];
  summaryBlocks: RawSummaryBlock[];
  cityConclusion: RawCityConclusion;
  methodologyNotes: string[];
  redLines: string[];
  sourceOfTruth?: Record<string, string>;
  counters: { crops: number; topics: number; studies: number };
}

export interface RawArticle {
  id: string;
  title: string;
  blocks: { heading: string | null; lines: string[] }[];
}

function toKeyNumbers(record: Record<string, string | number>): ResearchKeyNumber[] {
  return Object.entries(record).map(([label, value]) => ({ label, value: String(value) }));
}

function toFigures(point: RawTopic): ResearchFigure[] {
  const level = parseEvidenceLevel(point.evidenceLevel);
  const seen = new Set<string>();
  return point.figures
    .filter((src) => { if (seen.has(src)) return false; seen.add(src); return true; })
    .map((src) => ({
      id: `${point.id}:${src.split('/').pop()}`,
      src,
      caption: point.frontendText,
      /**
       * 研究索引没有逐图声明来源，因此这里**不编造**（V3 §32）。
       * 空字符串会让 SourceCitation 如实显示"来源未在当前前端索引中声明"，
       * 并记录到 docs/SOURCE_GAPS.md。
       */
      source: '',
      evidenceLevel: level,
    }));
}

function toPoint(raw: RawTopic, cityId: string, topicId: string, topicTitle: string): ResearchPoint {
  const evidenceLevel = parseEvidenceLevel(raw.evidenceLevel);
  const status = parseStatus(raw.status);
  return {
    id: raw.id,
    cityId,
    topicId,
    topicTitle,
    layer: raw.layer,
    category: raw.category,
    title: raw.title,
    question: raw.question,
    why: raw.why,
    data: raw.data,
    method: raw.method,
    summary: raw.summary,
    conclusion: raw.conclusion,
    frontendText: raw.frontendText,
    evidenceLevel,
    status,
    finding: { statement: raw.conclusion, status, evidenceLevel },
    keyNumbers: toKeyNumbers(raw.keyNumbers),
    primaryFigure: raw.primaryFigure,
    figures: toFigures(raw),
    tables: raw.tables.map((src) => ({ id: `${raw.id}:${src.split('/').pop()}`, name: src.split('/').pop() ?? src, src, columns: [], rows: [] })),
    limitations: raw.limitations.map((text) => ({ text })),
    articleId: raw.articleId,
  };
}

export function adaptCityIndex(raw: RawCityIndex, cityId: string): CityResearchIndex {
  const topicIdByPoint = new Map<string, RawSummaryBlock>();
  for (const block of raw.summaryBlocks) {
    for (const pointId of block.coversResolved) topicIdByPoint.set(pointId, block);
  }
  const fallbackTopic = raw.summaryBlocks[0];
  const points = raw.topics.map((topic) => {
    const block = topicIdByPoint.get(topic.id) ?? fallbackTopic;
    return toPoint(topic, cityId, block?.id ?? 'S?', block?.title ?? '未归类');
  });
  const pointsById = new Map(points.map((point) => [point.id, point]));
  const topics: ResearchTopic[] = raw.summaryBlocks.map((block) => ({
    id: block.id,
    title: block.title,
    summary: block.text,
    pointIds: block.coversResolved,
    points: block.coversResolved.map((id) => pointsById.get(id)).filter((point): point is ResearchPoint => Boolean(point)),
  }));
  const cityConclusion: CityConclusion = {
    title: raw.cityConclusion.title,
    riskProfile: raw.cityConclusion.risk_profile,
    definition: raw.cityConclusion.definition,
    questions: raw.cityConclusion.qas.map(({ q, a }) => ({ question: q, answer: a })),
    caveats: raw.cityConclusion.caveats,
  };
  const figures = [...new Set(points.flatMap((point) => point.figures.map((figure) => figure.src)))];
  const tables = [...new Set(points.flatMap((point) => point.tables.map((table) => table.src)))];
  return {
    cityId,
    cityName: raw.city,
    title: raw.title,
    headline: raw.headline,
    window: raw.window,
    panel: raw.panel,
    crops: raw.crops,
    priceUnit: raw.priceUnit,
    volumeUnit: raw.volumeUnit,
    evidenceLevels: raw.evidenceLevels,
    statusValues: raw.statusValues,
    methodologyNotes: raw.methodologyNotes,
    redLines: raw.redLines,
    topics,
    points,
    cityConclusion,
    counters: raw.counters,
    figures,
    tables,
    /** 只转述研究工程声明的来源；没有声明就是空数组，绝不猜（V3 §32）。 */
    provenance: Object.values(raw.sourceOfTruth ?? {}).filter(Boolean),
  };
}

export function adaptArticle(raw: RawArticle): ResearchArticle {
  return { id: raw.id, title: raw.title, blocks: raw.blocks };
}
