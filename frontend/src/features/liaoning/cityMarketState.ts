import type { DailyCrop, DailySignal } from '../../domain/daily/types';

/**
 * 辽宁农业态势：城市市场数据状态（规范 §8「地图六态」）。
 *
 * 六态里 `hover` / `selected` 由交互决定（见 LiaoningCanvas），
 * 这里只负责四种**由真实数据推导**的静态状态：
 *
 *   normal                    市场数据可用、无异常信号
 *   warning                   Daily 快照里存在 WATCH / HIGH / VERY_HIGH 信号
 *   partial-data              有决策级市场数据，但没有已发布的日度市场序列
 *   market-data-unavailable   能力接口明确 supported=false（市场数据不足）
 *
 * 只使用两处真实证据，缺证据不下结论：
 *   · `/api/decision/capabilities?city=<id>` → tier / supported / limitation / market_as_of
 *   · `/api/daily/latest?city=shenyang`      → crops[].signal（当前仅沈阳发布日度快照）
 *
 * capabilities 尚未返回（supported=null）时落在 normal（中性），而不是猜一个状态。
 */
export type CityDataStateId = 'normal' | 'warning' | 'partial-data' | 'market-data-unavailable';

/** 触发 warning 的信号档位（与后端 daily_signal 枚举一致）。 */
export const WARNING_SIGNALS = ['WATCH', 'HIGH', 'VERY_HIGH'] as const satisfies readonly DailySignal[];

const SIGNAL_SEVERITY: Record<DailySignal, number> = {
  UNKNOWN: 0,
  NORMAL: 1,
  WATCH: 2,
  HIGH: 3,
  VERY_HIGH: 4,
};

export function isWarningSignal(signal: DailySignal | null | undefined): boolean {
  return signal != null && (WARNING_SIGNALS as readonly DailySignal[]).includes(signal);
}

export function hasWarningSignal(crops: readonly DailyCrop[]): boolean {
  return crops.some((crop) => isWarningSignal(crop.signal));
}

/** 风险从高到低排序，取前 n 条异常作物；无风险信息的排最后。 */
export function notableWarningCrops(crops: readonly DailyCrop[], limit = 4): DailyCrop[] {
  return crops
    .filter((crop) => isWarningSignal(crop.signal))
    .sort((a, b) => (b.marketRisk ?? b.hri ?? -1) - (a.marketRisk ?? a.hri ?? -1))
    .slice(0, limit);
}

/** 全部作物里最重的一档信号（用于「信号」字段的一行结论）。 */
export function strongestSignal(crops: readonly DailyCrop[]): DailySignal | null {
  let best: DailySignal | null = null;
  for (const crop of crops) {
    const signal = crop.signal;
    if (!signal) continue;
    if (best === null || SIGNAL_SEVERITY[signal] > SIGNAL_SEVERITY[best]) best = signal;
  }
  return best;
}

export interface CityStateEvidence {
  /** `capabilities.supported`；null 表示尚未取到或无法确认，不当作证据。 */
  supported: boolean | null;
  /** 该城市是否有已发布的日度市场序列（当前仅沈阳）。 */
  hasDailySeries: boolean;
  /** 日度快照里是否存在 WATCH / HIGH 及以上信号。 */
  dailyHasWarning: boolean;
}

/** 由真实证据推导静态四态；判断顺序即优先级。 */
export function deriveCityDataState(evidence: CityStateEvidence): CityDataStateId {
  if (evidence.supported === false) return 'market-data-unavailable';
  if (evidence.dailyHasWarning) return 'warning';
  if (evidence.supported === true && !evidence.hasDailySeries) return 'partial-data';
  return 'normal';
}

/** 四态的对外文案：颜色之外的第二重表达（无障碍要求状态不能只靠颜色）。 */
export const CITY_STATE_LABEL: Record<CityDataStateId, string> = {
  normal: '正常',
  warning: '关注',
  'partial-data': '部分数据',
  'market-data-unavailable': '数据不足',
};

/** 四态的一句话说明（右侧摘要 / 图例共用）。 */
export const CITY_STATE_NOTE: Record<CityDataStateId, string> = {
  normal: '市场数据可用，未检出异常信号。',
  warning: '日度市场快照中存在关注及以上信号。',
  'partial-data': '有决策级市场数据，但未发布日度市场序列。',
  'market-data-unavailable': '研究侧判定市场数据不足，不提供市场口径结论。',
};