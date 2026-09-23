/**
 * 研究信息架构的城市无关模型（V5 §5/§21）。
 *
 * 这一层只描述**结构**：方向（topic）与研究点（point）。
 * 所有内容（标题以外的文字、数字、图表、来源、evidence）都必须来自研究侧导出，
 * 前端不写、不补、不加强（§35）。
 *
 * 关键约束：组件**不能**假设方向数量或点位数量。
 * 沈阳是 8 方向 / 76 点，铁岭可能是 6 / 40，朝阳可能是 10 / 90。
 * 因此这里只有数组与查找函数，没有任何以数量为条件的判断。
 */

/** 研究点状态（§21）。三种状态的语义必须严格区分。 */
export type ResearchPointStatus =
  /** 结构存在，但正式研究内容尚未接入。只显示 ID / 标题 / 研究内容待接入。 */
  | 'pending'
  /** 引用的 article / block / table / figure / source 全部存在，可以完整呈现。 */
  | 'ready'
  /** 研究侧正式判断当前数据不足或不支持推断。允许没有图表，但文案必须来自研究侧。 */
  | 'unsupported';

/** 交互模块类型（§16）。没有真实数据绑定的点不分配模块。 */
export type InteractiveModuleKind =
  | 'trend'
  | 'seasonality'
  | 'weather-response'
  | 'lag'
  | 'accumulation'
  | 'nonlinearity'
  | 'event-study'
  | 'event-inventory'
  | 'crop-heterogeneity'
  | 'recovery'
  | 'price-volume'
  | 'transmission'
  | 'forecast'
  | 'district-structure'
  | 'yield-panel'
  | 'robustness';

/**
 * 研究侧引用。`quote` 必须能在该篇正文里**逐字找到**，
 * 由 `scripts/verify-research-integrity.mjs` 强制校验 —— 这是"不猜"的机械保证：
 * 找不到原句的绑定无法通过构建。
 */
export interface ResearchCitation {
  /** 研究正文的章节号（未来文章出现 blocks 后改为 block id，见 §11）。 */
  section: number;
  quote: string;
}

/**
 * 数据绑定：这一点的证据由**研究侧导出的表**直接给出。
 *
 * `filter` 只使用研究表自己的列名与取值，不做任何再计算（§17）：
 * 例如 `{ outcome: ['price'], exposure: ['precipitation'] }`
 * 表示"取 outcome=price 且 exposure=precipitation 的那些行"。
 */
export interface ResearchDataBinding {
  /** 载荷里的表文件名，例如 A02_daily_response.csv */
  table: string;
  filter: Record<string, string[]>;
  /**
   * 额外需要用户钉住的维度（本轮 §33）。
   *
   * 它**只是 UI 行筛选，不是科研计算**：display filter = `filter` + 当前 selector 值。
   * 存在的意义是消除分类轴歧义 —— 例如 A1.4「月份 × 成交量」在 10 品种下
   * 一个月份对应 10 行，必须先把品种钉住，图才读得通（§32/§36）。
   */
  selectors?: string[];
  /** 呈现方式：可画图时画图，只有一两行时如实给表（不硬凑成图）。 */
  view: 'chart' | 'table';
  /** 图的分类轴列；`view=table` 时不存在。 */
  category?: string;
  /** 该点主要看的那一列（图表取值），必须是表里的列。 */
  focus?: string;
  /** 同一结论需要的附加表（例如稳健性审查同时需要 wild bootstrap 与 leave-one-out）。 */
  companions?: string[];
}

export interface ResearchPoint {
  /** canonical id：A1.1 … A8.11 */
  id: string;
  topicId: string;
  /** canonical 文章 id：A1 … A8（不是 A01） */
  articleId: string;
  title: string;
  status: ResearchPointStatus;
  /**
   * 研究点的研究问题（本轮 §22）。
   * 只有研究侧真的写了才显示；当前载荷没有这个字段就留空 —— **前端绝不自己补写问题**。
   */
  question?: string;
  /** 引用所在章节号；未来是 block id。 */
  sectionId?: string;
  module?: InteractiveModuleKind;
  binding?: ResearchDataBinding;
  citations?: ResearchCitation[];
  /** pending 的缺口说明；unsupported 的研究侧判定说明。 */
  reason?: string;
}

export interface ResearchTopic {
  /** canonical id：A1 … A8 */
  id: string;
  title: string;
  /** canonical 文章 id；compat 层负责映射到当前载荷的 A01… */
  articleId: string;
  /** 研究侧自己的文章标题（与 payload 一致，不由前端改写） */
  articleTitle: string;
  order: number;
  points: ResearchPoint[];
}

export interface CityResearchCatalog {
  schemaVersion: string;
  cityId: string;
  cityCode: string;
  /** 城市综合报告（A9）不属于研究树（§29）。 */
  reportArticleId?: string;
  structureNote?: string;
  topics: ResearchTopic[];
}

/** 研究点的四层内容（§14）。哪一层没有研究侧内容，就不渲染那一层。 */
export const POINT_LAYERS = ['question', 'keyNumbers', 'module', 'method', 'conclusion', 'evidence'] as const;
export type ResearchPointLayer = (typeof POINT_LAYERS)[number];
