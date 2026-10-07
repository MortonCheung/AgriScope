// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpLongHorizonProvider } from '../../providers/longHorizon';

const capabilityRaw = () => ({
  city_id: 'shenyang', supported: true, as_of: '2026-09-14', horizons: [90],
  model_version: 'long_horizon_v1', data_version: 'final_v1', limitation: null,
  crops: [{ id: '土豆', label: '土豆', horizons: [
    { days: 90, method: 'm_catboost', confidence: 'high', range_type: 'scenario_range', production_status: 'PRODUCTION_POINT', n_nonoverlap: 22 },
  ] }],
});
const entryRaw = () => ({
  crop: '土豆', horizon: 90, point_forecast: 2.054, range_low: 1.7168, range_high: 2.1376,
  range_type: 'scenario_range', production_status: 'PRODUCTION_POINT', confidence: 'high',
  method: 'm_catboost', unit: 'CNY/kg', available: true, as_of: '2026-09-14',
  anchor_observation_date: '2026-09-14', notes: [],
  forecast: { source: 'long_horizon_model', fallback_used: false, model_disagreement: 2.092 },
});

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('HTTP long-horizon provider', () => {
  it('reads the production capability endpoint with city and validates the payload', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => capabilityRaw() });
    vi.stubGlobal('fetch', fetcher);
    const cap = await new HttpLongHorizonProvider().capabilities('shenyang');
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/forecast/capabilities');
    expect(url.searchParams.get('city')).toBe('shenyang');
    expect(cap.crops[0].id).toBe('土豆');
  });

  it('posts the long-horizon request body and validates the returned entry', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => entryRaw() });
    vi.stubGlobal('fetch', fetcher);
    const entry = await new HttpLongHorizonProvider().forecast({ cityId: 'shenyang', crop: '土豆', horizonDays: 90 });
    const [url, init] = fetcher.mock.calls[0];
    expect(new URL(url).pathname).toBe('/api/forecast/long-horizon');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({ contract_version: '1', city_id: 'shenyang', crop: '土豆', horizon_days: 90 });
    expect(entry.pointForecast).toBe(2.054);
  });

  it('never borrows Shenyang long-horizon data for another city', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(new HttpLongHorizonProvider().capabilities('chaoyang')).rejects.toThrow('暂未接入');
    await expect(new HttpLongHorizonProvider().forecast({ cityId: 'chaoyang', crop: '土豆', horizonDays: 90 })).rejects.toThrow('暂未接入');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not substitute fixture data after a failed HTTP response', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 503 }); vi.stubGlobal('fetch', fetcher);
    await expect(new HttpLongHorizonProvider().forecast({ cityId: 'shenyang', crop: '土豆', horizonDays: 90 })).rejects.toThrow('暂时无法加载');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed entry instead of showing unvalidated numbers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ crop: '土豆' }) }));
    await expect(new HttpLongHorizonProvider().forecast({ cityId: 'shenyang', crop: '土豆', horizonDays: 90 })).rejects.toThrow('格式不完整');
  });

  it('rejects browser filesystem endpoints without fetching', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(new HttpLongHorizonProvider('file:///Users/example/cap.json').capabilities('shenyang')).rejects.toThrow('接口配置有误');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('ends an unresponsive request after the timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })));
    const request = new HttpLongHorizonProvider().capabilities('shenyang');
    const rejection = expect(request).rejects.toThrow('响应超时');
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
  });

  it('passes cancellation through rather than reporting an API failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })));
    const controller = new AbortController();
    const request = new HttpLongHorizonProvider().capabilities('shenyang', { signal: controller.signal });
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});