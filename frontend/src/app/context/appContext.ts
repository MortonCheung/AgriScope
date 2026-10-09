import { create } from 'zustand';
import { STUDY_CITY_IDS } from '../../domain/geography/cities';

/**
 * 全局城市 / 周期上下文（V3 §6）。
 *
 * 为什么需要一个全局层：V3 把产品拆成「辽宁农业态势 / 决策中心 / 研究中心」三个入口，
 * 用户在同一座城市里来回切换时，不应该每进一个页面都重选一次城市与周期。
 *
 * 边界（重要）：
 *   - 这里**只**保存"用户当前关注哪座城市、哪个周期"这一件事；
 *   - 它不复制 URL 参数，也不代替各页面自己的查询串（决策页仍以 URL 为准）。
 *   - 城市被限制在六个研究城市内，未收录的城市不会污染上下文。
 *
 * 持久化用 sessionStorage：同一标签页内跨路由保留，关掉标签页即复位，
 * 不写 localStorage，避免"上次看的城市"在演示时突然改变开场。
 */

/** 决策中心共享的短期周期，与后端 capability 的 horizons 对齐（7/14/30）。 */
export const CONTEXT_HORIZONS = [7, 14, 30] as const;
export type ContextHorizon = (typeof CONTEXT_HORIZONS)[number];

export const DEFAULT_CITY_ID = 'shenyang';
export const DEFAULT_HORIZON: ContextHorizon = 14;

const STORAGE_KEY = 'agriscope.context.v1';
const CITY_IDS: readonly string[] = STUDY_CITY_IDS;

const isHorizon = (value: unknown): value is ContextHorizon =>
  CONTEXT_HORIZONS.includes(value as ContextHorizon);

const isKnownCity = (value: unknown): value is string =>
  typeof value === 'string' && CITY_IDS.includes(value);

interface Persisted {
  cityId: string;
  horizon: ContextHorizon;
}

const FALLBACK: Persisted = { cityId: DEFAULT_CITY_ID, horizon: DEFAULT_HORIZON };

function readStored(): Persisted {
  if (typeof window === 'undefined') return FALLBACK;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return FALLBACK;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      cityId: isKnownCity(parsed.cityId) ? parsed.cityId : DEFAULT_CITY_ID,
      horizon: isHorizon(parsed.horizon) ? parsed.horizon : DEFAULT_HORIZON,
    };
  } catch {
    return FALLBACK;
  }
}

function persist(state: Persisted): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ cityId: state.cityId, horizon: state.horizon }));
  } catch {
    /* 隐私模式 / 配额不足时静默降级：上下文仍然在内存里有效。 */
  }
}

export interface AppContextState {
  cityId: string;
  horizon: ContextHorizon;
  setCity: (cityId: string) => void;
  setHorizon: (horizon: ContextHorizon) => void;
}

const initial = readStored();

export const useAppContext = create<AppContextState>((set, get) => ({
  cityId: initial.cityId,
  horizon: initial.horizon,
  setCity: (cityId) => {
    if (!isKnownCity(cityId)) return;
    set({ cityId });
    persist(get());
  },
  setHorizon: (horizon) => {
    if (!isHorizon(horizon)) return;
    set({ horizon });
    persist(get());
  },
}));

/** 测试与"复位"用：清掉会话记忆，回到默认城市与周期。 */
export function resetAppContext(): void {
  if (typeof window !== 'undefined') {
    try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* 忽略 */ }
  }
  useAppContext.setState({ cityId: DEFAULT_CITY_ID, horizon: DEFAULT_HORIZON });
}
