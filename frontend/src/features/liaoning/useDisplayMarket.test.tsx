// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { UNAVAILABLE_DISPLAY_MARKET, displayMarketFor, type DisplayMarketSnapshot } from '../../domain/market/displayMarket';
import { makeMarketFixture } from '../../test/fixtures/marketDisplay';
import { makePresentationFixture } from '../../test/fixtures/marketPresentation';
import publishedPresentation from '../../domain/market/publishedPresentation.json';
import { createDisplayMarketStore, useDisplayMarket } from './useDisplayMarket';
const provider = vi.hoisted(() => ({ latest: vi.fn() }));
vi.mock('../../providers/market/displayMarketProvider', () => ({ getDisplayMarketProvider: () => provider }));
const copy = () => makeMarketFixture();
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

function deferred() {
  let resolve!: (value: DisplayMarketSnapshot) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<DisplayMarketSnapshot>((done, fail) => { resolve = done; reject = fail; });
  return { resolve, reject, promise };
}

describe('首页整包缓存生命周期', () => {
  it('StrictMode只刷一次整包；20次切城及迟来的响应始终显示当前城市', async () => {
    let resolve!: (value: ReturnType<typeof makePresentationFixture>) => void;
    const response = new Promise<ReturnType<typeof makePresentationFixture>>(done => { resolve = done; }); provider.latest.mockImplementation(() => response);
    function Probe({ city }: { city: string }) {
      const market = displayMarketFor(useDisplayMarket(), city, 'wholesale');
      return <output>{market.scope}:{market.rows[0]?.price ?? '尚无本地观测'}</output>;
    }
    const view = render(<StrictMode><Probe city="shenyang"/></StrictMode>);
    const initial = publishedPresentation.records.find(row => row.region === 'shenyang' && row.product === '黄瓜' && row.price_level === 'wholesale')!;
    expect(screen.getByText(`沈阳:${initial.price}`)).toBeTruthy(); await waitFor(() => expect(provider.latest).toHaveBeenCalledTimes(1));
    for (let index = 0; index < 20; index += 1) view.rerender(<StrictMode><Probe city={index % 2 ? 'dalian' : 'tieling'}/></StrictMode>);
    const next = makePresentationFixture(); await act(async () => { resolve(next); });
    expect(screen.getByText(`大连:${displayMarketFor(next, 'dalian', 'wholesale').rows[0].price}`)).toBeTruthy(); expect(provider.latest).toHaveBeenCalledTimes(1);
    view.unmount(); render(<StrictMode><Probe city="tieling"/></StrictMode>);
    expect(screen.getByText(`铁岭:${displayMarketFor(next, 'tieling', 'wholesale').rows[0].price}`)).toBeTruthy(); expect(provider.latest).toHaveBeenCalledTimes(1);
  });
  it('首屏仅224个缺项；多个订阅合用同一请求，成功后一次完整替换', async () => {
    const response = deferred(); const load = vi.fn(() => response.promise); const store = createDisplayMarketStore(load);
    const first = vi.fn(), second = vi.fn(); const stop = store.subscribe(first); const request = store.refresh(); stop(); store.subscribe(second);
    expect(store.refresh()).toBe(request); expect(store.getSnapshot()).toBe(UNAVAILABLE_DISPLAY_MARKET);
    expect(store.getSnapshot().records).toHaveLength(0); expect(store.getSnapshot().missing).toHaveLength(224); expect(store.getStatus()).toBe('loading');
    await Promise.resolve(); expect(load).toHaveBeenCalledTimes(1); const next = copy(); response.resolve(next); await request;
    expect(store.getSnapshot()).toBe(next); expect(first).not.toHaveBeenCalled(); expect(second).toHaveBeenCalledTimes(1); expect(store.getStatus()).toBe('idle');
    await store.refresh(); expect(load).toHaveBeenCalledTimes(1);
  });
  it('无效响应及网络失败保留完整快照和真实日期；后续订阅可重试', async () => {
    const good = copy(); const invalid = { ...good, records: [] }; const load = vi.fn().mockResolvedValueOnce(invalid).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(good);
    const store = createDisplayMarketStore(load); const notify = vi.fn(); const status = vi.fn(); store.subscribe(notify); store.subscribeStatus(status);
    await store.refresh(); expect(store.getSnapshot()).toBe(UNAVAILABLE_DISPLAY_MARKET); expect(store.getStatus()).toBe('failed');
    await store.refresh(); expect(store.getSnapshot()).toBe(UNAVAILABLE_DISPLAY_MARKET); expect(notify).not.toHaveBeenCalled();
    await store.refresh(); expect(store.getSnapshot()).toBe(good); expect(store.getStatus()).toBe('idle'); expect(notify).toHaveBeenCalledTimes(1); expect(load).toHaveBeenCalledTimes(3);
    expect(status).toHaveBeenCalledTimes(6);
    load.mockRejectedValue(new Error('offline')); await store.refresh({ force: true }); expect(store.getSnapshot()).toBe(good);
    expect(store.getSnapshot().records[0].observation_date).toBe('2025-10-13'); expect(store.getSnapshot().published_at).toBe('2025-10-14T02:00:00Z');
  });
  it('60秒内不重请求，focus强制刷新仍合用未完成请求', async () => {
    let now = 10_000; vi.spyOn(Date, 'now').mockImplementation(() => now);
    const load = vi.fn().mockResolvedValue(copy()); const store = createDisplayMarketStore(load);
    await store.refresh(); now += 59_999; await store.refresh(); expect(load).toHaveBeenCalledTimes(1);
    now += 1; await store.refresh(); expect(load).toHaveBeenCalledTimes(2);
    const response = deferred(); load.mockImplementation(() => response.promise); const request = store.refresh({ force: true }); expect(store.refresh({ force: true })).toBe(request);
    response.resolve(copy()); await request; expect(load).toHaveBeenCalledTimes(3);
  });
  it('相同快照包含集合顺序变化不重复通知，status通知与数据订阅独立', async () => {
    const good = copy(); const reordered = structuredClone(good); reordered.records.reverse(); reordered.products.reverse(); reordered.price_levels.reverse();
    const store = createDisplayMarketStore(async () => reordered, good); const changed = vi.fn(), health = vi.fn(); store.subscribe(changed); store.subscribeStatus(health);
    await store.refresh(); expect(store.getSnapshot()).toBe(good); expect(changed).not.toHaveBeenCalled(); expect(health).toHaveBeenCalledTimes(2);
    await store.refresh(); expect(health).toHaveBeenCalledTimes(2);
  });
  it('合法后端回滚即使发布时间较旧也可更新；请求身份不冒充业务版本', async () => {
    const current = copy(), rollback = makeMarketFixture('2'); const store = createDisplayMarketStore(async () => rollback, current);
    await store.refresh(); expect(store.getSnapshot()).toBe(rollback); expect(store.getSnapshot().schema_version).toBe('2');
    expect(store.getSnapshot().published_at).toBeUndefined();
  });
  it('忽略abort的旧请求超时后可重试，迟到成功不能覆盖后来的有效代', async () => {
    vi.useFakeTimers(); const old = deferred(), next = deferred(); const good = copy(); const late = makeMarketFixture('2');
    const load = vi.fn().mockImplementationOnce(() => old.promise).mockImplementationOnce(() => next.promise); const store = createDisplayMarketStore(load);
    const request = store.refresh(); await vi.advanceTimersByTimeAsync(10_000); await request;
    expect(store.getStatus()).toBe('failed'); expect(store.getSnapshot()).toBe(UNAVAILABLE_DISPLAY_MARKET); expect(load.mock.calls[0][0].aborted).toBe(true);
    const newer = store.refresh(); await Promise.resolve(); next.resolve(good); await newer; expect(store.getSnapshot()).toBe(good);
    old.resolve(late); await Promise.resolve(); expect(store.getSnapshot()).toBe(good); expect(store.getStatus()).toBe('idle'); expect(vi.getTimerCount()).toBe(0);
  });
  it('每60秒检查，后台不请求，恢复立即读取；status-only订阅不创建请求/轮询', async () => {
    vi.resetModules(); const hooks = await import('./useDisplayMarket'); provider.latest.mockReset().mockResolvedValue(copy()); vi.useFakeTimers();
    const visible = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    function StatusOnly() { return <output>{hooks.useDisplayMarketStatus()}</output>; }
    const statusOnly = render(<StatusOnly/>); await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); expect(provider.latest).not.toHaveBeenCalled(); statusOnly.unmount();
    function Probe() { const data = hooks.useDisplayMarket(); return <output>{data.records.length}</output>; }
    const view = render(<Probe/>); await act(async () => { await Promise.resolve(); }); expect(provider.latest).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); }); expect(provider.latest).toHaveBeenCalledTimes(2);
    visible.mockReturnValue('hidden'); await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(120_000); window.dispatchEvent(new Event('focus')); });
    expect(provider.latest).toHaveBeenCalledTimes(2);
    visible.mockReturnValue('visible'); await act(async () => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); await Promise.resolve(); });
    expect(provider.latest).toHaveBeenCalledTimes(3); view.unmount(); expect(vi.getTimerCount()).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); window.dispatchEvent(new Event('focus')); }); expect(provider.latest).toHaveBeenCalledTimes(3);
  });
});
