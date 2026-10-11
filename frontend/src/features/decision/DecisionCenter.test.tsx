// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DecisionCenter } from './DecisionCenter';
import { WorkbenchLayout } from '../../components/workbench/WorkbenchLayout';
import type { MarketObservation } from '../../domain/market/types';
import type { MarketObservationState } from './useMarketObservation';

const data: MarketObservation = {
  cityId: 'jinzhou', cityName: '锦州', unit: '元/kg', available: true, selectedCrop: '土豆', snapshotVersion: 'published-test', crops: ['土豆', '黄瓜'],
  series: [
    { id: 'city-average', crop: '土豆', productName: '土豆', marketName: '全市均价', priceLevel: 'market_average', source: { name: '锦州市发展和改革委员会', url: 'https://fgw.jz.gov.cn' }, observations: [{ date: '2025-07-11', pricePerKg: 2 }, { date: '2025-07-14', pricePerKg: 2.2 }], notes: ['原图 OCR 转录。'] },
    { id: 'monitor-average', crop: '土豆', productName: '土豆', marketName: '锦州市监测点平均', priceLevel: 'market_average', source: { name: '锦州市发展和改革委员会', url: null }, observations: [{ date: '2025-03-01', pricePerKg: 4 }, { date: '2025-03-05', pricePerKg: 3 }], notes: [] },
  ],
};
const ready = (): MarketObservationState => ({ status: 'ready', data, retry: vi.fn() });
function view(state: MarketObservationState = ready(), onCrop = vi.fn()) {
  return <WorkbenchLayout sidebar={() => null} sidebarLabel="决策模块" railLabel="当前结果" resetKey="jinzhou"><DecisionCenter cityId="jinzhou" observation={state} onCrop={onCrop} onPlanning={vi.fn()} /></WorkbenchLayout>;
}
afterEach(cleanup);

describe('市场观察只使用本城正式观测', () => {
  it('shows the actual historical date, price level, unit and source in the result rail', () => {
    const { container } = render(view());
    const rail = within(screen.getByRole('complementary', { name: '当前结果' }));
    expect(rail.getByText('2.2 元/kg')).toBeTruthy();
    expect(rail.getByText('2025-07-14')).toBeTruthy();
    expect(rail.getByText('监测均价')).toBeTruthy();
    expect(rail.getByRole('link').getAttribute('href')).toBe('https://fgw.jz.gov.cn');
    expect(screen.getByRole('img', { name: '土豆在全市均价的真实历史价格，单位元/kg' })).toBeTruthy();
    expect(container.textContent).not.toMatch(/短期预测|长期情景|沈阳暴雨|实时行情|今天采集/);
  });
  it('keeps the two Jinzhou averages separate and updates the same rail when choosing a series', () => {
    const { container } = render(view());
    const paper = container.querySelector('.workbench__paper');
    fireEvent.click(screen.getByRole('button', { name: /土豆 · 锦州市监测点平均/ }));
    const rail = within(screen.getByRole('complementary', { name: '当前结果' }));
    expect(rail.getByText('3 元/kg')).toBeTruthy();
    expect(rail.getByText('2025-03-05')).toBeTruthy();
    expect(rail.queryByText('2.2 元/kg')).toBeNull();
    expect(rail.queryByRole('link')).toBeNull();
    expect(container.querySelector('.workbench__paper')).toBe(paper);
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getAllByRole('row')).toHaveLength(3); // 原始表只含当前序列的两条真读数
  });
  it('hides old values while a new crop loads and offers a real retry on failure', () => {
    const onCrop = vi.fn();
    const rendered = render(view(ready(), onCrop));
    fireEvent.click(within(screen.getByRole('group',{name:'观察作物'})).getByRole('button',{name:'黄瓜'}));
    expect(onCrop).toHaveBeenCalledWith('黄瓜');
    rendered.rerender(view({ status: 'loading', retry: vi.fn() }));
    expect(screen.queryByText('2.2 元/kg')).toBeNull();
    const retry = vi.fn();
    rendered.rerender(view({ status: 'error', error: '真实接口连接失败', retry }));
    fireEvent.click(screen.getByRole('button', { name: '重试市场观测' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.queryByRole('img')).toBeNull();
  });
  it('offers executable planning when there are no same-city observations', () => {
    render(view({ status: 'ready', data: { ...data, cityId: 'dalian', cityName: '大连', available: false, selectedCrop: null, crops: [], series: [], snapshotVersion: null }, retry: vi.fn() }));
    expect(screen.getByRole('button', { name: '使用经营计划' })).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
