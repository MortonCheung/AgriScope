import { validateDisplayMarket, type DisplayMarketSnapshot } from '../../domain/market/displayMarket';

/** Homepage publication is independent of strict research/decision observations. */
export class HttpDisplayMarketProvider {
  constructor(private readonly endpoint = '/api/market/display') {}
  async latest(): Promise<DisplayMarketSnapshot> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const url = new URL(this.endpoint, window.location.origin);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('行情接口配置无效。');
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) throw new Error('行情发布包读取失败。');
      return validateDisplayMarket(await response.json());
    } finally {
      window.clearTimeout(timer);
    }
  }
}
const provider = new HttpDisplayMarketProvider();
export function getDisplayMarketProvider(): HttpDisplayMarketProvider { return provider; }
