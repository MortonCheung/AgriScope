// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DISPLAY_PRICE_LEVELS, DISPLAY_PRODUCTS, INITIAL_DISPLAY_MARKET, displayMarketFor, validateDisplayMarket, type DisplayMarketSnapshot } from '../../domain/market/displayMarket';
import { STUDY_CITY_IDS } from '../../domain/geography/cities';
import { HttpDisplayMarketProvider } from './displayMarketProvider';
const snapshot = (): DisplayMarketSnapshot => structuredClone(INITIAL_DISPLAY_MARKET);
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('完整真实行情发布包', () => {
  it('包含六城和省级默认的168个独立价格组合，按统一商品顺序选择', () => {
    const data = snapshot();
    data.records.reverse();
    expect(validateDisplayMarket(data)).toBe(data);
    for (const city of [...STUDY_CITY_IDS, null]) for (const level of DISPLAY_PRICE_LEVELS) {
      const market = displayMarketFor(data, city, level);
      expect(market.rows.map(row => row.product)).toEqual(DISPLAY_PRODUCTS);
      expect(market.rows.every(row => row.price > 0 && row.region === (city ?? 'liaoning') && row.price_level === level)).toBe(true);
      expect(market.cityId).toBe(city);
    }
    expect(displayMarketFor(data, 'unknown', 'wholesale').scope).toBe('辽宁');
  });
  it.each(['missing', 'duplicate', 'price', 'null', 'date', 'timestamp', 'history', 'order', 'last', 'change', 'product', 'type'])(
    '拒绝%s数据，不能用不完整或不一致的包覆盖全部行情', fault => {
      const data = snapshot();
      if (fault === 'missing') data.records.pop();
      if (fault === 'duplicate') data.records[1] = structuredClone(data.records[0]);
      if (fault === 'price') data.records[0].price = Infinity;
      if (fault === 'null') data.records[0].price = null as unknown as number;
      if (fault === 'date') data.records[0].observation_date = '2026-02-30';
      if (fault === 'timestamp') data.records[0].collectedAt = '2026-02-30T00:00:00Z';
      if (fault === 'history') data.records[0].history = [];
      if (fault === 'order') data.records[0].history = [data.records[0].history[0], data.records[0].history[0]];
      if (fault === 'last') data.records[0].history.at(-1)!.price += 1;
      if (fault === 'change') data.records[0].change_percent += 1;
      if (fault === 'product') data.products.pop();
      if (fault === 'type') data.price_levels[0] = 'invalid' as typeof data.price_levels[number];
      expect(() => validateDisplayMarket(data)).toThrow('校验');
    },
  );
  it('接受真实日期精度和ISO采集时间，显示日期仍来自实际观测', () => {
    const data = snapshot();
    data.records[0].collectedAt = '2026-10-13';
    data.records[1].collectedAt = '2026-10-13T08:12:40+08:00';
    expect(validateDisplayMarket(data)).toBe(data);
    expect(data.records[0].observation_date).toBe(INITIAL_DISPLAY_MARKET.records[0].observation_date);
  });
  it('只请求独立display端点，无城市查询，HTTP/非法包失败可由展示缓存保留上次有效值', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot() });
    vi.stubGlobal('fetch', fetcher);
    await expect(new HttpDisplayMarketProvider().latest()).resolves.toMatchObject({ schema_version: '1' });
    const [url, options] = fetcher.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe('/api/market/display');
    expect(new URL(String(url)).search).toBe('');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.cache).toBe('no-store');
    fetcher.mockResolvedValue({ ok: false });
    await expect(new HttpDisplayMarketProvider().latest()).rejects.toThrow('读取失败');
    fetcher.mockResolvedValue({ ok: true, json: async () => ({ ...snapshot(), records: [] }) });
    await expect(new HttpDisplayMarketProvider().latest()).rejects.toThrow('校验');
  });
  it('10秒后取消迟滞请求，释放超时计时器让缓存下一次订阅仍可刷新', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_url, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    vi.stubGlobal('fetch', fetcher);
    const failure = expect(new HttpDisplayMarketProvider().latest()).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(10_000);
    await failure;
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
