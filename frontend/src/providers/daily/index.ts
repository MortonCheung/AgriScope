import { adaptDailySnapshot } from '../../domain/daily/adapter';
import type { DailyProvider, DailySnapshot } from '../../domain/daily/types';

/** This endpoint reads a published snapshot; fetching it never runs the collector. */
export class HttpDailyProvider implements DailyProvider {
  constructor(private readonly endpoint = '/api/daily/latest') {}
  async latest(cityId: string, options: { signal?: AbortSignal } = {}): Promise<DailySnapshot> {
    if (cityId !== 'shenyang') throw new Error('这个城市的每日市场数据暂未接入。');
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    const timer = window.setTimeout(abort, 10_000);
    try {
      const endpoint = new URL(this.endpoint, window.location.origin);
      if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('每日市场接口配置有误。');
      endpoint.searchParams.set('city', cityId);
      const response = await fetch(endpoint.toString(), { signal: controller.signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) throw new Error('最新市场数据暂时无法加载。');
      return adaptDailySnapshot(await response.json());
    } catch (error) {
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (controller.signal.aborted) throw new Error('市场数据响应超时，请稍后重试。');
      throw error;
    } finally {
      window.clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }
}

// Production always uses HTTP. There is no silent fixture or mock fallback.
const provider: DailyProvider = new HttpDailyProvider(import.meta.env.VITE_DAILY_URL || '/api/daily/latest');
export function getDailyProvider(): DailyProvider { return provider; }
