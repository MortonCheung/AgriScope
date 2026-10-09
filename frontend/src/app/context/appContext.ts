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

/** 作物名允许中文、字母、数字与常见连接符；空串视为"未选择"。 */
const CROP_RE = /^[\u4e00-\u9fa5A-Za-z0-9·\-]{1,12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isKnownCrop = (value: unknown): value is string =>
  typeof value === 'string' && CROP_RE.test(value);

/** 参考日期只接受 `YYYY-MM-DD`，并且必须是真实存在的日期。 */
export const isKnownAsOf = (value: unknown): value is string => {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

/**
 * URL query 中的四要素键名（Frontend V3 §9）。
 *
 * 四要素是 City / Crop / Date / Horizon；`city` 同时也会出现在路径里，
 * query 里再写一次是为了让**跨一级入口跳转**（态势 → 决策 → 研究）不丢上下文。
 */
export const CONTEXT_QUERY_KEYS = {
  city: 'city',
  crop: 'crop',
  horizon: 'horizon',
  asOf: 'as_of',
} as const;

interface Persisted {
  cityId: string;
  crop: string | null;
  horizon: ContextHorizon;
  asOf: string | null;
}

const FALLBACK: Persisted = { cityId: DEFAULT_CITY_ID, crop: null, horizon: DEFAULT_HORIZON, asOf: null };

function readStored(): Persisted {
  if (typeof window === 'undefined') return FALLBACK;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return FALLBACK;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      cityId: isKnownCity(parsed.cityId) ? parsed.cityId : DEFAULT_CITY_ID,
      crop: isKnownCrop(parsed.crop) ? parsed.crop : null,
      horizon: isHorizon(parsed.horizon) ? parsed.horizon : DEFAULT_HORIZON,
      asOf: isKnownAsOf(parsed.asOf) ? parsed.asOf : null,
    };
  } catch {
    return FALLBACK;
  }
}

function persist(state: Persisted): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* 隐私模式 / 配额不足时静默降级：上下文仍然在内存里有效。 */
  }
}

export interface AppContextState extends Persisted {
  setCity: (cityId: string) => void;
  setCrop: (crop: string | null) => void;
  setHorizon: (horizon: ContextHorizon) => void;
  setAsOf: (asOf: string | null) => void;
}

const initial = readStored();

export const useAppContext = create<AppContextState>((set, get) => ({
  cityId: initial.cityId,
  crop: initial.crop,
  horizon: initial.horizon,
  asOf: initial.asOf,
  setCity: (cityId) => {
    if (!isKnownCity(cityId)) return;
    set({ cityId });
    persist(get());
  },
  setCrop: (crop) => {
    if (crop !== null && !isKnownCrop(crop)) return;
    set({ crop });
    persist(get());
  },
  setHorizon: (horizon) => {
    if (!isHorizon(horizon)) return;
    set({ horizon });
    persist(get());
  },
  setAsOf: (asOf) => {
    if (asOf !== null && !isKnownAsOf(asOf)) return;
    set({ asOf });
    persist(get());
  },
}));

/** 从 URL query 读出四要素（只返回**合法且存在**的键，非法值一律忽略）。 */
export function readContextFromSearch(search: string): Partial<Persisted> {
  const params = new URLSearchParams(search);
  const out: Partial<Persisted> = {};
  const city = params.get(CONTEXT_QUERY_KEYS.city);
  if (isKnownCity(city)) out.cityId = city;
  const crop = params.get(CONTEXT_QUERY_KEYS.crop);
  if (isKnownCrop(crop)) out.crop = crop;
  const horizon = params.get(CONTEXT_QUERY_KEYS.horizon);
  if (horizon !== null && isHorizon(Number(horizon))) out.horizon = Number(horizon) as ContextHorizon;
  const asOf = params.get(CONTEXT_QUERY_KEYS.asOf);
  if (isKnownAsOf(asOf)) out.asOf = asOf;
  return out;
}

/**
 * 把四要素写进 query（保留其它参数，例如决策页的 `view`/`plan`）。
 * `null` 表示该要素未选择 → 从 query 中移除，而不是写空串。
 */
export function writeContextToSearch(search: string, context: Persisted): string {
  const params = new URLSearchParams(search);
  params.set(CONTEXT_QUERY_KEYS.city, context.cityId);
  params.set(CONTEXT_QUERY_KEYS.horizon, String(context.horizon));
  if (context.crop) params.set(CONTEXT_QUERY_KEYS.crop, context.crop);
  else params.delete(CONTEXT_QUERY_KEYS.crop);
  if (context.asOf) params.set(CONTEXT_QUERY_KEYS.asOf, context.asOf);
  else params.delete(CONTEXT_QUERY_KEYS.asOf);
  return params.toString();
}

/** 测试与"复位"用：清掉会话记忆，回到默认城市与周期。 */
export function resetAppContext(): void {
  if (typeof window !== 'undefined') {
    try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* 忽略 */ }
  }
  useAppContext.setState({ cityId: DEFAULT_CITY_ID, crop: null, horizon: DEFAULT_HORIZON, asOf: null });
}
