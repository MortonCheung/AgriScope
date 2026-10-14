// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DisplayMarketRecord, DisplayMarketView } from '../../domain/market/displayMarket';
import { MarketDataStatus } from './MarketDataStatus';

const requests = vi.hoisted(() => ({ status: 'idle' as 'idle' | 'loading' | 'failed' }));
vi.mock('./useDisplayMarket', () => ({ useDisplayMarketStatus: () => requests.status }));

// Fictional unit-test fixture only; never part of production snapshots.
function observation(overrides: Partial<DisplayMarketRecord> = {}): DisplayMarketRecord {
  return { region: 'shenyang', product: '黄瓜', price_level: 'wholesale', price: 2.2,
    observation_date: '2026-10-13', collectedAt: '2026-10-14T01:30:00Z', change_percent: 0,
    history: [{ date: '2026-10-13', price: 2.2 }], ...overrides };
}
function view(overrides: Partial<DisplayMarketView> = {}): DisplayMarketView {
  const row = observation();
  return { cityId: 'shenyang', scope: '沈阳', priceLevel: 'wholesale', schemaVersion: '3',
    rows: [row], regionRows: [row], publishedAt: '2026-10-14T02:00:00Z', ...overrides };
}
const valueFor = (name: string) => screen.getByText(name).closest('div')?.querySelector('dd');
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-14T02:32:07Z')); requests.status = 'idle'; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('真实行情元数据独立于浏览器实时时钟', () => {
  it('分开观测、采集与发布证据，日期不取浏览器当天', () => {
    render(<MarketDataStatus market={view()}/>);
    expect(screen.getByLabelText('行情状态')).toBeTruthy(); expect(screen.getByText('近期观测')).toBeTruthy();
    expect(valueFor('最近观测')?.textContent).toBe('10-13');
    expect(valueFor('采集时间')?.textContent).toBe('10-14 09:30');
    expect(valueFor('发布时间')?.textContent).toBe('10-14 10:00');
    expect(valueFor('最近观测')?.querySelector('time')?.dateTime).toBe('2026-10-13');
    expect(valueFor('采集时间')?.querySelector('time')?.dateTime).toBe('2026-10-14T01:30:00Z');
    expect(screen.queryByText('实时更新成功')).toBeNull();
  });
  it('当前价型无记录时不借覆盖信息或其他价型日期', () => {
    const market = view({ rows: [], regionRows: [observation({ price_level: 'market_average' })],
      coverage: { collection_status: 'configured', available_records: 1, total_records: 32,
        latest_observation_date: '2026-10-13', latest_collected_at: '2026-10-14T01:30:00Z' } });
    render(<MarketDataStatus market={market}/>);
    expect(screen.getByText('暂无本地观测')).toBeTruthy();
    expect(valueFor('最近观测')?.textContent).toBe('—'); expect(valueFor('采集时间')?.textContent).toBe('—');
    expect(valueFor('发布时间')?.textContent).toBe('10-14 10:00');
  });
  it('V2只有日期时不虚构小时，缺发布时间保持空证据', () => {
    render(<MarketDataStatus market={view({ schemaVersion: '2', rows: [observation({ collectedAt: '2026-10-13' })], publishedAt: undefined })}/>);
    expect(valueFor('采集时间')?.textContent).toBe('10-13'); expect(valueFor('采集时间')?.textContent).not.toContain(':');
    expect(valueFor('发布时间')?.textContent).toBe('—');
  });
  it('多个商品选最新真实证据，不把一个来源伪装成全地区来源', () => {
    render(<MarketDataStatus market={view({ rows: [observation(), observation({ product: '甘蓝', observation_date: '2026-10-12', collectedAt: '2026-10-14T02:30:00Z' })] })}/>);
    expect(valueFor('最近观测')?.textContent).toBe('10-13'); expect(valueFor('采集时间')?.textContent).toBe('10-14 10:30');
    expect(screen.queryByText('数据来源')).toBeNull();
  });
  it('在北京日界更新新鲜度；普通秒变化不更新元数据、不请求API', () => {
    vi.setSystemTime(new Date('2026-10-14T15:59:50Z'));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const market = view({ rows: [observation({ observation_date: '2026-10-14' })] });
    render(<MarketDataStatus market={market}/>); const status = screen.getByLabelText('行情状态');
    expect(within(status).getByText('今日观测')).toBeTruthy();
    act(() => vi.advanceTimersByTime(9000)); expect(within(status).getByText('今日观测')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1005)); expect(within(status).getByText('近期观测')).toBeTruthy();
    expect(valueFor('最近观测')?.textContent).toBe('10-14'); expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('后台恢复马上按当前北京日期重算，卸载清理唯一日界timer', () => {
    let visibility: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    const { unmount } = render(<MarketDataStatus market={view()}/>); expect(vi.getTimerCount()).toBe(1);
    visibility = 'hidden'; act(() => document.dispatchEvent(new Event('visibilitychange'))); expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(new Date('2026-10-24T02:00:00Z'));
    visibility = 'visible'; act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(screen.getByText('数据较旧')).toBeTruthy(); expect(vi.getTimerCount()).toBe(1);
    unmount(); expect(vi.getTimerCount()).toBe(0);
    act(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('获取失败保留元数据，恢复后撤销提示；未来观测不显示今日', () => {
    const market = view(); const { rerender } = render(<MarketDataStatus market={market}/>);
    requests.status = 'failed'; rerender(<MarketDataStatus market={market}/>);
    expect(screen.getByRole('status').textContent).toBe('暂时无法获取更新');
    expect(valueFor('最近观测')?.textContent).toBe('10-13'); expect(valueFor('采集时间')?.textContent).toBe('10-14 09:30');
    requests.status = 'idle'; rerender(<MarketDataStatus market={view({ rows: [observation({ observation_date: '2026-10-15' })] })}/>);
    expect(screen.queryByRole('status')).toBeNull(); expect(screen.getByText('观测日期待核验')).toBeTruthy();
    expect(screen.queryByText('今日观测')).toBeNull();
  });
});
