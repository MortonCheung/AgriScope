// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DISPLAY_PRICE_LEVELS, DISPLAY_PRODUCTS, DISPLAY_REGIONS, LEGACY_DISPLAY_PRICE_LEVELS, displayMarketFor, validateDisplayMarket, type DisplayMarketSnapshot } from '../../domain/market/displayMarket';
import { makeMarketFixture, sparseMarketFixture } from '../../test/fixtures/marketDisplay';
import { HttpDisplayMarketProvider } from './displayMarketProvider';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const copy = () => makeMarketFixture();

describe('严格 Market Display V3 整包契约', () => {
  it('七地区四价型八商品均保留真实各自身份、来源及数据日期', () => {
    const data = copy(); data.records.reverse();
    expect(validateDisplayMarket(data)).toBe(data);
    expect(data.records).toHaveLength(224);
    for (const region of DISPLAY_REGIONS) for (const level of DISPLAY_PRICE_LEVELS) {
      const view = displayMarketFor(data, region === 'liaoning' ? null : region, level);
      expect(view.rows.map(row => row.product)).toEqual(DISPLAY_PRODUCTS);
      expect(view.rows.every(row => row.region === region && row.price_level === level && row.unit === '元/kg' && row.source)).toBe(true);
      expect(view).toMatchObject({ schemaVersion: '3', coverage: data.coverage[region], publishedAt: data.published_at });
      expect(view.regionRows).toHaveLength(32);
      expect(view.rows[0].observation_date).toBe('2025-10-13');
    }
  });
  it('V2保留168个真实旧口径格子，新增监测均价只能缺项且不编造来源、发布时间', () => {
    const data = makeMarketFixture('2');
    expect(data.records).toHaveLength(168);
    expect(validateDisplayMarket(data)).toBe(data);
    for (const region of DISPLAY_REGIONS) {
      for (const level of LEGACY_DISPLAY_PRICE_LEVELS) expect(displayMarketFor(data, region, level).rows).toHaveLength(8);
      const missing = displayMarketFor(data, region, 'market_average');
      expect(missing.rows).toEqual([]); expect(missing.missing).toHaveLength(8); expect(missing.publishedAt).toBeNull();
      expect(missing.regionRows?.every(row => row.source === undefined && row.unit === undefined)).toBe(true);
    }
  });
  it.each(['1', '4', '', undefined])('生产拒绝 schema %s，不进入旧比赛展示回退', schema_version => {
    expect(() => validateDisplayMarket({ ...copy(), schema_version })).toThrow('校验');
  });
  it.each([0, -1, NaN, Infinity, -Infinity, null, true, '2.2'])('拒绝非法价格 %s', invalid => {
    const data = copy(); data.records[0].price = invalid as number;
    expect(() => validateDisplayMarket(data)).toThrow('校验');
  });
  it.each(['missing', 'duplicate', 'unknown region', 'wrong level', 'missing source', 'wrong unit', 'missing coverage', 'coverage count', 'coverage date', 'coverage time', 'coverage status', 'coverage total', 'missing published', 'bad published', 'product', 'levels'])('拒绝%s，不混合不同口径或版本', fault => {
    const data = copy();
    if (fault === 'missing') data.records.pop();
    if (fault === 'duplicate') data.records[1] = structuredClone(data.records[0]);
    if (fault === 'unknown region') data.records[0].region = 'anshan' as typeof data.records[0]['region'];
    if (fault === 'wrong level') data.records[0].price_level = 'market_average';
    if (fault === 'missing source') delete data.records[0].source;
    if (fault === 'wrong unit') data.records[0].unit = '元/斤' as '元/kg';
    if (fault === 'missing coverage') delete (data.coverage as Partial<typeof data.coverage>).liaoning;
    if (fault === 'coverage count') data.coverage.shenyang.available_records = 31;
    if (fault === 'coverage date') data.coverage.shenyang.latest_observation_date = '2025-10-12';
    if (fault === 'coverage time') data.coverage.shenyang.latest_collected_at = '2025-10-14T00:00:00Z';
    if (fault === 'coverage status') data.coverage.shenyang.collection_status = 'scheduled';
    if (fault === 'coverage total') data.coverage.shenyang.total_records = 24;
    if (fault === 'missing published') delete data.published_at;
    if (fault === 'bad published') data.published_at = '2025-10-14';
    if (fault === 'product') data.products.pop();
    if (fault === 'levels') data.price_levels.pop();
    expect(() => validateDisplayMarket(data)).toThrow('校验');
  });
  it.each(['javascript:alert(1)', 'data:text/html,hello', 'file:///etc/passwd', '//example.test/source', 'https://', 'https://user:password@example.test/source', 'https://example.test/\nsource', 'https://example.test\\source'])('拒绝不安全来源链接 %s', url => {
    const data = copy(); data.records[0].source!.url = url; expect(() => validateDisplayMarket(data)).toThrow('校验');
  });
  it.each(['2025-02-30', '2025-04-31', '2025-13-01', '2025-10-1', '0000-01-01', '9999-01-01'])('拒绝不成立观测日期 %s', date => {
    const data = copy(); data.records[0].observation_date = date; data.records[0].history[0].date = date;
    expect(() => validateDisplayMarket(data)).toThrow('校验');
  });
  it.each(['2025-10-14', '2025-02-30T00:00:00Z', '2025-10-14T24:00:00Z', '2025-10-14T09:60:00+08:00', '2025-10-14T09:30:00+08:99', '2025-10-14T09:30:00'])('V3采集时间必须为有效带时区ISO %s', collectedAt => {
    const data = copy(); data.records[0].collectedAt = collectedAt; expect(() => validateDisplayMarket(data)).toThrow('校验');
  });
  it.each(['empty', 'duplicate date', 'last price', 'last date', 'negative history', 'nonfinite change', 'wrong change', 'too long'])('拒绝历史/涨跌不一致：%s', fault => {
    const data = copy(); const row = data.records[0];
    if (fault === 'empty') row.history = [];
    if (fault === 'duplicate date') row.history = [...row.history, row.history[0]];
    if (fault === 'last price') row.history[0].price += 1;
    if (fault === 'last date') row.history[0].date = '2025-10-12';
    if (fault === 'negative history') row.history[0].price = -1;
    if (fault === 'nonfinite change') row.change_percent = Infinity;
    if (fault === 'wrong change') row.change_percent = 1;
    if (fault === 'too long') row.history = Array.from({ length: 5 }, (_item, i) => ({ date: `2025-10-${9 + i}`, price: row.price }));
    expect(() => validateDisplayMarket(data)).toThrow('校验');
  });
  it('只有真实朝阳监测均价时，批发、其它城市和省级仍明确缺项', () => {
    const row = copy().records.find(row => row.region === 'chaoyang' && row.product === '黄瓜' && row.price_level === 'market_average')!;
    const sparse = sparseMarketFixture([row]);
    expect(sparse.missing).toHaveLength(223);
    expect(displayMarketFor(sparse, 'chaoyang', 'market_average').rows).toEqual([row]);
    for (const [city, level] of [['chaoyang', 'wholesale'], ['shenyang', 'market_average'], [null, 'market_average']] as const) {
      expect(displayMarketFor(sparse, city, level).rows).toEqual([]); expect(displayMarketFor(sparse, city, level).missing).toHaveLength(8);
    }
    const invalid = structuredClone(sparse); invalid.missing.push(invalid.missing[0]); expect(() => validateDisplayMarket(invalid)).toThrow();
  });
  it('单期历史0只表示不可比较约定；正确多期涨跌可被验证', () => {
    const data = copy(); const row = data.records[0];
    row.history.unshift({ date: '2025-10-12', price: row.price / 1.025 }); row.change_percent = 2.5;
    expect(validateDisplayMarket(data)).toBe(data);
    row.change_percent = 0; expect(() => validateDisplayMarket(data)).toThrow();
  });
  it('兼容V2历史日期精度，但不将它补造为具体采集时分', () => {
    const data = makeMarketFixture('2'); data.records[0].collectedAt = '2025-10-14';
    expect(validateDisplayMarket(data).records[0].collectedAt).toBe('2025-10-14');
  });
  it('latest_collected_at比较实际时刻，不把+08:00文本较大当作时间较晚', () => {
    const rows = copy().records.filter(row => row.region === 'shenyang').slice(0, 2);
    rows[0].collectedAt = '2025-10-14T09:00:00+08:00'; rows[1].collectedAt = '2025-10-14T02:00:00Z';
    const data = sparseMarketFixture(rows); expect(data.coverage.shenyang.latest_collected_at).toBe(rows[1].collectedAt);
    data.coverage.shenyang.latest_collected_at = rows[0].collectedAt; expect(() => validateDisplayMarket(data)).toThrow();
  });
  it('允许将来额外字段，已知字段的真实口径仍不可改变', () => {
    const data = copy(); Object.assign(data, { future_metadata: { revision: 9 } }); Object.assign(data.records[0].source!, { licence: 'test' });
    expect(validateDisplayMarket(data)).toBe(data);
  });
});

describe('HTTP独立行情读取', () => {
  it('只请求完整display端点；HTTP/非法包失败显式拒绝', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => copy() }); vi.stubGlobal('fetch', fetcher);
    await expect(new HttpDisplayMarketProvider().latest()).resolves.toMatchObject({ schema_version: '3' });
    const [url, options] = fetcher.mock.calls[0]; expect(new URL(String(url)).pathname).toBe('/api/market/display'); expect(new URL(String(url)).search).toBe('');
    expect(options.signal).toBeInstanceOf(AbortSignal); expect(options.cache).toBe('no-store');
    fetcher.mockResolvedValue({ ok: false }); await expect(new HttpDisplayMarketProvider().latest()).rejects.toThrow('读取失败');
    fetcher.mockResolvedValue({ ok: true, json: async () => ({ ...copy(), records: [] }) });
    await expect(new HttpDisplayMarketProvider().latest()).rejects.toThrow('校验');
  });
  it('10秒 deadline 即使fetch忽略abort也能释放调用者，后续可重新读取', async () => {
    vi.useFakeTimers(); const fetcher = vi.fn().mockImplementationOnce(() => new Promise(() => {})).mockResolvedValue({ ok: true, json: async () => copy() });
    vi.stubGlobal('fetch', fetcher); const provider = new HttpDisplayMarketProvider(); const request = provider.latest();
    const failure = expect(request).rejects.toMatchObject({ name: 'AbortError' }); await vi.advanceTimersByTimeAsync(10_000); await failure;
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
    await expect(provider.latest()).resolves.toMatchObject({ schema_version: '3' }); expect(vi.getTimerCount()).toBe(0);
  });
  it('fetch已返回但body卡住时同样超时，外部取消不产生迟到成功', async () => {
    vi.useFakeTimers(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(() => {}) }));
    const failure = expect(new HttpDisplayMarketProvider().latest()).rejects.toMatchObject({ name: 'AbortError' }); await vi.advanceTimersByTimeAsync(10_000); await failure;
    const controller = new AbortController(); const cancelled = expect(new HttpDisplayMarketProvider().latest(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await cancelled; expect(vi.getTimerCount()).toBe(0);
  });
  it('已取消的调用在读取之前拒绝，不建立请求或残留计时器', async () => {
    vi.useFakeTimers(); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController(); controller.abort();
    await expect(new HttpDisplayMarketProvider().latest(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});
