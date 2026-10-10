import { useEffect, useState } from 'react';
import type { CityObservation, ClimateYear, ProvinceObservation } from './types';
import type { AsyncState } from '../../services/asyncState';
import { STUDY_CITY_IDS } from '../geography/cities';

const cache = new Map<string, ProvinceObservation>();
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(text);
const year = (value: unknown, first = 1900, last = 2100): value is number => finite(value) && Number.isInteger(value) && value >= first && value <= last;
const climateYear = (value: unknown): value is number => year(value, 2010, 2025);
const fail = (message: string): never => { throw new Error(message); };

/** 版本 1 合同的字段完整且封闭，避免把缺字段或其他响应误当观测。 */
function record(value: unknown, keys: readonly string[], message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(message);
  const data = value as Record<string, unknown>;
  if (!keys.every((key) => Object.hasOwn(data, key)) || Object.keys(data).some((key) => !keys.includes(key))) return fail(message);
  return data;
}

function parseProduction(raw: unknown): CityObservation['production'] {
  const message = '农业面积口径不完整。';
  const data = record(raw, ['available', 'period_start', 'period_end', 'latest_year', 'scope', 'unit', 'items', 'source_paths', 'limitations'], message);
  if (typeof data.available !== 'boolean' || data.unit !== 'ha'
    || !(data.scope === 'eight_agricultural_districts' || data.scope === 'eight_crop_categories')
    || !Array.isArray(data.items) || !strings(data.source_paths) || !strings(data.limitations)) return fail(message);
  if (!data.available) {
    if (data.items.length || data.period_start !== null || data.period_end !== null || data.latest_year !== null) return fail('不可用的农业面积不能携带数字。');
  } else {
    if (!year(data.period_start) || !year(data.period_end) || !year(data.latest_year)
      || data.period_start > data.period_end || data.latest_year !== data.period_end
      || !data.items.length || !data.source_paths.length) return fail('农业面积年份或来源不完整。');
  }
  const crops = new Set<string>();
  for (const rawItem of data.items) {
    const item = record(rawItem, ['crop', 'area_ha', 'share'], message);
    if (!text(item.crop) || crops.has(item.crop) || !finite(item.area_ha) || item.area_ha < 0
      || !(item.share === null || finite(item.share) && item.share >= 0 && item.share <= 1)) return fail(message);
    crops.add(item.crop);
  }
  return data as unknown as CityObservation['production'];
}

function parseClimate(raw: unknown): CityObservation['climate'] {
  const message = '气候观测年份或数值不完整。';
  const data = record(raw, ['available', 'period_start', 'period_end', 'complete_year', 'series', 'source_paths', 'limitations'], message);
  if (typeof data.available !== 'boolean' || !Array.isArray(data.series) || !strings(data.source_paths) || !strings(data.limitations)) return fail(message);
  if (!data.available) {
    if (data.series.length || data.period_start !== null || data.period_end !== null || data.complete_year !== null) return fail('不可用的气候观测不能携带数字。');
    return data as unknown as CityObservation['climate'];
  }
  if (!climateYear(data.period_start) || !climateYear(data.period_end) || !climateYear(data.complete_year)
    || data.period_start > data.period_end || data.complete_year !== data.period_end
    || !data.series.length || !data.source_paths.length) return fail(message);
  let previousYear = 0;
  for (const rawItem of data.series) {
    const item = record(rawItem, ['year', 'precipitation_mm', 'mean_temp_c', 'growing_season_precipitation_mm', 'growing_season_mean_temp_c'], message);
    if (!climateYear(item.year) || item.year <= previousYear || item.year < data.period_start || item.year > data.complete_year
      || !finite(item.precipitation_mm) || item.precipitation_mm < 0 || !finite(item.mean_temp_c)
      || !finite(item.growing_season_precipitation_mm) || item.growing_season_precipitation_mm < 0
      || !finite(item.growing_season_mean_temp_c)) return fail(message);
    previousYear = item.year;
  }
  const series = data.series as ClimateYear[];
  if (series[0].year !== data.period_start || series.at(-1)!.year !== data.complete_year) return fail(message);
  return data as unknown as CityObservation['climate'];
}

function parseRange(raw: unknown, nonnegative: boolean): { min: number; max: number } {
  const message = '六城气候摘要范围不完整。';
  const data = record(raw, ['min', 'max'], message);
  if (!finite(data.min) || !finite(data.max) || data.min > data.max || nonnegative && data.min < 0) return fail(message);
  return { min: data.min, max: data.max };
}

export function parseObservations(raw: unknown): ProvinceObservation {
  const message = '农业观测格式不完整。';
  const data = record(raw, ['contract_version', 'scope', 'cities', 'summary', 'limitations'], message);
  if (data.contract_version !== '1' || data.scope !== 'six_city_research_area' || !Array.isArray(data.cities)
    || data.cities.length !== STUDY_CITY_IDS.length || !strings(data.limitations)) return fail(message);
  const ids = new Set<string>();
  const cities = data.cities.map((rawCity) => {
    const city = record(rawCity, ['contract_version', 'scope', 'city_id', 'city_name', 'production', 'climate'], '城市观测口径不完整。');
    if (city.contract_version !== '1' || city.scope !== 'city' || !text(city.city_id) || !text(city.city_name)
      || !(STUDY_CITY_IDS as readonly string[]).includes(city.city_id) || ids.has(city.city_id)) return fail('六城观测必须完整且不能重复城市。');
    ids.add(city.city_id);
    return { ...city, production: parseProduction(city.production), climate: parseClimate(city.climate) } as unknown as CityObservation;
  });
  const summary = record(data.summary, ['city_count', 'climate_year', 'precipitation_range_mm', 'mean_temp_range_c'], '六城气候摘要不完整。');
  if (summary.city_count !== STUDY_CITY_IDS.length || !(summary.climate_year === null || climateYear(summary.climate_year))) return fail('六城气候摘要年份或城市数量不完整。');

  // 摘要必须来自六城同一完整年；缺一城也不能继续展示范围。
  const commonYears = cities[0].climate.series.map((item) => item.year)
    .filter((value) => cities.every((city) => city.climate.series.some((item) => item.year === value)));
  const commonYear = commonYears.length ? Math.max(...commonYears) : null;
  if (summary.climate_year !== commonYear) return fail('六城气候摘要必须使用共同完整年。');
  if (commonYear === null) {
    if (summary.precipitation_range_mm !== null || summary.mean_temp_range_c !== null) return fail('缺少共同完整年时不能携带气候摘要数字。');
  } else {
    const precipitation = parseRange(summary.precipitation_range_mm, true);
    const temperature = parseRange(summary.mean_temp_range_c, false);
    const rows = cities.map((city) => city.climate.series.find((item) => item.year === commonYear)!);
    if (precipitation.min !== Math.min(...rows.map((item) => item.precipitation_mm))
      || precipitation.max !== Math.max(...rows.map((item) => item.precipitation_mm))
      || temperature.min !== Math.min(...rows.map((item) => item.mean_temp_c))
      || temperature.max !== Math.max(...rows.map((item) => item.mean_temp_c))) return fail('六城气候摘要与城市观测不一致。');
  }
  return { ...data, cities } as unknown as ProvinceObservation;
}

export function useObservations(): AsyncState<ProvinceObservation> {
  const [state, setState] = useState<AsyncState<ProvinceObservation>>(() => cache.has('province')
    ? { status: 'ready', data: cache.get('province')! } : { status: 'loading' });
  useEffect(() => {
    const cached = cache.get('province');
    if (cached) { setState({ status: 'ready', data: cached }); return; }
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/observations', { signal: controller.signal, headers: { Accept: 'application/json' } });
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error('农业观测暂时无法读取，请稍后刷新。');
        const raw: unknown = await response.json();
        if (controller.signal.aborted) return;
        const data = parseObservations(raw);
        if (controller.signal.aborted) return;
        cache.set('province', data);
        setState({ status: 'ready', data });
      } catch (error) {
        if (!controller.signal.aborted) setState({ status: 'error', error: error instanceof Error ? error.message : '农业观测读取失败。' });
      }
    })();
    return () => controller.abort();
  }, []);
  return state;
}
