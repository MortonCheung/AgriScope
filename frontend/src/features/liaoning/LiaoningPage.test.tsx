// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { adaptDailySnapshot } from '../../domain/daily/adapter';
import type { DailyState } from '../../domain/daily/types';
import { resetAppContext } from '../../app/context/appContext';
import { DAILY_TEST_NOW, dailyTestRaw } from '../daily/daily.testData';
import { LiaoningPage } from './LiaoningPage';
import { MarketOverview, latestMarketRows } from './MarketOverview';

const mock = vi.hoisted(() => ({ state: { status: 'loading' } as DailyState, refresh: vi.fn(), refreshing: false, refreshError: undefined as string | undefined }));
vi.mock('motion/react', () => ({ useReducedMotion: () => true }));
vi.mock('../daily/useDaily', () => ({ useDailyResource: (city: string) => ({ ...mock, state: city === 'shenyang' ? mock.state : { status: 'unsupported' } }) }));
vi.mock('../spatial/SpatialShell', () => ({ useCitySelection: () => {
  const navigate = useNavigate();
  return (city: string) => navigate(`/liaoning?city=${city}`);
} }));
vi.mock('../../app/pageNavigation', () => ({ usePageNavigate: () => useNavigate(), TransitionLink: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => <Link to={to} {...props}>{children}</Link> }));
beforeEach(() => {
  resetAppContext();
  mock.state = { status: 'ready', data: adaptDailySnapshot(dailyTestRaw(), DAILY_TEST_NOW) };
  mock.refresh.mockReset(); mock.refreshing = false; mock.refreshError = undefined;
});
afterEach(cleanup);
function Location() { const url = useLocation(); return <output data-testid="url">{url.pathname}{url.search}</output>; }
const page = (url = '/liaoning') => <MemoryRouter initialEntries={[url]}><LiaoningPage/><Location/></MemoryRouter>;
describe('市场与地图主页', () => {
  it('默认无选择，以真实市场和日期替代年度气候、生产和底部教学', () => {
    const { container } = render(page());
    expect(screen.getByTestId('url').textContent).toBe('/liaoning');
    expect(screen.getByRole('combobox', { name: '观察对象' })).toHaveProperty('value', '');
    expect(screen.getAllByText('沈阳批发市场').length).toBeGreaterThan(0);
    expect(container.querySelector('.market-overview__date')?.textContent).toContain('2026-10-07');
    expect(container.querySelector('.market-overview__price strong')?.textContent).toBe('4.4');
    expect(screen.getByText('批发价 · 元 / 公斤')).toBeTruthy();
    expect(container.querySelector('.liaoning-map-footer')).toBeNull();
    expect(container.querySelector('.liaoning-city-rail')).toBeNull();
    expect(container.textContent).not.toMatch(/气温|降水|生产格局|点击观察|选择城市.*开始观察|辽宁.*六城研究区/);
    expect(screen.queryByRole('link', { name: '决策' })).toBeNull();
  });
  it('六城连续切换保持两个纸面节点，缺日度城不显示沈阳价格，双入口同规格', () => {
    const { container } = render(page());
    const papers = [...container.querySelectorAll('.liaoning-paper')];
    for (const city of ['shenyang', 'tieling', 'chaoyang', 'jinzhou', 'dandong', 'dalian']) {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: city } });
      expect(screen.getByTestId('url').textContent).toBe(`/liaoning?city=${city}`);
      expect([...container.querySelectorAll('.liaoning-paper')]).toEqual(papers);
      const actions = within(screen.getByRole('navigation', { name: '城市工作空间' }));
      const decision = actions.getByRole('link', { name: '决策' }), report = actions.getByRole('link', { name: '报告' });
      expect(decision.className).toBe(report.className);
      expect(decision.getAttribute('href')).toContain(`/cities/${city}/decision?city=${city}`);
      expect(report.getAttribute('href')).toContain(`/cities/${city}?city=${city}`);
      if (city !== 'shenyang') {
        expect(screen.getByText('本城日度批发观测尚未接入。')).toBeTruthy();
        expect(container.querySelector('.market-overview__price')).toBeNull();
        expect(screen.queryByText('沈阳批发市场')).toBeNull();
      }
    }
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    expect(screen.getByTestId('url').textContent).toBe('/liaoning');
    expect([...container.querySelectorAll('.liaoning-paper')]).toEqual(papers);
  });
  it('变化口径实际切换同一发布观测，而不是只改变标签', () => {
    const { container } = render(page('/liaoning?city=shenyang'));
    const row = () => container.querySelector('.market-overview__price .market-overview__change')?.textContent;
    expect(row()).toBe('+4.3%');
    fireEvent.click(screen.getByRole('button', { name: '前观测' }));
    expect(row()).toBe('-3.5%');
    fireEvent.click(screen.getByRole('button', { name: '30 日' }));
    expect(row()).toBe('+18.9%');
  });
  it('刷新失败保留带日期的数据，同时明确失败；忙态不可重复点击', () => {
    const resource = { ...mock, state: mock.state, refreshError: '网络不可达' };
    const { rerender } = render(<MarketOverview cityId="shenyang" resource={resource}/>);
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(mock.refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole('status').textContent).toContain('刷新失败，仍显示以上日期的观测。');
    expect(document.querySelector('.market-overview__date time')?.textContent).toBe('2026-10-07');
    rerender(<MarketOverview cityId="shenyang" resource={{ ...resource, refreshing: true }}/>);
    expect(screen.getByRole('button', { name: '读取中…' })).toHaveProperty('disabled', true);
  });
  it('未知行政区 URL 不建立选择，使用共享城市选择而不新增默认沈阳', () => {
    render(page('/liaoning?city=anshan'));
    expect(screen.getByRole('combobox')).toHaveProperty('value', '');
    expect(screen.queryByRole('link', { name: '决策' })).toBeNull();
  });
});
describe('最新观测排序', () => {
  it('排除缺价格/日期/来源条目，保留零涨跌，且不修改发布序列', () => {
    const base = adaptDailySnapshot(dailyTestRaw(), DAILY_TEST_NOW).crops[0];
    const rows = [{ ...base, crop: '甲', change7d: 0 }, { ...base, crop: '乙', change7d: -.25 }, { ...base, crop: '无价', pricePerKg: null }, { ...base, crop: '无来源', sourceId: null }, { ...base, crop: '无日期', dataDate: null }];
    expect(latestMarketRows(rows).map(row => row.crop)).toEqual(['乙', '甲']);
    expect(rows[0].crop).toBe('甲');
  });
});
