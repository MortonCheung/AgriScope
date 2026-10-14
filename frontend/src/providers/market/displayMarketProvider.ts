import { validateDisplayMarket, type DisplayMarketSnapshot } from '../../domain/market/displayMarket';

/** Homepage publication is independent of strict research/decision observations. */
export class HttpDisplayMarketProvider {
  constructor(private readonly endpoint = '/api/market/display') {}
  async latest(signal?: AbortSignal): Promise<DisplayMarketSnapshot> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const controller = new AbortController();
    let rejectAbort!: (reason: unknown) => void;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    const onAbort = () => {
      controller.abort();
      rejectAbort(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = window.setTimeout(onAbort, 10_000);
    try {
      const url = new URL(this.endpoint, window.location.origin);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('行情接口配置无效。');
      const request = Promise.resolve().then(async () => {
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
        if (!response.ok) throw new Error('行情发布包读取失败。');
        return validateDisplayMarket(await response.json());
      });
      // A stalled fetch/body implementation may ignore AbortSignal. The deadline still releases callers.
      return await Promise.race([request, aborted]);
    } finally {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}
const provider = new HttpDisplayMarketProvider();
export function getDisplayMarketProvider(): HttpDisplayMarketProvider { return provider; }
