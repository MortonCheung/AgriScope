import { adaptForecastCapability, adaptLongHorizonEntry } from '../../domain/longHorizon/adapter';
import type { LongHorizonCapability, LongHorizonEntry, LongHorizonProvider, LongHorizonRequest } from '../../domain/longHorizon/types';

const TIMEOUT_MS = 15_000;

function guard(endpoint: string): URL {
  const url = new URL(endpoint, window.location.origin);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('长期预测接口配置有误。');
  return url;
}

function withTimeout(options: { signal?: AbortSignal }): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = window.setTimeout(abort, TIMEOUT_MS);
  return {
    signal: controller.signal,
    done: () => { window.clearTimeout(timer); options.signal?.removeEventListener('abort', abort); },
  };
}

/** Reads the precomputed Long-Horizon snapshot; it never triggers a crawl or a training run. */
export class HttpLongHorizonProvider implements LongHorizonProvider {
  constructor(
    private readonly capabilitiesEndpoint = '/api/forecast/capabilities',
    private readonly forecastEndpoint = '/api/forecast/long-horizon',
  ) {}

  async capabilities(cityId: string, options: { signal?: AbortSignal } = {}): Promise<LongHorizonCapability> {
    if (cityId !== 'shenyang') throw new Error('这个城市的长期预测暂未接入。');
    const { signal, done } = withTimeout(options);
    try {
      const url = guard(this.capabilitiesEndpoint);
      url.searchParams.set('city', cityId);
      const response = await fetch(url.toString(), { signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) throw new Error('长期预测能力暂时无法加载。');
      return adaptForecastCapability(await response.json());
    } catch (error) {
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (signal.aborted) throw new Error('长期预测响应超时，请稍后重试。');
      throw error;
    } finally { done(); }
  }

  async forecast(input: LongHorizonRequest, options: { signal?: AbortSignal } = {}): Promise<LongHorizonEntry> {
    if (input.cityId !== 'shenyang') throw new Error('这个城市的长期预测暂未接入。');
    const { signal, done } = withTimeout(options);
    try {
      const url = guard(this.forecastEndpoint);
      const response = await fetch(url.toString(), {
        method: 'POST', signal, cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_version: '1', city_id: input.cityId,
          crop: input.crop, horizon_days: input.horizonDays,
        }),
      });
      if (!response.ok) throw new Error('长期预测暂时无法加载。');
      return adaptLongHorizonEntry(await response.json());
    } catch (error) {
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (signal.aborted) throw new Error('长期预测响应超时，请稍后重试。');
      throw error;
    } finally { done(); }
  }
}

// Production always uses HTTP. There is no silent fixture or mock fallback.
const provider: LongHorizonProvider = new HttpLongHorizonProvider(
  import.meta.env.VITE_LONG_HORIZON_CAPABILITIES_URL || '/api/forecast/capabilities',
  import.meta.env.VITE_LONG_HORIZON_URL || '/api/forecast/long-horizon',
);
export function getLongHorizonProvider(): LongHorizonProvider { return provider; }