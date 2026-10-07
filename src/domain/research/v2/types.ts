/** 沈阳 v2 研究导出的真实结构（V5 审计：字段与 exports/frontend 逐一对齐，不做想象）。 */

export interface V2ManifestArticle {
  id: string;
  slug: string;
  title: string;
  file: string;
  n_sections: number;
  n_sources: number;
  status: string;
}

export interface V2Manifest {
  city: string;
  project: string;
  n_articles: number;
  articles: V2ManifestArticle[];
  n_sources: number;
  generated_by: string;
  article_end_marker_required: boolean;
  no_substring_summary: boolean;
}

export interface V2Source {
  source_id: string;
  /** 数据集 / 文献标题。 */
  title: string;
  /** 机构（V5 §51 的「机构」列）。 */
  publisher: string;
  authors: string;
  /** official_statistics | official_api | official_news */
  type: string;
  url: string;
  data_period: string;
  published_date: string;
  accessed_at: string;
  /** 研究侧给出的来源等级 A / B。 */
  source_grade: string;
  verification_status: string;
}

export interface V2Table {
  file: string;
  columns: string[];
  rows: Record<string, string>[];
}

export interface V2ArticleSection {
  number: string;
  title: string;
  /** markdown 字符串（研究侧真实形态，见 V5 审计 §4）。 */
  content: string;
}

export interface V2Article {
  id: string;
  slug: string;
  title: string;
  abstract: string;
  frontend_summary: string;
  keywords: string[];
  research_questions: string[];
  /** markdown；含**变量定义与单位**，是单位口径的主要出处。 */
  data_scope: { summary: string };
  methods: { summary: string }[];
  /** 只有小标题，没有正文（V5 审计 §G7）。 */
  key_findings: { heading: string }[];
  sections: V2ArticleSection[];
  limitations: string[];
  conclusion: string;
  figures: { file: string }[];
  tables: { file: string }[];
  source_ids: string[];
  status: string;
}

export interface V2SyncReport {
  generatedBy: string;
  sourceRoot: string;
  outRoot: string;
  articles: { id: string; title: string; sections: number; sources: number; figures: string[]; tables: string[] }[];
  counts: { articles: number; sources: number; figuresCopied: number; tablesCopied: number };
  assets: {
    figuresReferencedButMissing: string[];
    tablesReferencedButMissing: string[];
    tablesPresentButUnreferenced: string[];
    figuresPresentButUnreferenced: string[];
  };
  exportContracts: { article_end_marker_required: boolean; no_substring_summary: boolean };
}
