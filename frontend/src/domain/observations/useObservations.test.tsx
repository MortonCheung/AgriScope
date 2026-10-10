// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProvinceObservation } from './types';
import { STUDY_CITY_IDS } from '../geography/cities';
import { parseObservations } from './useObservations';

/** 明确的合成测试 fixture；数值、名称和 TEST_ONLY 路径都不是正式产品观测。 */
function observationFixture(): ProvinceObservation {
  return {
    contract_version: '1', scope: 'six_city_research_area',
    cities: STUDY_CITY_IDS.map((city_id, index) => ({
      contract_version: '1', scope: 'city', city_id, city_name: `测试城市${index + 1}`,
      production: {
        available: true, period_start: 2018, period_end: 2024, latest_year: 2024,
        scope: index === 0 ? 'eight_agricultural_districts' : 'eight_crop_categories', unit: 'ha',
        items: [{ crop: '测试作物', area_ha: 100 + index, share: index === 0 ? null : 0.5 }],
        source_paths: [`research/product/${city_id}/tables/TEST_ONLY_production.csv`],
        limitations: ['合成测试面积，不作为正式观测。'],
      },
      climate: {
        available: true, period_start: 2024, period_end: 2025, complete_year: 2025,
        series: [2024, 2025].map((year) => ({
          year, precipitation_mm: (year === 2025 ? 600 : 500) + index * 10,
          mean_temp_c: 10 + index, growing_season_precipitation_mm: 400 + index,
          growing_season_mean_temp_c: 20 + index,
        })),
        source_paths: [`research/product/${city_id}/tables/TEST_ONLY_climate.csv`],
        limitations: ['合成测试气候，不作为正式观测。'],
      },
    })),
    summary: { city_count: 6, climate_year: 2025, precipitation_range_mm: { min: 600, max: 650 }, mean_temp_range_c: { min: 10, max: 15 } },
    limitations: ['合成六城测试 fixture，禁止进入产品运行资产。'],
  };
}

function change(raw: ProvinceObservation, path: string, value: unknown) {
  const keys = path.split('.');
  let target = raw as unknown as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) target = target[key] as Record<string, unknown>;
  target[keys.at(-1)!] = value;
}

function unavailableFixture(): ProvinceObservation {
  const raw = observationFixture();
  Object.assign(raw.cities[0].production, { available: false, period_start: null, period_end: null, latest_year: null, items: [] });
  Object.assign(raw.cities[0].climate, { available: false, period_start: null, period_end: null, complete_year: null, series: [] });
  Object.assign(raw.summary, { climate_year: null, precipitation_range_mm: null, mean_temp_range_c: null });
  return raw;
}

describe('六城观测版本 1 合同', () => {
  it('accepts the explicit test fixture without changing its values', () => {
    const raw = observationFixture();
    expect(parseObservations(raw)).toEqual(raw);
  });

  it('accepts unavailable modules only with empty observations and null years/summary', () => {
    const raw = unavailableFixture();
    expect(parseObservations(raw)).toEqual(raw);
  });

  it('allows zero area/precipitation and negative temperature as real numeric observations', () => {
    const raw = observationFixture();
    for (const city of raw.cities) {
      city.production.items[0].area_ha = 0;
      city.production.items[0].share = 0;
      for (const row of city.climate.series) {
        row.precipitation_mm = 0;
        row.growing_season_precipitation_mm = 0;
        row.mean_temp_c = -5;
      }
    }
    raw.summary.precipitation_range_mm = { min: 0, max: 0 };
    raw.summary.mean_temp_range_c = { min: -5, max: -5 };
    expect(parseObservations(raw)).toEqual(raw);
  });

  it.each([null, false, [], 1, 'observations'])('rejects a non-object response (%s)', (raw) => {
    expect(() => parseObservations(raw)).toThrow('农业观测格式不完整');
  });

  const invalidFields: [string, string, unknown][] = [
    ['wrong version', 'contract_version', '2'], ['wrong scope', 'scope', 'province'],
    ['top limitations not strings', 'limitations', [1]], ['missing summary', 'summary', null],
    ['unknown city', 'cities.0.city_id', 'anshan'], ['wrong city scope', 'cities.0.scope', 'province'],
    ['wrong city version', 'cities.0.contract_version', 1], ['blank name', 'cities.0.city_name', ' '],
    ['non-finite city count', 'summary.city_count', NaN], ['wrong city count', 'summary.city_count', 5],
    ['summary year outside published range', 'summary.climate_year', 2026], ['summary year as string', 'summary.climate_year', '2025'],
    ['infinite precipitation range', 'summary.precipitation_range_mm.max', Infinity],
    ['NaN temperature range', 'summary.mean_temp_range_c.min', NaN], ['negative precipitation', 'summary.precipitation_range_mm.min', -1],
    ['reversed temperature range', 'summary.mean_temp_range_c.min', 16], ['missing range', 'summary.mean_temp_range_c', null],
    ['wrong production unit', 'cities.0.production.unit', 'mu'], ['wrong production scope', 'cities.0.production.scope', ['eight_crop_categories']],
    ['production availability not boolean', 'cities.0.production.available', 'false'], ['missing latest production year', 'cities.0.production.latest_year', null],
    ['fractional production year', 'cities.0.production.period_start', 2018.5], ['production year out of bounds', 'cities.0.production.period_start', 1899],
    ['reversed production period', 'cities.0.production.period_start', 2025], ['production latest year mismatch', 'cities.0.production.latest_year', 2023],
    ['production sources not strings', 'cities.0.production.source_paths', [1]], ['available production without source', 'cities.0.production.source_paths', []],
    ['production limitations not array', 'cities.0.production.limitations', '限制'], ['production without items', 'cities.0.production.items', []],
    ['negative area', 'cities.0.production.items.0.area_ha', -1], ['infinite area', 'cities.0.production.items.0.area_ha', Infinity],
    ['share outside fraction range', 'cities.0.production.items.0.share', 1.1], ['share as string', 'cities.0.production.items.0.share', '0.5'],
    ['blank crop', 'cities.0.production.items.0.crop', ''],
    ['climate availability not boolean', 'cities.0.climate.available', 1], ['missing complete year', 'cities.0.climate.complete_year', null],
    ['complete year outside published range', 'cities.0.climate.complete_year', 2026], ['complete year not period end', 'cities.0.climate.complete_year', 2024],
    ['climate period start not first row', 'cities.0.climate.period_start', 2023], ['climate source not array', 'cities.0.climate.source_paths', 'source'],
    ['climate limitations not strings', 'cities.0.climate.limitations', [false]], ['available climate without source', 'cities.0.climate.source_paths', []],
    ['climate without series', 'cities.0.climate.series', []], ['climate year below range', 'cities.0.climate.series.0.year', 2009],
    ['climate year above range', 'cities.0.climate.series.1.year', 2026], ['fractional climate year', 'cities.0.climate.series.0.year', 2024.5],
    ['negative annual precipitation', 'cities.0.climate.series.0.precipitation_mm', -1],
    ['negative growing-season precipitation', 'cities.0.climate.series.0.growing_season_precipitation_mm', -1],
    ['NaN temperature', 'cities.0.climate.series.0.mean_temp_c', NaN], ['infinite seasonal temperature', 'cities.0.climate.series.0.growing_season_mean_temp_c', Infinity],
  ];
  it.each(invalidFields)('rejects %s', (_name, path, value) => {
    const raw = observationFixture();
    change(raw, path, value);
    expect(() => parseObservations(raw)).toThrow();
  });

  it.each(['missing city', 'duplicate city', 'extra city', 'duplicate crop', 'duplicate year', 'unsorted years', 'extra field', 'missing field'])('rejects %s', (kind) => {
    const raw = observationFixture();
    if (kind === 'missing city') raw.cities.pop();
    if (kind === 'duplicate city') raw.cities[1] = raw.cities[0];
    if (kind === 'extra city') raw.cities.push(raw.cities[0]);
    if (kind === 'duplicate crop') raw.cities[0].production.items.push(raw.cities[0].production.items[0]);
    if (kind === 'duplicate year') raw.cities[0].climate.series.push(raw.cities[0].climate.series[1]);
    if (kind === 'unsorted years') raw.cities[0].climate.series.reverse();
    if (kind === 'extra field') Object.assign(raw.cities[0].climate, { predicted_year: 2026 });
    if (kind === 'missing field') Reflect.deleteProperty(raw.cities[0].production, 'unit');
    expect(() => parseObservations(raw)).toThrow();
  });

  it.each([
    ['unavailable area with rows', 'cities.0.production.items', [{ crop: '测试', area_ha: 0, share: null }]],
    ['unavailable area with year', 'cities.0.production.latest_year', 2024],
    ['unavailable climate with rows', 'cities.0.climate.series', observationFixture().cities[0].climate.series],
    ['unavailable climate with year', 'cities.0.climate.period_start', 2024],
    ['five-city climate summary', 'summary.climate_year', 2025],
    ['unavailable summary with numbers', 'summary.precipitation_range_mm', { min: 0, max: 0 }],
  ] as [string, string, unknown][])('rejects %s', (_name, path, value) => {
    const raw = unavailableFixture();
    change(raw, path, value);
    expect(() => parseObservations(raw)).toThrow();
  });

  it('rejects a summary from a different year or numbers than its six city observations', () => {
    const raw = observationFixture();
    raw.summary.precipitation_range_mm!.max = 651;
    expect(() => parseObservations(raw)).toThrow('摘要与城市观测不一致');
    raw.summary.precipitation_range_mm!.max = 650;
    raw.summary.climate_year = 2024;
    expect(() => parseObservations(raw)).toThrow('共同完整年');
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const response = (raw: unknown) => ({ ok: true, json: vi.fn().mockResolvedValue(raw) });

describe('useObservations 请求生命周期', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('reads validated observations and only caches a successful current response', async () => {
    const { useObservations } = await import('./useObservations');
    const raw = observationFixture();
    const fetcher = vi.fn().mockResolvedValue(response(raw));
    vi.stubGlobal('fetch', fetcher);
    const first = renderHook(() => useObservations());
    expect(first.result.current.status).toBe('loading');
    await waitFor(() => expect(first.result.current).toEqual({ status: 'ready', data: raw }));
    expect(fetcher).toHaveBeenCalledWith('/api/observations', { signal: expect.any(AbortSignal), headers: { Accept: 'application/json' } });
    first.unmount();
    const second = renderHook(() => useObservations());
    expect(second.result.current).toEqual({ status: 'ready', data: raw });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(['HTTP', 'network', 'contract'])('reports %s failures without making them ready or cached', async (kind) => {
    const { useObservations } = await import('./useObservations');
    const fetcher = kind === 'network' ? vi.fn().mockRejectedValue(new Error('测试网络不可用'))
      : vi.fn().mockResolvedValue(kind === 'HTTP' ? { ok: false } : response({ contract_version: '2' }));
    vi.stubGlobal('fetch', fetcher);
    const first = renderHook(() => useObservations());
    await waitFor(() => expect(first.result.current.status).toBe('error'));
    first.unmount();
    fetcher.mockResolvedValue(response(observationFixture()));
    const second = renderHook(() => useObservations());
    await waitFor(() => expect(second.result.current.status).toBe('ready'));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('aborts on unmount and never parses or caches a late fetch response', async () => {
    const { useObservations } = await import('./useObservations');
    const pending = deferred<ReturnType<typeof response>>();
    const late = response(observationFixture());
    const fetcher = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(response(observationFixture()));
    vi.stubGlobal('fetch', fetcher);
    const first = renderHook(() => useObservations());
    const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
    first.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(late));
    expect(late.json).not.toHaveBeenCalled();
    const second = renderHook(() => useObservations());
    await waitFor(() => expect(second.result.current.status).toBe('ready'));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not commit or cache a JSON body that finishes after unmount', async () => {
    const { useObservations } = await import('./useObservations');
    const body = deferred<ProvinceObservation>();
    const json = vi.fn().mockReturnValue(body.promise);
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json }).mockResolvedValue(response(observationFixture()));
    vi.stubGlobal('fetch', fetcher);
    const first = renderHook(() => useObservations());
    await waitFor(() => expect(json).toHaveBeenCalledTimes(1));
    first.unmount();
    await act(async () => body.resolve(observationFixture()));
    const second = renderHook(() => useObservations());
    await waitFor(() => expect(second.result.current.status).toBe('ready'));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('ignores a rejection after abort and lets the next mount load normally', async () => {
    const { useObservations } = await import('./useObservations');
    const pending = deferred<ReturnType<typeof response>>();
    const fetcher = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(response(observationFixture()));
    vi.stubGlobal('fetch', fetcher);
    const first = renderHook(() => useObservations());
    first.unmount();
    await act(async () => pending.reject(new Error('测试旧请求错误')));
    const second = renderHook(() => useObservations());
    await waitFor(() => expect(second.result.current.status).toBe('ready'));
  });

  it('keeps the current response and cache when StrictMode replaces an aborted request', async () => {
    const { useObservations } = await import('./useObservations');
    const obsolete = deferred<ReturnType<typeof response>>();
    const current = observationFixture();
    const late = observationFixture();
    late.cities[0].city_name = '测试旧响应';
    const fetcher = vi.fn().mockReturnValueOnce(obsolete.promise).mockResolvedValue(response(current));
    vi.stubGlobal('fetch', fetcher);
    const hook = renderHook(() => useObservations(), { reactStrictMode: true });
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    await waitFor(() => expect(hook.result.current).toEqual({ status: 'ready', data: current }));
    await act(async () => obsolete.resolve(response(late)));
    expect(hook.result.current).toEqual({ status: 'ready', data: current });
    hook.unmount();
    const next = renderHook(() => useObservations());
    expect(next.result.current).toEqual({ status: 'ready', data: current });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
