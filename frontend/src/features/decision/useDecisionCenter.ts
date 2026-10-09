/**
 * 决策中心的数据装配（Frontend V3 §10–§14）。
 *
 * 只从真实端点取数，且**只经 provider 边界**（做完整契约校验）：
 *   - capabilities  → getDecisionProvider().capabilities(cityId)
 *   - 当前市场状态   → getDailyProvider().latest(cityId)
 *   - 短期 7/14/30   → getDecisionProvider().decide(...)（价格与规模无关，用参考规模）
 *   - 长期 30–180    → getLongHorizonProvider().forecast(...)
 *   - 作物长期对比   → getLongHorizonDecisionProvider().decision(...)（一次拿全部作物）
 *
 * 端点不可用时如实进入 error 状态；绝不回退到本地数字或样例。切换跨度只重取该跨度，
 * 不重载整页，也不清空已缓存的跨度。
 */
import { useEffect, useRef, useState } from 'react';
import type { DecisionCapability, FinalDecisionRequest } from '../../domain/decision/types';
import type { DailySnapshot } from '../../domain/daily/types';
import { findDailyCrop } from '../../domain/daily/adapter';
import { getDecisionProvider } from '../../providers/decision';
import { getDailyProvider } from '../../providers/daily';
import { getLongHorizonProvider, getLongHorizonDecisionProvider } from '../../providers/longHorizon';
import { longCertainty, forecastDirection, type ForecastDirection, type LongCertainty } from './centerModel';

/** 参考规模：价格与市场规模无关，规模只影响收益核算，这里不呈现收益。 */
const REFERENCE_AREA_MU = 1;
const REFERENCE_BUDGET_CNY = 1_000_000;
export const SHORT_HORIZONS = [7, 14, 30] as const;
export const LONG_HORIZONS = [30, 60, 90, 120, 150, 180] as const;
export const LONG_COMPARE_HORIZON = 90;

export interface ShortRow {
  horizon: number;
  mid: number | null; low: number | null; high: number | null;
  rangeStatus: string | null; calibrated: boolean;
  confidence: number | null; climateExposure: number | null;
  marketRisk: number | null; hri: number | null;
}
export interface LongRow {
  horizon: number;
  point: number | null; low: number | null; high: number | null;
  productionStatus: string; confidence: string | null; rangeType: string | null;
}
export interface CompareRow {
  crop: string;
  longCertainty: LongCertainty;
  direction: ForecastDirection;
  harvestRelative: number | null;
  currentPrice: number | null;
}

type Resource<T> = { status: 'idle' | 'loading' | 'ready' | 'error'; data?: T; error?: string };

function shortRequest(cityId: string, crop: string, horizon: number, asOf: string, saved: FinalDecisionRequest | null): FinalDecisionRequest {
  const base = saved ? saved.user_context : null;
  return {
    contract_version: '1',
    user_context: {
      city_id: cityId, area_mu: base?.area_mu ?? REFERENCE_AREA_MU, budget_cny: base?.budget_cny ?? REFERENCE_BUDGET_CNY,
      risk_preference: base?.risk_preference ?? 'balanced', crop_preferences: [crop], actual_inputs: {},
      market_context: { as_of: asOf, horizon_days: horizon, harvest_date: null },
    },
    input_source: { kind: 'structured' },
  };
}

/** 泛型资源 hook：以 key 缓存，切换 key 不清空旧跨度（保留平滑更新）。 */
function useResource<T>(key: string | null, factory: () => (signal: AbortSignal) => Promise<T>, cache: Map<string, T>): Resource<T> {
  const factoryRef = useRef(factory);
  factoryRef.current = factory;
  const [state, setState] = useState<Resource<T>>(() => {
    if (!key) return { status: 'idle' };
    const hit = cache.get(key);
    return hit === undefined ? { status: 'loading' } : { status: 'ready', data: hit };
  });
  useEffect(() => {
    if (!key) return undefined;
    const hit = cache.get(key);
    if (hit !== undefined) { setState({ status: 'ready', data: hit }); return undefined; }
    const controller = new AbortController();
    let alive = true;
    setState({ status: 'loading' });
    factoryRef.current()(controller.signal)
      .then((data) => { if (!alive) return; cache.set(key, data); setState({ status: 'ready', data }); })
      .catch((error: unknown) => {
        if (!alive || controller.signal.aborted) return;
        setState({ status: 'error', error: error instanceof Error ? error.message : '数据暂时无法加载。' });
      });
    return () => { alive = false; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

export interface DecisionCenterData {
  capabilities: Resource<DecisionCapability>;
  daily: Resource<DailySnapshot>;
  short: Record<number, Resource<ShortRow>>;
  longRows: Record<number, Resource<LongRow>>;
  compare: Resource<CompareRow[]>;
  marketAsOf: string | null;
  activeCrop: string;
}

function toShortRow(result: { candidates: { crop: string; price: { base: number | null; low: number | null; high: number | null; is_calibrated_interval: boolean }; risks: { hri: number | null; market_risk: number | null; climate_exposure: number | null }; confidence: { score: number | null }; market_context?: { range_status: string } }[] }, crop: string, horizon: number): ShortRow {
  const candidate = result.candidates.find((item) => item.crop === crop);
  if (!candidate) throw new Error('这个作物在当前数据基准下没有可比较结果。');
  return {
    horizon, mid: candidate.price.base, low: candidate.price.low, high: candidate.price.high,
    rangeStatus: candidate.market_context?.range_status ?? null,
    calibrated: candidate.price.is_calibrated_interval, confidence: candidate.confidence.score,
    climateExposure: candidate.risks.climate_exposure, marketRisk: candidate.risks.market_risk, hri: candidate.risks.hri,
  };
}

export function useDecisionCenter(cityId: string, crop: string, saved: FinalDecisionRequest | null): DecisionCenterData {
  const caches = useRef({
    caps: new Map<string, DecisionCapability>(),
    daily: new Map<string, DailySnapshot>(),
    short: new Map<string, ShortRow>(),
    long: new Map<string, LongRow>(),
    compare: new Map<string, CompareRow[]>(),
  }).current;

  const capabilities = useResource<DecisionCapability>(cityId || null, () => (signal) => getDecisionProvider().capabilities!(cityId, { signal }), caches.caps);
  const daily = useResource<DailySnapshot>(cityId || null, () => (signal) => getDailyProvider().latest(cityId, { signal }), caches.daily);

  const marketAsOf = capabilities.data?.market_as_of ?? daily.data?.latestDataDate ?? null;
  const activeCrop = crop || capabilities.data?.crops[0]?.id || '';
  const supported = capabilities.data?.supported === true && Boolean(activeCrop);
  const shortFor = (horizon: number) => supported && marketAsOf
    ? `short:${cityId}:${activeCrop}:${horizon}:${marketAsOf}`
    : null;
  const shortLoad = (horizon: number) => (signal: AbortSignal) => getDecisionProvider()
    .decide(shortRequest(cityId, activeCrop, horizon, marketAsOf!, saved), { signal })
    .then((result) => toShortRow(result, activeCrop, horizon));

  const short: Record<number, Resource<ShortRow>> = {
    7: useResource<ShortRow>(shortFor(7), () => shortLoad(7), caches.short),
    14: useResource<ShortRow>(shortFor(14), () => shortLoad(14), caches.short),
    30: useResource<ShortRow>(shortFor(30), () => shortLoad(30), caches.short),
  };

  const longFor = (horizon: number) => supported ? `long:${cityId}:${activeCrop}:${horizon}` : null;
  const longLoad = (horizon: number) => (signal: AbortSignal) => getLongHorizonProvider()
    .forecast({ cityId, crop: activeCrop, horizonDays: horizon }, { signal })
    .then((entry) => ({
      horizon, point: entry.pointForecast, low: entry.rangeLow, high: entry.rangeHigh,
      productionStatus: entry.productionStatus, confidence: entry.confidence, rangeType: entry.rangeType,
    }));

  const longRows: Record<number, Resource<LongRow>> = {
    30: useResource<LongRow>(longFor(30), () => longLoad(30), caches.long),
    60: useResource<LongRow>(longFor(60), () => longLoad(60), caches.long),
    90: useResource<LongRow>(longFor(90), () => longLoad(90), caches.long),
    120: useResource<LongRow>(longFor(120), () => longLoad(120), caches.long),
    150: useResource<LongRow>(longFor(150), () => longLoad(150), caches.long),
    180: useResource<LongRow>(longFor(180), () => longLoad(180), caches.long),
  };

  const compare = useResource<CompareRow[]>(
    capabilities.data?.supported && capabilities.data.crops.length ? `compare:${cityId}:${LONG_COMPARE_HORIZON}` : null,
    () => (signal) => getLongHorizonDecisionProvider().decision({
      contract_version: '2',
      user_context: {
        city_id: cityId, area_mu: REFERENCE_AREA_MU, budget_cny: REFERENCE_BUDGET_CNY, risk_preference: 'balanced',
        crop_preferences: capabilities.data!.crops.map((item) => item.id), actual_inputs: {},
        market_context: { expected_harvest_horizon_days: LONG_COMPARE_HORIZON },
      },
      input_source: { kind: 'structured' },
    }, { signal }).then((result) => result.candidates.map((candidate): CompareRow => ({
      crop: candidate.crop,
      longCertainty: longCertainty(candidate.production_status),
      direction: forecastDirection(candidate.price.base, candidate.current_market_context.current_price),
      harvestRelative: candidate.harvest_relative_to_current,
      currentPrice: candidate.current_market_context.current_price,
    }))),
    caches.compare,
  );

  return { capabilities, daily, short, longRows, compare, marketAsOf, activeCrop };
}

export function dailyRowFor(snapshot: DailySnapshot | undefined, crop: string) {
  return snapshot ? findDailyCrop(snapshot, crop) : null;
}