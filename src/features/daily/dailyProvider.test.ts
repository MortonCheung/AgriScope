// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpDailyProvider } from '../../providers/daily';
import { DAILY_TEST_NOW, dailyTestRaw } from './daily.testData';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('HTTP Daily provider', () => {
  it('reads the production endpoint with city and validates the returned published snapshot', async () => {
    vi.useFakeTimers(); vi.setSystemTime(DAILY_TEST_NOW);
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => dailyTestRaw() });
    vi.stubGlobal('fetch', fetcher);
    const result = await new HttpDailyProvider().latest('shenyang');
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/daily/latest');
    expect(url.searchParams.get('city')).toBe('shenyang');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: 'no-store', headers: { Accept: 'application/json' } });
    expect(result.crops[0].pricePerKg).toBe(4.4);
  });

  it('preserves a configured HTTP endpoint and its existing query', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => dailyTestRaw() });
    vi.stubGlobal('fetch', fetcher);
    await new HttpDailyProvider('https://market.example.org/latest?version=1').latest('shenyang');
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.origin).toBe('https://market.example.org');
    expect(url.searchParams.get('version')).toBe('1');
    expect(url.searchParams.get('city')).toBe('shenyang');
  });

  it('never borrows Shenyang data for another city', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(new HttpDailyProvider().latest('chaoyang')).rejects.toThrow('暂未接入');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([503, 404])('does not substitute fixture data after HTTP %s', async status => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status }); vi.stubGlobal('fetch', fetcher);
    await expect(new HttpDailyProvider().latest('shenyang')).rejects.toThrow('暂时无法加载');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed response instead of accepting unvalidated market data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ schema_version: '1.1.0' }) }));
    await expect(new HttpDailyProvider().latest('shenyang')).rejects.toThrow('格式不完整');
  });

  it('rejects browser filesystem endpoints without fetching', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(new HttpDailyProvider('file:///Users/example/latest.json').latest('shenyang')).rejects.toThrow('接口配置有误');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('ends an unresponsive request after ten seconds', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })));
    const request = new HttpDailyProvider().latest('shenyang');
    const rejection = expect(request).rejects.toThrow('响应超时');
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
  });

  it('passes cancellation through rather than reporting an API failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })));
    const controller = new AbortController();
    const request = new HttpDailyProvider().latest('shenyang', { signal: controller.signal });
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});
