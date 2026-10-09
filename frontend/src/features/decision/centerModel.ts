/**
 * 决策中心的**纯规则层**（Frontend V3 §10–§14）。
 *
 * 这一层只做三件事，且都不依赖 React / 网络：
 *   1. 把真实字段（market_state / forecast_direction / risk_band / confidence /
 *      evidence_status）映射成确定性的枚举；
 *   2. 用**固定模板**把枚举拼成「当前判断」句子 —— 不调用 LLM、不含随机数、不含写死的业务句；
 *   3. 由真实数值派生风险剖面与作物比较结论（结论只能取任务书允许的五个词）。
 *
 * 所有输入都是 provider 边界已经校验过的数值；null 永远保持为 null（缺失即缺失）。
 */

export type MarketState = 'high' | 'mid' | 'low' | 'unknown';
export type ForecastDirection = 'up' | 'down' | 'flat' | 'unknown';
export type RiskBand = 'low' | 'medium' | 'high' | 'extreme' | 'unknown';
export type ConfidenceBand = 'high' | 'medium' | 'low' | 'unknown';
export type EvidenceStatus = 'calibrated' | 'scenario_only' | 'retrospective_only' | 'unavailable';
export type LongCertainty = 'production_point' | 'production_scenario' | 'scenario_only' | 'exploratory' | 'research_only' | 'unknown';

export const MARKET_STATE_LABEL: Record<MarketState, string> = { high: '高位', mid: '中枢', low: '低位', unknown: '待确认' };
export const FORECAST_LABEL: Record<ForecastDirection, string> = { up: '向上', down: '向下', flat: '基本持平', unknown: '方向待确认' };
export const RISK_LABEL: Record<RiskBand, string> = { low: '低', medium: '中等', high: '偏高', extreme: '高', unknown: '待确认' };
export const CONFIDENCE_LABEL: Record<ConfidenceBand, string> = { high: '高', medium: '中等', low: '低', unknown: '待确认' };
export const EVIDENCE_LABEL: Record<EvidenceStatus, string> = {
  calibrated: '独立校准的概率区间', scenario_only: '仅情景区间（未校准）',
  retrospective_only: '仅有回溯证据，无未触碰验证', unavailable: '证据待确认',
};
export const LONG_CERTAINTY_LABEL: Record<LongCertainty, string> = {
  production_point: '正式估计', production_scenario: '正式情景', scenario_only: '情景估计',
  exploratory: '探索性结果', research_only: '研究结果', unknown: '状态待确认',
};

/** 分位越高越贵；阈值 0.25 / 0.75 来自与 Daily 一致的通用分位口径。 */
export function marketState(percentile: number | null): MarketState {
  if (percentile === null || !Number.isFinite(percentile)) return 'unknown';
  if (percentile >= 0.75) return 'high';
  if (percentile <= 0.25) return 'low';
  return 'mid';
}

/** 未来中心值相对当前真实价的方向；±5% 之内视为持平。 */
export function forecastDirection(mid: number | null, latest: number | null): ForecastDirection {
  if (mid === null || latest === null || latest <= 0 || !Number.isFinite(mid)) return 'unknown';
  const relative = mid / latest - 1;
  if (relative >= 0.05) return 'up';
  if (relative <= -0.05) return 'down';
  return 'flat';
}

export function riskBandFromScore(value: number | null): RiskBand {
  if (value === null || !Number.isFinite(value)) return 'unknown';
  if (value < 40) return 'low';
  if (value < 60) return 'medium';
  if (value < 80) return 'high';
  return 'extreme';
}

export function confidenceBand(score: number | null): ConfidenceBand {
  if (score === null || !Number.isFinite(score)) return 'unknown';
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

/** 短期的区间状态：只有 range_type=prediction_interval 才算独立校准区间。 */
export function evidenceStatus(rangeType: string | null, rangeStatus: string | null): EvidenceStatus {
  if (rangeType === 'prediction_interval') return 'calibrated';
  if (rangeStatus && rangeStatus.toLowerCase().includes('retrospective')) return 'retrospective_only';
  if (rangeType === 'scenario_range' || (rangeStatus && rangeStatus.startsWith('scenario'))) return 'scenario_only';
  return 'unavailable';
}

export function longCertainty(productionStatus: string | null): LongCertainty {
  switch (productionStatus) {
    case 'PRODUCTION_POINT': return 'production_point';
    case 'PRODUCTION_SCENARIO': return 'production_scenario';
    case 'SCENARIO_ONLY': return 'scenario_only';
    case 'EXPLORATORY_SCENARIO_ONLY': return 'exploratory';
    case 'RESEARCH_ONLY': return 'research_only';
    default: return 'unknown';
  }
}

export interface JudgmentInput {
  cityName: string;
  crop: string;
  horizon: number;
  state: MarketState;
  percentile: number | null;
  direction: ForecastDirection;
  mid: number | null;
  low: number | null;
  high: number | null;
  unit: string;
  risk: RiskBand;
  hri: RiskBand;
  confidence: ConfidenceBand;
  evidence: EvidenceStatus;
}

const pct = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(0)}%`;
const num = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);

/**
 * 「当前判断」唯一入口：输入是枚举与真实数值，输出是**模板拼装**的一句中文。
 * 任何字段缺失都会如实写成「待确认 / —」，绝不替换成看起来完整的假句子。
 */
export function judgmentSentence(input: JudgmentInput): string {
  const range = input.low !== null && input.high !== null ? `（区间 ${num(input.low)}–${num(input.high)}）` : '（区间待确认）';
  return `${input.cityName} · ${input.crop}：当前价格处于近 6 年${MARKET_STATE_LABEL[input.state]}（分位 ${pct(input.percentile)}）；`
    + `${input.horizon} 天模型方向${FORECAST_LABEL[input.direction]}，中心值 ${num(input.mid)} ${input.unit}${range}；`
    + `市场风险${RISK_LABEL[input.risk]}、跟风扩种环境${RISK_LABEL[input.hri]}；`
    + `结论可信度${CONFIDENCE_LABEL[input.confidence]}，证据${EVIDENCE_LABEL[input.evidence]}。`;
}

export interface RiskProfileInput {
  marketRisk: number | null;
  priceRelWidth: number | null;
  climateExposure: number | null;
  hri: number | null;
  confidence: number | null;
  priceLow: number | null;
  priceHigh: number | null;
  unit: string;
}

export interface RiskSource { label: string; value: string }
export interface RiskItem {
  id: 'volatility' | 'price_uncertainty' | 'weather' | 'concentration' | 'data';
  label: string;
  /** 0–100 真实分数；价格不确定性没有 0–100 分数时为 null。 */
  score: number | null;
  /** 横条长度（0–100）：有分数用分数，没有分数时用风险档位的固定长度。 */
  width: number;
  band: RiskBand;
  value: string;
  why: string;
  sources: RiskSource[];
  researchId: string;
  researchLabel: string;
}

const BAND_WIDTH: Record<RiskBand, number> = { low: 25, medium: 50, high: 75, extreme: 100, unknown: 0 };

/** 相对宽度 → 风险档位；阈值是公开的分档，不是模型输出。 */
export function uncertaintyBand(relativeWidth: number | null): RiskBand {
  if (relativeWidth === null || !Number.isFinite(relativeWidth)) return 'unknown';
  if (relativeWidth < 0.3) return 'low';
  if (relativeWidth < 0.6) return 'medium';
  if (relativeWidth < 1.0) return 'high';
  return 'extreme';
}

const n1 = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value);

/** §14 风险剖面：五个横向条，每个都由一个真实字段驱动，并附「为什么 / 来源 / 研究链接」。 */
export function buildRiskProfile(input: RiskProfileInput): RiskItem[] {
  const volBand = riskBandFromScore(input.marketRisk);
  const dataBand = riskBandFromScore(input.confidence === null ? null : 100 - input.confidence);
  const weatherBand = riskBandFromScore(input.climateExposure);
  const concBand = riskBandFromScore(input.hri);
  const priceBand = uncertaintyBand(input.priceRelWidth);
  return [
    {
      id: 'volatility', label: '市场波动', score: input.marketRisk, width: input.marketRisk ?? BAND_WIDTH[volBand], band: volBand,
      value: input.marketRisk === null ? '暂不可用' : `${n1(input.marketRisk)} / 100（模型综合）`,
      why: '模型把波动、回撤、异常与下行波动加权成一个市场风险分，描述的是当前市场环境，不是未来行情。',
      sources: [{ label: 'market_risk', value: input.marketRisk === null ? '—' : n1(input.marketRisk) }],
      researchId: 'A1.7', researchLabel: '作物 × 价格波动',
    },
    {
      id: 'price_uncertainty', label: '价格不确定性', score: null, width: BAND_WIDTH[priceBand], band: priceBand,
      value: input.priceRelWidth === null ? '暂不可用' : `相对宽度 ${(input.priceRelWidth * 100).toFixed(0)}%（区间 ${num(input.priceLow)}–${num(input.priceHigh)} ${input.unit}）`,
      why: '价格不确定性来自模型给出的情景区间相对宽度；区间越宽代表模型对中心值越不能确定，且该区间未校准为概率区间。',
      sources: [
        { label: '价格区间', value: `${num(input.priceLow)} – ${num(input.priceHigh)}` },
        { label: '相对宽度', value: input.priceRelWidth === null ? '—' : `${(input.priceRelWidth * 100).toFixed(0)}%` },
      ],
      researchId: 'A1.3', researchLabel: '月份 × 价格',
    },
    {
      id: 'weather', label: '天气暴露', score: input.climateExposure, width: input.climateExposure ?? BAND_WIDTH[weatherBand], band: weatherBand,
      value: input.climateExposure === null ? '缺少截止日可用来源' : `${n1(input.climateExposure)} / 100（历史季节性）`,
      why: '历史季节性气候暴露，由多年 NDVI 月度数据得到；它是历史参考，不是天气预报，气候异常也不等于减产。',
      sources: [{ label: 'climate_exposure', value: input.climateExposure === null ? '—' : n1(input.climateExposure) }],
      researchId: 'A2.2', researchLabel: '降水 × 价格',
    },
    {
      id: 'concentration', label: '生产结构集中', score: input.hri, width: input.hri ?? BAND_WIDTH[concBand], band: concBand,
      value: input.hri === null ? '暂不可用' : `${n1(input.hri)} / 100（跟风环境强度）`,
      why: 'HRI 衡量扩种诱因与跟风环境强度，用来提示「生产结构可能过度集中」的环境压力，不是扩种概率，也不是因果预测。',
      sources: [{ label: 'hri', value: input.hri === null ? '—' : n1(input.hri) }],
      researchId: 'A7.4', researchLabel: '区县 × 作物结构',
    },
    {
      id: 'data', label: '数据充分度', score: input.confidence === null ? null : 100 - input.confidence,
      width: input.confidence === null ? 0 : input.confidence, band: dataBand,
      value: input.confidence === null ? '暂不可用' : `${n1(input.confidence)} / 100 可信度（越高越充分）`,
      why: '数据充分度用模型综合可信度表示：样本量、模型稳定性、校准与否、是否优于基线共同决定它。分数低代表证据薄。',
      sources: [{ label: 'overall_confidence', value: input.confidence === null ? '—' : n1(input.confidence) }],
      researchId: 'A6.9', researchLabel: '预测模型解释',
    },
  ];
}

export type CompareLabel = '更值得关注' | '可关注' | '谨慎' | '暂无明显优势' | '数据不足';
export const COMPARE_LABELS: CompareLabel[] = ['更值得关注', '可关注', '谨慎', '暂无明显优势', '数据不足'];

export interface CompareInput {
  hasData: boolean;
  direction: ForecastDirection;
  risk: RiskBand;
  hri: RiskBand;
  confidence: ConfidenceBand;
  longCertainty: LongCertainty;
}

/**
 * §13 结论判定：只允许五个词，且完全由真实档位决定。
 * 不做评分（当前正式模型没有可比收益，任何分数都会是编造）。
 */
export function compareConclusion(input: CompareInput): CompareLabel {
  if (!input.hasData) return '数据不足';
  const riskHigh = input.risk === 'high' || input.risk === 'extreme';
  const hriHigh = input.hri === 'high' || input.hri === 'extreme';
  if (riskHigh || hriHigh) return '谨慎';
  const exploratory = input.longCertainty === 'exploratory' || input.longCertainty === 'research_only' || input.longCertainty === 'unknown';
  if (input.direction === 'up' && input.confidence === 'high' && !exploratory) return '更值得关注';
  if (input.direction === 'up') return '可关注';
  if (input.direction === 'flat' && input.confidence !== 'low') return '可关注';
  return '暂无明显优势';
}

export interface HistoryAnchor { daysAgo: number; price: number; }

/**
 * 历史锚点：没有独立的日度历史序列端点，就用 daily 快照真实发布的
 * change_1d / change_7d / change_30d 反推当日价格，作为「同图」的观测点。
 * 只做确定性换算，不插值、不补点；任一变化率缺失就不产出该锚点。
 */
export function historyAnchors(latest: number | null, changes: { daysAgo: number; relative: number | null }[]): HistoryAnchor[] {
  if (latest === null || latest <= 0) return [];
  const anchors: HistoryAnchor[] = [{ daysAgo: 0, price: latest }];
  for (const change of changes) {
    if (change.relative === null || change.relative <= -1 || !Number.isFinite(change.relative)) continue;
    anchors.push({ daysAgo: change.daysAgo, price: latest / (1 + change.relative) });
  }
  return anchors.sort((a, b) => b.daysAgo - a.daysAgo);
}