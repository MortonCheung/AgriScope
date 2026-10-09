/**
 * 跨城比较的可比较性契约（Frontend V3 §25 / §25.1）。
 *
 * 这是跨城页面唯一的"能不能比"的来源，三条硬约束：
 *
 *   1. **切换项只能来自研究侧真实导出的表与列**：每一项都指向
 *      `cross_city` 载荷里真实存在的 `<table>` 与 `<column>`（A10/A11 的
 *      `explorer.series` / `tables` 声明过）。前端不新增指标、不重算数值。
 *
 *   2. **可比性只照研究侧自己的话判**：`basis` 抄自 A10 的文章摘要与局限，
 *      不扩写、不弱化。价格层级不可比是研究红线（A10 §2.2/§6.1），
 *      因此本页**不做任何价格水平比较，更不产出六城菜价排行**。
 *
 *   3. **领先/滞后类只允许写"探索性"**：A10 局限第 5 条明确
 *      「13 个滞后中取 |相关| 最大者，未做多重比较校正，仅探索性」，
 *      不得写成"明确市场传导"。
 */

export type Comparability = 'direct' | 'exploratory' | 'not-comparable';

export const COMPARABILITY_LABEL: Record<Comparability, string> = {
  direct: '可直接比较',
  exploratory: '探索性比较',
  'not-comparable': '不可直接比较',
};

/** 与 `ag-badge[data-tone]` 对齐；只借既有证据语义色，不新造色。 */
export const COMPARABILITY_TONE: Record<Comparability, string> = {
  direct: 'observed',
  exploratory: 'exploratory',
  'not-comparable': 'unsupported',
};

export interface CrossCityMetric {
  id: string;
  label: string;
  /** 研究侧真实导出的表文件（`/api/research/cross_city/tables/<file>`）。 */
  table: string;
  /** 研究侧真实列名（渲染走 COLUMN_META 受控中文，前端不改写列名）。 */
  valueColumn: string;
  /** city：可按城市画横向比较；pair/crop：只能逐行看配对或作物。 */
  kind: 'city' | 'pair' | 'crop';
  comparability: Comparability;
  /** 为什么这样标注；可追到 A10 原文。 */
  basis: string;
}

/**
 * 指标切换项。全部来自 A10 的五张真实表：
 *   cross_city_production_concentration.csv / cross_city_seasonal_sync.csv /
 *   cross_city_seasonal_sync_by_crop.csv / cross_city_resilience.csv /
 *   cross_city_cross_city_lead_lag.csv
 * 没有真实列的气候类对比**不放**（研究侧未导出气候列）。
 */
export const CROSS_CITY_METRICS: readonly CrossCityMetric[] = [
  {
    id: 'hhi',
    label: '生产集中度 HHI',
    table: 'cross_city_production_concentration.csv',
    valueColumn: 'HHI',
    kind: 'city',
    comparability: 'direct',
    basis: '各城 HHI 由同一方法计算，属生产结构（年鉴口径）指标；研究只禁止价格水平比较，结构化指标可跨城直接比较。',
  },
  {
    id: 'cr4',
    label: '生产集中度 CR4',
    table: 'cross_city_production_concentration.csv',
    valueColumn: 'CR4',
    kind: 'city',
    comparability: 'direct',
    basis: '与 HHI 同表同口径（前四作物占比合计），可直接跨城比较。',
  },
  {
    id: 'seasonal-pairs',
    label: '市场季节同步（城际配对）',
    table: 'cross_city_seasonal_sync.csv',
    valueColumn: 'seasonal_corr',
    kind: 'pair',
    comparability: 'exploratory',
    basis: '研究局限：季节同步可检验对极少（同频率每作物仅 1 对），无置信区间，只能作为「存在较强同步」的初步信号；逐行的可比性另按频率是否一致判定。',
  },
  {
    id: 'seasonal-crop',
    label: '市场季节同步（作物均值）',
    table: 'cross_city_seasonal_sync_by_crop.csv',
    valueColumn: 'mean_corr',
    kind: 'crop',
    comparability: 'exploratory',
    basis: '研究局限：季节同步效应量未量化（以均值相关表示，未给置信区间），且样本对数极少。',
  },
  {
    id: 'resilience-z',
    label: '极端事件响应（事件后 z 中位数）',
    table: 'cross_city_resilience.csv',
    valueColumn: 'median_post_z',
    kind: 'city',
    comparability: 'exploratory',
    basis: '研究原文：极端天气事件后市场响应与随机日期不可分辨（安慰剂 p 见同表），故不作确定性比较。',
  },
  {
    id: 'resilience-p',
    label: '极端事件安慰剂 p 值',
    table: 'cross_city_resilience.csv',
    valueColumn: 'placebo_p',
    kind: 'city',
    comparability: 'exploratory',
    basis: '安慰剂 p 用于判断真实事件是否偏离随机；数值越接近 1 越与随机不可分辨，仅作探索性对照。',
  },
  {
    id: 'lead-lag',
    label: '区域领先/滞后（最佳滞后相关系数）',
    table: 'cross_city_cross_city_lead_lag.csv',
    valueColumn: 'corr_at_best',
    kind: 'pair',
    comparability: 'exploratory',
    basis: '研究局限：领先/滞后为选择性最大化（13 个滞后中取 |相关| 最大者，未做多重比较校正），仅探索性，**不构成市场传导结论**。',
  },
];

export function findMetric(id: string | null): CrossCityMetric {
  return CROSS_CITY_METRICS.find((metric) => metric.id === id) ?? CROSS_CITY_METRICS[0];
}

/**
 * 城际配对的逐行可比性：只看研究侧真实列 `freq_pair`。
 *   same  → 同频率（例如朝阳—锦州均为日度）：口径一致，可直接比较；
 *   mixed → 频率不同（日度 × 周度）：粒度不一，不可直接比较（A10 局限第 2 条）。
 */
export function pairComparability(freqPair: string | undefined): Comparability {
  return freqPair === 'same' ? 'direct' : 'not-comparable';
}

/** 频率取值的中文（研究侧真实列 freq_a / freq_b 用 D / W 记）。 */
export const FREQ_LABEL: Record<string, string> = { D: '日度', W: '周度' };

/** 频率配对取值的中文（研究侧真实列 freq_pair 用 same / mixed 记）。 */
export const FREQ_PAIR_LABEL: Record<string, string> = { same: '同频率', mixed: '频率不同' };

/**
 * 六城价格口径登记（§25.1 硬红线）。
 *
 * 研究摘要只写到「六城价格层级不同（批发/市场均价/超市/产地）」，未逐城指名；
 * 逐城口径由本项目 §25 登记，用于说明**为什么不做价格水平比较**，
 * 不作为任何数值来源，也不参与任何比较计算。
 */
export const PRICE_SCALE_REGISTRY: readonly { city: string; scale: string }[] = [
  { city: '沈阳', scale: '批发价' },
  { city: '朝阳', scale: '市场均价' },
  { city: '锦州', scale: '超市 / OCR 采集' },
  { city: '大连', scale: '周度混合口径' },
  { city: '丹东', scale: '产地价' },
  { city: '铁岭', scale: '产地价' },
];