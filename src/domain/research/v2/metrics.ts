/**
 * 指标与单位契约（V5 §10–§16）。
 *
 * 三条硬规则：
 *   1. **真实物理量必须带单位**，且写在值后面（`24.6 mm`），不用「降水量（mm）」这种括号写法（§11）。
 *   2. **自定义指标不写「无量纲」**，靠正式定义体系解释；没有定义就只给可靠名称（§12/§13）。
 *   3. **单位与定义只能转述研究侧声明**，前端绝不发明（§13）。
 *      本文件里每一处 `unit` / `definition` 都能追到出处：
 *        - 研究自己的《单位纪律》（reports/v2/00_研究总览.md）
 *        - 列名里的单位后缀（`_ha` / `_t` / `_kg_ha` / `_per_mm` / `_pct`）
 *        - 文章正文（A01 §2.3 变量定义、§3.1 方法）
 *
 * 缺口（没有 definition / formula / interpretation 的）记入 `docs/METRIC_GAPS.md`，
 * 未登记的中文列名的缺口记入 `docs/TABLE_SCHEMA_GAPS.md`。
 */

export type MetricKind = 'physical' | 'derived' | 'statistical';

export interface MetricDefinition {
  id: string;
  label: string;
  kind: MetricKind;
  /** 单位：只有研究侧声明过才写。 */
  unit?: string;
  definition?: string;
  formula?: string;
  interpretation?: string;
  precision?: number;
  sourceIds?: string[];
}

export interface MetricValue {
  metricId: string;
  value: number | string;
}

/** 列的值类型：区分「指标」与「标识/分类」。 */
export type ColumnValueType = 'number' | 'text' | 'boolean';

export interface ColumnMeta {
  key: string;
  label: string;
  /** 纯标识 / 分类列不参与指标体系，标为 text。 */
  kind: MetricKind | 'text';
  valueType: ColumnValueType;
  unit?: string;
  precision?: number;
  /**
   * 内部机读列（§8/§10：不把数据库字段搬进界面）。
   * 典型是 `window_key`：它和 `window` 表达同一件事，而 `window` 已经是研究自己写的
   * 「0日 / 1-3日 / 4-7日 / 8-14日」。两张都渲染会得到两个同名「滞后窗口」列。
   * 这类列仍然**必须登记**（否则 verify 会报未覆盖），但不显示。
   */
  internal?: boolean;
}

/** 成交量红线（V5 §14）：单位未公开，写一次、不逐格重复。 */
export const VOLUME_UNIT_NOTE = '成交量沿用市场公开口径，原始单位未披露。';
/** 气象口径红线：ERA5 是再分析，不是气象站实测（研究红线，见 index 的 redLines）。 */
export const REANALYSIS_NOTE = '气象为 ERA5 再分析，非气象站实测。';

const UNIT_PERCENT = '%';

/**
 * 受控列名映射：表里出现过的每一列都必须在这里登记（否则不渲染原始 key）。
 * 覆盖性由 `scripts/verify-v2-payload.mjs` 强制检查。
 */
export const COLUMN_META: Record<string, ColumnMeta> = {
  // ---- 标识 / 分类 ----
  crop: { key: 'crop', label: '品种', kind: 'text', valueType: 'text' },
  district: { key: 'district', label: '区县', kind: 'text', valueType: 'text' },
  variable: { key: 'variable', label: '变量', kind: 'text', valueType: 'text' },
  response: { key: 'response', label: '响应变量', kind: 'text', valueType: 'text' },
  outcome: { key: 'outcome', label: '结果变量', kind: 'text', valueType: 'text' },
  exposure: { key: 'exposure', label: '暴露变量', kind: 'text', valueType: 'text' },
  hazard: { key: 'hazard', label: '天气事件', kind: 'text', valueType: 'text' },
  model: { key: 'model', label: '模型口径', kind: 'text', valueType: 'text' },
  mode: { key: 'mode', label: '检验模式', kind: 'text', valueType: 'text' },
  window: { key: 'window', label: '滞后窗口', kind: 'text', valueType: 'text' },
  // 机读窗口编号（w0 / w13 / w47 / w814）：与 window 同义，登记但不显示，避免两个「滞后窗口」。
  window_key: { key: 'window_key', label: '窗口编号', kind: 'text', valueType: 'text', internal: true },
  start: { key: 'start', label: '起始', kind: 'text', valueType: 'text' },
  end: { key: 'end', label: '结束', kind: 'text', valueType: 'text' },
  ids: { key: 'ids', label: '事件编号', kind: 'text', valueType: 'text' },
  ar_control: { key: 'ar_control', label: '自相关控制', kind: 'text', valueType: 'text' },
  is_core: { key: 'is_core', label: '核心口径', kind: 'text', valueType: 'boolean' },
  contaminated: { key: 'contaminated', label: '受污染事件', kind: 'text', valueType: 'boolean' },
  same_sign: { key: 'same_sign', label: '方向一致', kind: 'text', valueType: 'boolean' },

  // ---- 样本与计数 ----
  n: { key: 'n', label: '样本量', kind: 'derived', valueType: 'number', unit: '个' },
  n_eff: { key: 'n_eff', label: '有效样本量', kind: 'derived', valueType: 'number', precision: 1 },
  n_events: { key: 'n_events', label: '事件数', kind: 'derived', valueType: 'number', unit: '个' },
  n_placebo: { key: 'n_placebo', label: '安慰剂样本数', kind: 'derived', valueType: 'number', unit: '个' },
  n_clusters: { key: 'n_clusters', label: '聚类数', kind: 'derived', valueType: 'number', unit: '个' },
  n_loo: { key: 'n_loo', label: '留一检验次数', kind: 'derived', valueType: 'number', unit: '次' },
  censored: { key: 'censored', label: '删失数（T+42 未恢复）', kind: 'derived', valueType: 'number', unit: '个' },

  // ---- 时间 ----
  years: { key: 'years', label: '年数', kind: 'physical', valueType: 'number', unit: '年' },
  test_year: { key: 'test_year', label: '检验年份', kind: 'physical', valueType: 'number', unit: '年' },
  cum_days: { key: 'cum_days', label: '累积天数', kind: 'physical', valueType: 'number', unit: '天' },
  rec_median: { key: 'rec_median', label: '恢复期中位数', kind: 'physical', valueType: 'number', precision: 1 },

  // ---- 生产（研究声明：公顷 / 吨 / 公斤·公顷⁻¹）----
  sown_area_median_ha: { key: 'sown_area_median_ha', label: '播种面积中位数', kind: 'physical', valueType: 'number', unit: '公顷', precision: 0 },
  area_median: { key: 'area_median', label: '播种面积中位数', kind: 'physical', valueType: 'number', unit: '公顷', precision: 0 },
  production_median_t: { key: 'production_median_t', label: '产量中位数', kind: 'physical', valueType: 'number', unit: '吨', precision: 0 },
  prod_median: { key: 'prod_median', label: '产量中位数', kind: 'physical', valueType: 'number', unit: '吨', precision: 0 },
  yield_median_kg_ha: { key: 'yield_median_kg_ha', label: '单产中位数', kind: 'physical', valueType: 'number', unit: '公斤/公顷', precision: 0 },
  yield_median: { key: 'yield_median', label: '单产中位数', kind: 'physical', valueType: 'number', unit: '公斤/公顷', precision: 0 },

  // ---- 系数 ----
  beta: { key: 'beta', label: '系数 β', kind: 'statistical', valueType: 'number' },
  beta_raw: { key: 'beta_raw', label: '原始系数', kind: 'statistical', valueType: 'number' },
  beta_raw_per_mm: { key: 'beta_raw_per_mm', label: '每毫米原始系数', kind: 'statistical', valueType: 'number', unit: '每毫米' },
  beta_per_sd: { key: 'beta_per_sd', label: '每标准差系数', kind: 'statistical', valueType: 'number', unit: '每标准差' },
  beta_per_year: { key: 'beta_per_year', label: '年变化系数', kind: 'statistical', valueType: 'number' },
  beta_volume: { key: 'beta_volume', label: '成交量系数', kind: 'statistical', valueType: 'number' },
  beta_full: { key: 'beta_full', label: '全样本系数', kind: 'statistical', valueType: 'number' },
  beta_min: { key: 'beta_min', label: '最小系数', kind: 'statistical', valueType: 'number' },
  beta_max: { key: 'beta_max', label: '最大系数', kind: 'statistical', valueType: 'number' },
  annual_pct: { key: 'annual_pct', label: '年化变化', kind: 'derived', valueType: 'number', unit: UNIT_PERCENT, precision: 2 },
  rel_gain_pct: { key: 'rel_gain_pct', label: '相对增益', kind: 'derived', valueType: 'number', unit: UNIT_PERCENT, precision: 1 },
  seasonal_range: { key: 'seasonal_range', label: '季节指数极差', kind: 'derived', valueType: 'number', precision: 3 },

  // ---- 统计量 ----
  se: { key: 'se', label: '标准误', kind: 'statistical', valueType: 'number' },
  se_cluster: { key: 'se_cluster', label: '聚类稳健标准误', kind: 'statistical', valueType: 'number' },
  t: { key: 't', label: 't 值', kind: 'statistical', valueType: 'number', precision: 2 },
  t_stat: { key: 't_stat', label: 't 统计量', kind: 'statistical', valueType: 'number', precision: 2 },
  wald_F: { key: 'wald_F', label: 'Wald F', kind: 'statistical', valueType: 'number', precision: 2 },
  F_crop_interaction: { key: 'F_crop_interaction', label: '品种交互 F', kind: 'statistical', valueType: 'number', precision: 2 },
  df1: { key: 'df1', label: '自由度', kind: 'statistical', valueType: 'number', precision: 0 },
  r2: { key: 'r2', label: 'R²', kind: 'statistical', valueType: 'number', precision: 3 },
  ar1: { key: 'ar1', label: 'AR(1)', kind: 'statistical', valueType: 'number', precision: 3 },
  ar1_coef: { key: 'ar1_coef', label: 'AR(1) 系数', kind: 'statistical', valueType: 'number', precision: 3 },
  ci_low: { key: 'ci_low', label: '区间下限', kind: 'statistical', valueType: 'number' },
  ci_high: { key: 'ci_high', label: '区间上限', kind: 'statistical', valueType: 'number' },
  p_raw: { key: 'p_raw', label: '原始 p 值', kind: 'statistical', valueType: 'number', precision: 4 },
  q_fdr: { key: 'q_fdr', label: 'FDR 校正 q 值', kind: 'statistical', valueType: 'number', precision: 4 },
  p_wild_boot: { key: 'p_wild_boot', label: '野 bootstrap p 值', kind: 'statistical', valueType: 'number', precision: 4 },
  placebo_mean: { key: 'placebo_mean', label: '安慰剂均值', kind: 'statistical', valueType: 'number' },
  placebo_sd: { key: 'placebo_sd', label: '安慰剂标准差', kind: 'statistical', valueType: 'number' },
  placebo_p: { key: 'placebo_p', label: '安慰剂 p 值', kind: 'statistical', valueType: 'number', precision: 4 },
  post_mean: { key: 'post_mean', label: '事件后均值', kind: 'statistical', valueType: 'number' },
  x_mean: { key: 'x_mean', label: '暴露变量均值', kind: 'derived', valueType: 'number' },
  x_sd: { key: 'x_sd', label: '暴露变量标准差', kind: 'derived', valueType: 'number' },

  // ---- 预测/稳健性：单位在研究侧未声明，只有数值（记入 METRIC_GAPS）----
  baseline: { key: 'baseline', label: '基线 RMSE', kind: 'derived', valueType: 'number', precision: 4 },
  weather: { key: 'weather', label: '含天气模型 RMSE', kind: 'derived', valueType: 'number', precision: 4 },
  delta_rmse: { key: 'delta_rmse', label: 'RMSE 变化', kind: 'derived', valueType: 'number', precision: 4 },

  // ---- 推演（平行情景）表：严格中文化，禁止露出 gate_min_r2 / severity_mult 这类工程字段（§47/§76/§78）----
  target: { key: 'target', label: '门控目标', kind: 'text', valueType: 'text' },
  r2_sim_vs_actual: { key: 'r2_sim_vs_actual', label: '模拟与实测 R²', kind: 'statistical', valueType: 'number', precision: 3 },
  gate_min_r2: { key: 'gate_min_r2', label: '模型门槛（R² 下限）', kind: 'statistical', valueType: 'number', precision: 3 },
  gate_pass: { key: 'gate_pass', label: '是否通过门控', kind: 'text', valueType: 'boolean' },
  severity_mult: { key: 'severity_mult', label: '事件强度倍率', kind: 'derived', valueType: 'number', precision: 2 },
  mean_gap_volume_z: { key: 'mean_gap_volume_z', label: '成交量标准化缺口 z', kind: 'statistical', valueType: 'number', precision: 3 },
  mean_gap_price_z: { key: 'mean_gap_price_z', label: '价格标准化缺口 z', kind: 'statistical', valueType: 'number', precision: 3 },
  mean_gap_volume_pct: { key: 'mean_gap_volume_pct', label: '成交量缺口比例', kind: 'derived', valueType: 'number', unit: UNIT_PERCENT, precision: 1 },
  mean_gap_price_pct: { key: 'mean_gap_price_pct', label: '价格缺口比例', kind: 'derived', valueType: 'number', unit: UNIT_PERCENT, precision: 1 },
  buffer_frac: { key: 'buffer_frac', label: '供应缓冲比例', kind: 'derived', valueType: 'number', unit: UNIT_PERCENT, precision: 0 },
  price_gap_z_remaining: { key: 'price_gap_z_remaining', label: '剩余价格缺口 z', kind: 'statistical', valueType: 'number', precision: 3 },
  price_impact_avoided_z: { key: 'price_impact_avoided_z', label: '避免的价格冲击 z', kind: 'statistical', valueType: 'number', precision: 3 },
  avoided_fraction: { key: 'avoided_fraction', label: '避免比例', kind: 'derived', valueType: 'number', unit: UNIT_PERCENT, precision: 1 },
  pooled: { key: 'pooled', label: '总体', kind: 'text', valueType: 'text' },
  world: { key: 'world', label: '情景', kind: 'text', valueType: 'text' },
};

/**
 * 与具体列无关的工程枚举值（V5 §47/§76/§77）：
 * 研究表里这些**全大写**词是内部口径名，界面上必须中文化，且与列无关的写法都要覆盖。
 */
export const GLOBAL_VALUE_LABELS: Record<string, string> = {
  POOLED: '总体',
  PER_CROP: '分品种',
  LODO: '留一天',
  LOYO: '留一年',
  TRUE: '是',
  FALSE: '否',
};

/** 受控取值中文（V5 §76：任何英文枚举都必须置于中文语境）。 */
export const VALUE_LABELS: Record<string, Record<string, string>> = {
  variable: { price: '价格', volume: '成交量' },
  response: { price: '价格', volume: '成交量' },
  outcome: { price: '价格', volume: '成交量', log_yield: '单产（对数）' },
  hazard: { heat: '高温', rain: '降雨' },
  mode: { lodo: '留一天', loyo: '留一年' },
  /** §77：POOLED 面向用户写作「总体」。情景表里 target 同时出现 price / volume。 */
  target: { POOLED: '总体', price: '价格', volume: '成交量' },
  window_key: { w0: '当日', w13: '1–3 日', w47: '4–7 日', w814: '8–14 日' },
  model: { 'price_z ~ volume_z + price_lag1': '价格 z ~ 成交量 z + 价格滞后 1 期' },
  exposure: {
    cloud_cover: '云量',
    dew_point: '露点温度',
    et0: '参考蒸散 ET₀',
    et0_sum: '累积参考蒸散 ET₀',
    growing_season_precip: '生长季降水',
    growing_season_temp_mean: '生长季平均气温',
    heavy_rain_days: '强降雨日数',
    humidity: '相对湿度',
    max_1d_precip: '单日最大降水',
    precip_7d: '7 日累积降水',
    precipitation: '降水量',
    pressure_msl: '海平面气压',
    radiation: '短波辐射',
    soil_moisture_0_7: '0–7cm 土壤含水量',
    temp_max: '日最高气温',
    vpd: '饱和水汽压差 VPD',
    vpd_mean: '平均饱和水汽压差 VPD',
    wind_speed: '风速',
  },
};

/**
 * 指标定义（V5 §53）。只收录研究正文/方法里**明确写过**的定义与公式；
 * 没写的不要在这里补，缺口记入 `docs/METRIC_GAPS.md`。
 */
export const METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  {
    id: 'seasonal_index',
    label: '季节指数',
    kind: 'derived',
    definition: '某月该变量的均值 / 全年均值。',
    formula: 'seasonal_index = 月均值 ÷ 全年均值',
    sourceIds: ['A01'],
  },
  {
    id: 'seasonal_range',
    label: '季节指数极差',
    kind: 'derived',
    definition: '季节指数的最大值减最小值，用于衡量季节波动幅度。',
    formula: 'max(季节指数) − min(季节指数)',
    sourceIds: ['A01'],
  },
  {
    id: 'trend_beta_per_year',
    label: '年化趋势',
    kind: 'statistical',
    definition: '对变量取对数后对时间回归得到的年化斜率。',
    formula: 'log(变量) ~ t，t 为自 2021-01-01 起的年数；HAC(14) 稳健标准误',
    interpretation: '正值表示随时间上升，负值表示下降；仅描述观测期内的变化。',
    sourceIds: ['A01'],
  },
  {
    id: 'stl_seasonal_strength',
    label: 'STL 季节强度',
    kind: 'derived',
    definition: 'STL 稳健分解得到的季节成分强度。',
    formula: 'STL(period=52 周, robust=True)',
    interpretation: '含目标年，仅作描述性对照，不作为无未来信息口径。',
    sourceIds: ['A01'],
  },
  {
    id: 'ar1',
    label: 'AR(1)',
    kind: 'statistical',
    definition: '序列滞后 1 期自相关系数。',
    sourceIds: ['A01'],
  },
  {
    id: 'n_eff',
    label: '有效样本量',
    kind: 'statistical',
    definition: '考虑自相关后的有效样本量，用于说明名义样本量与实际信息量的差距。',
    sourceIds: ['A01'],
  },
  {
    id: 'q_fdr',
    label: 'FDR 校正 q 值',
    kind: 'statistical',
    definition: '多重检验的 Benjamini–Hochberg FDR 校正结果。',
    formula: '家族定义：10 品种 × 2 响应 = 20 项',
    interpretation: 'q < 0.05 视为校正后显著。',
    sourceIds: ['A01'],
  },
  {
    id: 'beta_per_sd',
    label: '每标准差系数',
    kind: 'statistical',
    definition: '把暴露变量按 1 个标准差缩放后的效应值，用于跨变量比较。',
    sourceIds: ['A02'],
  },
  {
    id: 'post_mean',
    label: '事件后均值',
    kind: 'statistical',
    definition: '极端事件窗口内去季节化稳健 z 的均值（event study 口径）。',
    sourceIds: ['A04'],
  },
  {
    id: 'placebo_mean',
    label: '安慰剂均值',
    kind: 'statistical',
    definition: '用随机抽取的非事件日构造的安慰剂分布均值，用于判断真实事件是否偏离常态。',
    sourceIds: ['A04'],
  },
  {
    id: 'rec_median',
    label: '恢复期中位数',
    kind: 'derived',
    definition: '去季节化 z 回到谷底 90% 以上所需天数的中位数；T+42 未恢复记为删失。',
    sourceIds: ['A05'],
  },
  {
    id: 'cum_days',
    label: '累积天数',
    kind: 'physical',
    unit: '天',
    definition: '累积降水/累积暴露所覆盖的窗口天数。',
    sourceIds: ['A03'],
  },
];

const COLUMN_INDEX = new Map(Object.entries(COLUMN_META));

/** 未登记列返回 null：调用方**不得**回退成原始 key（V5 §36）。 */
export function columnMeta(key: string): ColumnMeta | null {
  return COLUMN_INDEX.get(key) ?? null;
}
export function columnLabel(key: string): string | null {
  return columnMeta(key)?.label ?? null;
}

/** 分类取值的受控中文；没有映射就返回原值（不猜）。 */
export function valueLabel(columnKey: string, raw: string): string {
  const label = VALUE_LABELS[columnKey]?.[raw] ?? GLOBAL_VALUE_LABELS[raw];
  if (label !== undefined) return label;
  /*
   * 没登记过的取值：这里保留原值而不是显示「—」。
   * 取值是**内容**，不是列名 —— 把它藏起来会让读者以为这一格没有数据（§2 不伪造、不改写），
   * 而 §36 禁止的是泄漏英文列名，列名已由 DataTable 的受控映射挡住。
   * 但这是映射缺口，开发期必须能看见（生产构建里 import.meta.env.DEV 为假，整段被去掉）。
   */
  if (import.meta.env.DEV) console.info(`未登记的取值（需补 VALUE_LABELS）：${columnKey} = ${raw}`);
  return raw;
}

export function formatNumber(value: number, precision?: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (precision !== undefined) {
    if (abs !== 0 && abs < 0.001) return value.toExponential(1);
    return value.toFixed(precision);
  }
  if (abs < 0.001) return value.toExponential(1);
  if (abs >= 1000) return value.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
  if (abs >= 100) return value.toFixed(1);
  if (abs >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

/**
 * 统一数值呈现（V5 §16）。
 * - 缺失值 → 「—」
 * - 真实物理量 → 值 + 空格 + 单位（`24.6 mm`）
 * - 百分比 → `-3.07%`
 * - 布尔 → 是/否
 */
export function formatMetricValue(value: number | string | null | undefined, meta: ColumnMeta | null): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === 'True') return '是';
    if (trimmed === 'False') return '否';
    const numeric = Number(trimmed);
    if (trimmed !== '' && Number.isFinite(numeric)) return formatMetricValue(numeric, meta);
    return trimmed;
  }
  const text = formatNumber(value, meta?.precision);
  if (!meta?.unit) return text;
  if (meta.unit === UNIT_PERCENT) return `${text}%`;
  return `${text} ${meta.unit}`;
}

/* ------------------------------------------------------------------ *
 * 正文术语（V5 §76）
 *
 * 研究正文里会出现英文标识符。§76 的要求是：英文工程字段清理掉，
 * 只允许保留标准名称（STL / HAC / SHAP / ALE / R² / z / ERA5），且必须处在中文语境。
 *
 * 下面三件事一起构成这条规则，全部只作用于**反引号里的标识符**（研究自己标记的术语）：
 *   1. REGISTERED —— 列名与分类取值直接复用表里的中文名，两边永远一致；
 *   2. PROSE_TERMS —— 只在叙述里出现、不进任何表格的指标名；每条都能追到研究的同义表述（见注释）；
 *   3. GLOSS_UNWRAP —— 研究写成「`标识符`（中文定义）」的，直接留下中文定义，
 *      因为标识符本身就是冗余的英文工程名（例：`growing_season_precip`（生长季累计降水，mm））。
 * 其余不认识的标识符一律不渲染，绝不把英文工程名露给读者；
 * 只有公式与统计记号（含 = → ~ · β ε Σ 等，或 `y_(t-1)` 这类下标）原样保留。
 * ------------------------------------------------------------------ */

/**
 * 只出现在研究叙述里、不进表格的指标名。
 * 每条都抄自研究自己的同义表述，前端没有新增术语：
 *   A02 §2「价格异常 `price_z` / 成交量异常 `volume_z`」
 *   A04 §2「事件相对化异常 z `z_rel`」
 *   A08 §2「次要结局 `production`：总产量」「结构变量 `sown_area`：播种面积」
 */
export const PROSE_TERMS: Record<string, string> = {
  price_z: '价格异常',
  volume_z: '成交量异常',
  z_rel: '事件相对化异常',
  production: '总产量',
  sown_area: '播种面积',
  // A03 §4 的四个降水窗口，与研究里 window_key 的中文一一对应。
  precip_w0: '当日',
  precip_w13: '1–3 日',
  precip_w47: '4–7 日',
  precip_w814: '8–14 日',
};

/**
 * 研究写成「`标识符`（中文定义）」的标识符。
 * 只登记**已逐条核对过括号里确实是该标识符的定义**的那些；
 * 括号里如果是别的东西（例如 A03 的 `precip_7d`（韭菜、黄瓜）是品种清单），
 * 绝不能展开，否则会把变量名换成品种名。
 */
export const GLOSS_UNWRAP = new Set([
  'growing_season_temp_mean',
  'growing_season_precip',
  'max_1d_precip',
  'heavy_rain_days',
  'vpd_mean',
  'et0_sum',
  'hot_days',
  'precip_w0',
]);

/** 研究自己的证据状态词表（A09 §1）与合并口径（§77）；出现在正文与正文表格里。 */
export const PROSE_ENUM_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bPOOLED\b/g, '总体'],
  [/\bdescriptive_only\b/g, '仅描述'],
  [/\bpartly_supported\b/g, '部分支持'],
  [/\bnot_supported\b/g, '未获支持'],
  [/\bsupported\b/g, '支持'],
];

const VALUE_INDEX = new Map<string, string>();
for (const [key, label] of Object.entries(GLOBAL_VALUE_LABELS)) VALUE_INDEX.set(key, label);
for (const mapping of Object.values(VALUE_LABELS)) {
  for (const [key, label] of Object.entries(mapping)) {
    if (!VALUE_INDEX.has(key)) VALUE_INDEX.set(key, label);
  }
}

/**
 * 正文里的术语 → 中文；返回 null 表示前端没有可信译名（调用方不得回退成英文）。
 * 列名优先于取值：两者同名时以列名为准（列名描述"这是什么"）。
 */
export function proseTerm(token: string): string | null {
  const column = COLUMN_INDEX.get(token);
  if (column) return column.label;
  const prose = PROSE_TERMS[token];
  if (prose) return prose;
  return VALUE_INDEX.get(token) ?? null;
}

/**
 * 正文里可以**裸替换**的标识符（没有加反引号的那些，例如 `**sown_area**：播种面积`）。
 *
 * 刻意收得很窄：只收「一眼就是字段名」的形状 —— 带下划线的、全大写的、
 * 或已登记在 PROSE_TERMS 里的。像 `note` / `start` / `window` 这类普通英文单词
 * 即使登记为列名也不裸替换，否则可能动到正文里正常的英文表述。
 * 按长度降序，供 markdown.tsx 直接拼成一个交替正则。
 */
export const PROSE_TOKEN_CANDIDATES: readonly string[] = [...new Set([
  ...COLUMN_INDEX.keys(),
  ...VALUE_INDEX.keys(),
  ...Object.keys(PROSE_TERMS),
])]
  .filter((key) => /^[A-Za-z][A-Za-z0-9_]*$/.test(key) && key.length >= 3)
  .filter((key) => key.includes('_') || /^[A-Z][A-Z0-9_]*$/.test(key) || key in PROSE_TERMS)
  .sort((a, b) => b.length - a.length);
