import { useEffect, useMemo, useState } from 'react';
import { LIAONING_CITIES, STUDY_CITY_IDS } from '../../domain/geography/cities';
import type { DailyFreshness, DailySignal, DailySnapshot } from '../../domain/daily/types';
import type { DecisionCapability } from '../../domain/decision/types';
import { parseCapability } from '../../providers/decision';
import { getDailyProvider } from '../../providers/daily';
import {
  deriveCityDataState,
  hasWarningSignal,
  notableWarningCrops,
  strongestSignal,
  type CityDataStateId,
} from './cityMarketState';

/**
 * 城市市场状态的数据来源（规范 §8）。
 *
 * 只打两个真实端点：
 *   · `/api/decision/capabilities?city=<id>`（六城，实际 confirm 谁有市场数据）
 *   · `/api/daily/latest?city=shenyang`（当前唯一发布日度快照的城市）
 *
 * 请求在模块层去重：`LiaoningPage` 与 `LiaoningCanvas` 同时订阅也只会各发一次。
 * 这里**不**缓存错误（下一次订阅仍会重试），也**不**伪造任何字段。
 */

const CAPABILITY_ENDPOINT: string =
  (import.meta.env.VITE_CAPABILITY_URL as string | undefined) ?? '/api/decision/capabilities';
const DAILY_CITY_ID = 'shenyang';

export type ResourceStatus = 'loading' | 'ready' | 'error';

export interface CityMarketView {
  cityId: string;
  /** 静态四态（hover / selected 由交互层另加）。 */
  state: CityDataStateId;
  capabilitiesStatus: ResourceStatus;
  dailyStatus: ResourceStatus;
  /** null = 尚未确认（加载中或能力接口失败）。 */
  supported: boolean | null;
  tier: string | null;
  limitation: string | null;
  marketAsOf: string | null;
  /** 决策模型覆盖的作物（市场口径），不支持时为空数组。 */
  modelCrops: string[];
  hasDailySeries: boolean;
  latestDataDate: string | null;
  freshness: DailyFreshness | null;
  signal: DailySignal | null;
  notableCrops: { crop: string; signal: DailySignal }[];
}

export interface CityMarketStates {
  views: Record<string, CityMarketView>;
  capabilitiesStatus: ResourceStatus;
  dailyStatus: ResourceStatus;
}

function capabilityUrl(cityId: string): string {
  const url = new URL(CAPABILITY_ENDPOINT, window.location.origin);
  url.searchParams.set('city', cityId);
  return url.toString();
}

const capabilityCache = new Map<string, Promise<DecisionCapability>>();

function loadCapability(cityId: string): Promise<DecisionCapability> {
  const cached = capabilityCache.get(cityId);
  if (cached) return cached;
  const promise = fetch(capabilityUrl(cityId), { headers: { Accept: 'application/json' }, cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error('城市决策能力暂时无法确认。');
      return response.json() as Promise<unknown>;
    })
    .then((raw) => parseCapability(raw, cityId));
  capabilityCache.set(cityId, promise);
  // 失败不缓存：下一次订阅仍可重试，而不是把一次网络抖动固化成永久错误。
  promise.catch(() => capabilityCache.delete(cityId));
  return promise;
}

let dailyCache: Promise<DailySnapshot> | null = null;

function loadDaily(): Promise<DailySnapshot> {
  dailyCache ??= getDailyProvider().latest(DAILY_CITY_ID);
  dailyCache.catch(() => { dailyCache = null; });
  return dailyCache;
}

type CapabilityResource = { status: ResourceStatus; data: Record<string, DecisionCapability> };
type DailyResource = { status: ResourceStatus; data: DailySnapshot | null };

function emptyView(cityId: string): CityMarketView {
  return {
    cityId,
    state: 'normal',
    capabilitiesStatus: 'loading',
    dailyStatus: 'loading',
    supported: null,
    tier: null,
    limitation: null,
    marketAsOf: null,
    modelCrops: [],
    hasDailySeries: false,
    latestDataDate: null,
    freshness: null,
    signal: null,
    notableCrops: [],
  };
}

/** 兜底视图：某个城市尚未进入能力数据时使用（中性状态，不伪造字段）。 */
export function emptyCityView(cityId: string): CityMarketView {
  return emptyView(cityId);
}

function buildViews(capabilities: CapabilityResource, daily: DailyResource): CityMarketStates {
  const snapshot = daily.status === 'ready' ? daily.data : null;
  const views: Record<string, CityMarketView> = {};

  for (const city of LIAONING_CITIES) {
    if (!(STUDY_CITY_IDS as readonly string[]).includes(city.id)) continue;
    const capability = capabilities.data[city.id] ?? null;
    const supported = capability ? capability.supported : null;
    const hasDailySeries = snapshot !== null && snapshot.cityId === city.id;
    const dailyWarning = hasDailySeries && snapshot ? hasWarningSignal(snapshot.crops) : false;

    const view: CityMarketView = {
      ...emptyView(city.id),
      state: deriveCityDataState({ supported, hasDailySeries, dailyHasWarning: dailyWarning }),
      capabilitiesStatus: capabilities.status,
      dailyStatus: daily.status,
      supported,
      tier: capability?.tier ?? null,
      limitation: capability?.limitation ?? null,
      marketAsOf: capability?.market_as_of ?? null,
      modelCrops: capability?.crops.map((crop) => crop.label) ?? [],
      hasDailySeries,
    };

    if (hasDailySeries && snapshot) {
      view.latestDataDate = snapshot.latestDataDate;
      view.freshness = snapshot.freshness;
      view.signal = strongestSignal(snapshot.crops);
      view.notableCrops = notableWarningCrops(snapshot.crops).map((crop) => ({
        crop: crop.crop,
        signal: crop.signal as DailySignal,
      }));
    }

    views[city.id] = view;
  }

  return {
    views,
    capabilitiesStatus: capabilities.status,
    dailyStatus: daily.status,
  };
}

/**
 * 订阅六城市场状态。`enabled=false` 时不发请求（例如地图处于城市/开场模式）。
 */
export function useCityMarketStates(enabled = true): CityMarketStates {
  const [capabilities, setCapabilities] = useState<CapabilityResource>({ status: 'loading', data: {} });
  const [daily, setDaily] = useState<DailyResource>({ status: 'loading', data: null });

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    Promise.all(
      STUDY_CITY_IDS.map(async (cityId) => {
        try {
          return [cityId, await loadCapability(cityId)] as const;
        } catch {
          return [cityId, null] as const;
        }
      }),
    ).then((entries) => {
      if (!alive) return;
      const data: Record<string, DecisionCapability> = {};
      let failed = false;
      for (const [cityId, capability] of entries) {
        if (capability) data[cityId] = capability;
        else failed = true;
      }
      setCapabilities({ status: failed ? 'error' : 'ready', data });
    });
    return () => { alive = false; };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    loadDaily()
      .then((snapshot) => { if (alive) setDaily({ status: 'ready', data: snapshot }); })
      .catch(() => { if (alive) setDaily({ status: 'error', data: null }); });
    return () => { alive = false; };
  }, [enabled]);

  return useMemo(() => buildViews(capabilities, daily), [capabilities, daily]);
}