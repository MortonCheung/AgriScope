/**
 * 研究领域模型。
 *
 * 命名对齐研究工程：ResearchTopic（专题）→ ResearchPoint（研究点）。
 * 所有条目均来自外部研究工程的 SHENYANG_RESEARCH_INDEX.json，
 * 前端不新增、不修改任何研究结论。
 */

/** 证据等级：A 直接观测 / B 统计关联 / C 机制一致 / D 模型或情景 / Unsupported 数据不支持 */
export type EvidenceLevelCode = 'A' | 'B' | 'C' | 'D' | 'Unsupported';

/** 研究状态：支持 / 阴性结果 / 描述性 / 探索性 / 数据不支持 */
export type ResearchStatus = 'supported' | 'null_result' | 'descriptive' | 'exploratory' | 'unsupported';

export interface ResearchEvidence {
  code: EvidenceLevelCode;
  label: string;
  description: string;
}

export interface ResearchFinding {
  /** 结论文本，来自 index 的 conclusion */
  statement: string;
  status: ResearchStatus;
  evidenceLevel: EvidenceLevelCode;
}

export interface ResearchKeyNumber {
  label: string;
  value: string;
}

export interface ResearchFigure {
  id: string;
  src: string;
  caption: string | null;
  source: string;
  evidenceLevel: EvidenceLevelCode;
}

export interface ResearchTableColumn {
  key: string;
  label: string;
}

export interface ResearchTable {
  id: string;
  name: string;
  src: string;
  columns: ResearchTableColumn[];
  rows: Record<string, string>[];
}

export interface ResearchMethod {
  title: string;
  notes: string[];
}

export interface ResearchLimitation {
  text: string;
}

export interface ResearchArticleBlock {
  heading: string | null;
  lines: string[];
}

export interface ResearchArticle {
  id: string;
  title: string;
  blocks: ResearchArticleBlock[];
}

export interface ResearchPoint {
  id: string;
  cityId: string;
  topicId: string;
  topicTitle: string;
  layer: string | null;
  category: string | null;
  title: string;
  question: string;
  why: string | null;
  data: string | null;
  method: string | null;
  summary: string;
  conclusion: string;
  frontendText: string | null;
  evidenceLevel: EvidenceLevelCode;
  status: ResearchStatus;
  finding: ResearchFinding;
  keyNumbers: ResearchKeyNumber[];
  primaryFigure: string | null;
  figures: ResearchFigure[];
  tables: ResearchTable[];
  limitations: ResearchLimitation[];
  articleId: string | null;
}

export interface ResearchTopic {
  id: string;
  title: string;
  summary: string;
  pointIds: string[];
  points: ResearchPoint[];
}

export interface CityCityQuestion {
  question: string;
  answer: string;
}

export interface CityConclusion {
  title: string;
  riskProfile: string;
  definition: string;
  questions: CityCityQuestion[];
  caveats: string[];
}

export interface CityResearchIndex {
  cityId: string;
  cityName: string;
  title: string;
  headline: string;
  window: string;
  panel: string;
  crops: string[];
  priceUnit: string;
  volumeUnit: string;
  evidenceLevels: Record<string, string>;
  statusValues: Record<string, string>;
  methodologyNotes: string[];
  redLines: string[];
  topics: ResearchTopic[];
  points: ResearchPoint[];
  cityConclusion: CityConclusion;
  counters: { crops: number; topics: number; studies: number };
  figures: string[];
  tables: string[];
  /** 研究工程声明的来源（index.json 的 sourceOfTruth）；前端只转述，不新增来源（V3 §31/§32）。 */
  provenance: string[];
}

/** 专题、研究点在研究空间中的空间化布局坐标（由布局算法生成，非研究数据）。 */
export interface ResearchNodeLayout {
  pointId: string;
  topicId: string;
  position: [number, number, number];
}
