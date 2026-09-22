import type { EvidenceLevelCode, ResearchStatus } from '../domain/research/types';

/**
 * 图表令牌：把"数据变量语义色"与"证据来源样式"集中在一处，
 * 避免几十个组件各写各的十六进制颜色。
 */

export type DataVariableKey =
  | 'price'
  | 'volume'
  | 'rain'
  | 'temperature'
  | 'humidity'
  | 'soil'
  | 'wind'
  | 'radiation'
  | 'extreme'
  | 'model'
  | 'null';

export const DATA_COLORS: Record<DataVariableKey, string> = {
  price: 'var(--ag-data-price)',
  volume: 'var(--ag-data-volume)',
  rain: 'var(--ag-data-rain)',
  temperature: 'var(--ag-data-temp)',
  humidity: 'var(--ag-data-humidity)',
  soil: 'var(--ag-data-soil)',
  wind: 'var(--ag-data-wind)',
  radiation: 'var(--ag-data-radiation)',
  extreme: 'var(--ag-data-extreme)',
  model: 'var(--ag-data-model)',
  null: 'var(--ag-data-null)',
};

/** 实际观测 / 模型估计 / 情景模拟必须在视觉上可区分。 */
export type Provenance = 'observed' | 'model' | 'scenario';

export const PROVENANCE = {
  observed: { label: '实际观测', dash: undefined as string | undefined, opacity: 1 },
  model: { label: '模型估计', dash: '6 4', opacity: 0.92 },
  scenario: { label: '情景模拟', dash: '2 5', opacity: 0.85 },
} as const;

export const CHART_TOKENS = {
  grid: 'rgb(26 25 23 / 0.07)',
  gridStrong: 'rgb(26 25 23 / 0.14)',
  axis: 'rgb(26 25 23 / 0.30)',
  annotation: 'rgb(26 25 23 / 0.55)',
  annotationStrong: 'var(--ag-data-extreme)',
  label: 'var(--ag-ink-muted)',
  labelStrong: 'var(--ag-ink)',
  surface: 'var(--ag-paper-raised)',
  band: 'rgb(26 25 23 / 0.045)',
  ciBand: 'rgb(26 25 23 / 0.10)',
  fontFamily: 'var(--ag-font-mono)',
  fontSize: 10,
} as const;

const VARIABLE_ALIASES: Record<string, DataVariableKey> = {
  price: 'price', 价格: 'price', 批发价格: 'price', '价': 'price',
  volume: 'volume', 成交量: 'volume', 到货量: 'volume', '量': 'volume',
  precip: 'rain', precipitation: 'rain', rain: 'rain', 降水: 'rain', 降雨: 'rain', 暴雨: 'rain',
  temp: 'temperature', temperature: 'temperature', temp_max: 'temperature', temp_mean: 'temperature', 温度: 'temperature', 高温: 'temperature',
  humidity: 'humidity', 湿度: 'humidity',
  soil: 'soil', soil_moisture: 'soil', 土壤: 'soil', 土壤水分: 'soil',
  wind: 'wind', wind_speed: 'wind', 风速: 'wind',
  radiation: 'radiation', vpd: 'radiation', et0: 'radiation', 辐射: 'radiation',
  extreme: 'extreme', event: 'extreme', 极端: 'extreme',
};

export function dataVariableKey(raw: string | null | undefined): DataVariableKey {
  if (!raw) return 'null';
  const normalized = raw.trim().toLowerCase();
  for (const [alias, key] of Object.entries(VARIABLE_ALIASES)) {
    if (normalized === alias.toLowerCase()) return key;
  }
  for (const [alias, key] of Object.entries(VARIABLE_ALIASES)) {
    if (normalized.includes(alias.toLowerCase())) return key;
  }
  return 'null';
}

export function variableColor(raw: string | null | undefined): string {
  return DATA_COLORS[dataVariableKey(raw)];
}

export const EVIDENCE_TONE: Record<EvidenceLevelCode, string> = {
  A: 'var(--ag-evidence-a)',
  B: 'var(--ag-evidence-b)',
  C: 'var(--ag-evidence-c)',
  D: 'var(--ag-evidence-d)',
  Unsupported: 'var(--ag-evidence-unsupported)',
};

export const STATUS_TONE: Record<ResearchStatus, string> = {
  supported: 'var(--ag-evidence-a)',
  null_result: 'var(--ag-evidence-b)',
  descriptive: 'var(--ag-evidence-c)',
  exploratory: 'var(--ag-evidence-d)',
  unsupported: 'var(--ag-evidence-unsupported)',
};

/** 作物在对比图中的稳定色序（与变量语义色区分开，用于品类维度）。 */
export const CROP_SERIES = [
  '#1f1d1b', '#4e6e8e', '#7c8a63', '#b4633a', '#6e8a85',
  '#8a6f4a', '#7e8ca0', '#bf9a4a', '#6b6670', '#a8402e',
];
