// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { INITIAL_DISPLAY_MARKET, displayMarketFor, type DisplayMarketSnapshot } from '../../domain/market/displayMarket';
import { createDisplayMarketStore, useDisplayMarket } from './useDisplayMarket';
const provider = vi.hoisted(() => ({ latest: vi.fn() }));
vi.mock('../../providers/market/displayMarketProvider', () => ({ getDisplayMarketProvider: () => provider }));
const copy = () => structuredClone(INITIAL_DISPLAY_MARKET);
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('首页整包缓存生命周期', () => {
  it('真实StrictMode只刷一次整包，20次切城和迟来的响应始终显示当前城市', async () => {
    let resolve!: (snapshot: DisplayMarketSnapshot) => void;
    provider.latest.mockImplementation(() => new Promise<DisplayMarketSnapshot>(done => { resolve = done; }));
    function Probe({ city }: { city: string }) {
      const market = displayMarketFor(useDisplayMarket(), city, 'wholesale');
      return <output>{market.scope}:{market.rows[0].price}</output>;
    }
    const view = render(<StrictMode><Probe city="shenyang"/></StrictMode>);
    expect(screen.getByText(`沈阳:${displayMarketFor(INITIAL_DISPLAY_MARKET, 'shenyang', 'wholesale').rows[0].price}`)).toBeTruthy();
    await waitFor(() => expect(provider.latest).toHaveBeenCalledTimes(1));
    for (let index = 0; index < 20; index += 1) view.rerender(<StrictMode><Probe city={index % 2 ? 'dalian' : 'tieling'}/></StrictMode>);
    const next = copy();
    await act(async () => { resolve(next); });
    expect(screen.getByText(`大连:${displayMarketFor(next, 'dalian', 'wholesale').rows[0].price}`)).toBeTruthy();
    expect(provider.latest).toHaveBeenCalledTimes(1);
    view.unmount();
    render(<StrictMode><Probe city="tieling"/></StrictMode>);
    expect(screen.getByText(`铁岭:${displayMarketFor(next, 'tieling', 'wholesale').rows[0].price}`)).toBeTruthy();
    expect(provider.latest).toHaveBeenCalledTimes(1);
  });
  it('请求未返回时首屏立即完整，StrictMode/多个订阅合用一次请求，成功原子替换', async () => {
    let resolve!: (snapshot: DisplayMarketSnapshot) => void;
    const load = vi.fn(() => new Promise<DisplayMarketSnapshot>(done => { resolve = done; }));
    const store = createDisplayMarketStore(load);
    const first = vi.fn(), second = vi.fn();
    const stop = store.subscribe(first);
    const request = store.refresh();
    stop();
    store.subscribe(second);
    expect(store.refresh()).toBe(request);
    expect(store.getSnapshot()).toBe(INITIAL_DISPLAY_MARKET);
    expect(store.getSnapshot().records).toHaveLength(168);
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    const next = copy();
    resolve(next);
    await request;
    expect(store.getSnapshot()).toBe(next);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    await store.refresh();
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('无效响应和网络失败保留完整真实快照，后续订阅可以重试', async () => {
    const invalid = { ...copy(), records: [] };
    const good = copy();
    const load = vi.fn().mockResolvedValueOnce(invalid).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(good);
    const store = createDisplayMarketStore(load);
    const notify = vi.fn();
    store.subscribe(notify);
    await store.refresh();
    expect(store.getSnapshot()).toBe(INITIAL_DISPLAY_MARKET);
    await store.refresh();
    expect(store.getSnapshot()).toBe(INITIAL_DISPLAY_MARKET);
    expect(notify).not.toHaveBeenCalled();
    await store.refresh();
    expect(store.getSnapshot()).toBe(good);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(3);
  });
  it('一次成功刷新后60秒内重进不重复请求，之后允许完整刷新', async () => {
    let now = 10_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const load = vi.fn().mockResolvedValue(copy());
    const store = createDisplayMarketStore(load);
    await store.refresh();
    now += 59_999;
    await store.refresh();
    expect(load).toHaveBeenCalledTimes(1);
    now += 1;
    await store.refresh();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
