// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DISPLAY_REGIONS, DISPLAY_PRICE_LEVELS, displayMarketFor, UNAVAILABLE_DISPLAY_MARKET, type MarketSnapshot } from '../../domain/market/displayMarket';
import { makePresentationFixture } from '../../test/fixtures/marketPresentation';
import { HttpDisplayMarketProvider } from '../../providers/market/displayMarketProvider';
import { createDisplayMarketStore } from './useDisplayMarket';
import { MarketOverview, marketTrendPoints } from './MarketOverview';
import { CitySummary } from './CitySummary';
vi.mock('motion/react', async original => ({ ...await original<typeof import('motion/react')>(), useReducedMotion: () => true }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('价格和历史的持续可用性', () => {
  it('离线、空观测和损坏包都保留完整值、历史和日期，恢复后原子更新', async () => {
    const seed = makePresentationFixture();
    seed.records[0].trend_history = [{ date: '2025-09-01', price: 2.1 }, { date: '2025-09-13', price: 3.1 }];
    Object.assign(seed.records[0].origin, { trend_history_kind: 'local_same_source_observations', trend_series_identity: ['shenyang','黄瓜','wholesale','TEST'] });
    const next = makePresentationFixture(); next.input_hash = 'b'.repeat(64);
    const load = vi.fn<() => Promise<MarketSnapshot>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(UNAVAILABLE_DISPLAY_MARKET)
      .mockResolvedValueOnce({ ...seed, records: [] }).mockResolvedValueOnce(next);
    const store = createDisplayMarketStore<MarketSnapshot>(load, seed), notify = vi.fn(); store.subscribe(notify);
    for (let i = 0; i < 3; i += 1) {
      await store.refresh({ force: true }); expect(store.getSnapshot()).toBe(seed); expect(store.getStatus()).toBe('failed');
      expect(store.getSnapshot().records).toHaveLength(224); expect(notify).not.toHaveBeenCalled();
    }
    await store.refresh({ force: true }); expect(store.getSnapshot()).toBe(next); expect(notify).toHaveBeenCalledTimes(1); expect(store.getStatus()).toBe('idle');
  });
  it('展示端点拒绝旧观测空包，但旧观测Provider仍按原合同工作', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => UNAVAILABLE_DISPLAY_MARKET }); vi.stubGlobal('fetch', fetcher);
    await expect(new HttpDisplayMarketProvider('/api/market/presentation', true).latest()).rejects.toThrow('版本不符');
    await expect(new HttpDisplayMarketProvider().latest()).resolves.toBe(UNAVAILABLE_DISPLAY_MARKET);
    fetcher.mockResolvedValue({ ok: true, json: async () => makePresentationFixture() });
    await expect(new HttpDisplayMarketProvider('/api/market/presentation', true).latest()).resolves.toMatchObject({ schema_version: 'presentation-1' });
  });
  it('同一发布无论集合顺序如何均不重刷，秒钟与API请求互不驱动', async () => {
    vi.useFakeTimers(); const seed = makePresentationFixture(), reordered = structuredClone(seed);
    reordered.records.reverse(); reordered.regions.reverse(); reordered.products.reverse(); reordered.price_levels.reverse();
    const load = vi.fn(async () => reordered), store = createDisplayMarketStore(load, seed), notify = vi.fn(); store.subscribe(notify);
    await store.refresh(); expect(notify).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000); expect(load).toHaveBeenCalledTimes(1); expect(store.getSnapshot()).toBe(seed);
  });
  it('正式基底与同代API私有证据不同不会重刷纸张，但价格变化仍通知', async () => {
    const seed = makePresentationFixture(), full = structuredClone(seed);
    Object.assign(full, { provenance: { private_input_receipts: 'TEST-only internal evidence' } });
    full.records[0].origin.internal_calibration = { input_hash: 'c'.repeat(64) };
    const load = vi.fn(async () => full), store = createDisplayMarketStore(load, seed), notify = vi.fn(); store.subscribe(notify);
    await store.refresh(); expect(store.getSnapshot()).toBe(seed); expect(notify).not.toHaveBeenCalled();
    full.records[0].price = 9; full.records[0].history[0].price = 9;
    await store.refresh({ force: true }); expect(store.getSnapshot()).toBe(full); expect(notify).toHaveBeenCalledTimes(1);
  });
  it('七地区四口径渲染完整且不显示内部来源种类；原始长期曲线不被当前单点替换', () => {
    const data = makePresentationFixture();
    for (const row of data.records) {
      row.trend_history = [{ date: '2025-08-01', price: 1.5 }, { date: '2025-10-01', price: 2 }];
      Object.assign(row.origin, { trend_history_kind: 'local_same_source_observations', trend_series_identity: [row.region,row.product,row.price_level,'TEST'] });
    }
    const props = { product: '', onProductChange: () => {}, onPriceLevelChange: () => {} };
    const page = (region: string, level: typeof DISPLAY_PRICE_LEVELS[number]) => <MemoryRouter><MarketOverview {...props} market={displayMarketFor(data,region,level)}/></MemoryRouter>;
    const { container, rerender } = render(page('shenyang','wholesale'));
    const paperData = screen.getByRole('region', { name: '商品行情列表' });
    fireEvent.click(screen.getByRole('button', { name: '长期趋势' }));
    for (const region of DISPLAY_REGIONS) for (const level of DISPLAY_PRICE_LEVELS) {
      rerender(page(region,level)); expect(screen.getByRole('region', { name: '商品行情列表' })).toBe(paperData);
      expect(container.querySelectorAll('.market-overview__value')).toHaveLength(8);
      expect(container.querySelectorAll('polyline')).toHaveLength(8);
      expect(container.textContent).not.toMatch(/尚无|暂无|模拟|计算|演示|null|NaN|Infinity/);
    }
    const row = displayMarketFor(data,'shenyang','wholesale').rows[0];
    expect(marketTrendPoints(row).map(point => point.date)).toEqual(['2025-08-01','2025-10-01']);
  });
  it('右票展示真实来源集合，计算价格不伪造观测/采集时间、不暴露内部状态', async () => {
    const data = makePresentationFixture(), row = data.records[0];
    row.observed_at = null; row.collected_at = null; row.origin = { kind: 'model_estimate', history_kind: 'calculation' };
    const market = { ...displayMarketFor(data,'shenyang','wholesale'), rows: [displayMarketFor(data,'shenyang','wholesale').rows[0]] };
    const { container } = render(<MemoryRouter><CitySummary market={market}/></MemoryRouter>);
    expect(screen.getByRole('region', { name: '数据来源' }).querySelectorAll('a')).toHaveLength(4);
    expect(container.textContent).not.toMatch(/模型|计算|模拟|数据较旧|暂无本地|无法获取/);
    const times = container.querySelectorAll('.market-data-status__times dd');
    expect(times[0].textContent).toBe('—'); expect(times[1].textContent).toBe('—');
    await act(async () => { await Promise.resolve(); });
  });
});
