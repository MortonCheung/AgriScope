// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { resetAppContext } from '../../app/context/appContext';
import { STUDY_CITY_IDS, getCity } from '../../domain/geography/cities';
import { DEMO_MARKET_DATE, DEMO_MARKET_LABEL, demoMarketFor } from '../../domain/market/demoMarket';
import { LiaoningPage } from './LiaoningPage';
import { CityMapFallback } from './CityMapFallback';
import { marketTrendPoints } from './MarketOverview';
vi.mock('motion/react', () => ({ useReducedMotion: () => true }));
vi.mock('../spatial/SpatialShell', () => ({ useCitySelection: () => {
  const navigate = useNavigate(); return (city: string) => navigate(`/liaoning?city=${city}`);
} }));
vi.mock('../../app/pageNavigation', () => ({ usePageNavigate: () => useNavigate(), TransitionLink: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => <Link to={to} {...props}>{children}</Link> }));
beforeEach(resetAppContext);
afterEach(cleanup);
function Location() { const url = useLocation(); return <output data-testid="url">{url.pathname}{url.search}</output>; }
function MapFixture() { const navigate = useNavigate(); return <CityMapFallback selectedCityId={null} onSelectCity={city => navigate(`/liaoning?city=${city}`)}/>; }
const page = (url = '/liaoning') => <MemoryRouter initialEntries={[url]}><MapFixture/><LiaoningPage/><Location/></MemoryRouter>;

describe('产品行情主页', () => {
  it('只显示行情和功能入口，八个品种只展示一次，单位与价格相邻', () => {
    const { container } = render(page());
    expect(container.textContent).not.toMatch(/演示|总览|来源说明/);
    expect(screen.getByText(DEMO_MARKET_LABEL)).toBeTruthy();
    expect(screen.getByRole('heading', { name: '最新行情' })).toBeTruthy();
    expect(container.querySelectorAll('.market-overview__price')).toHaveLength(8);
    expect(container.querySelector('.market-overview__value')?.textContent).toBe('3.9元/kg');
    expect(container.querySelector('select')).toBeNull();
    expect(container.querySelector('.liaoning-page__city .choice-buttons')).toBeNull();
    expect(container.querySelectorAll('.market-overview__caption')).toHaveLength(1);
    expect(container.textContent?.match(/批发价/g)).toHaveLength(1);
    expect(screen.getByText('六城样例均值')).toBeTruthy();
    expect(screen.getByText(`样例日期 ${DEMO_MARKET_DATE}`).getAttribute('dateTime')).toBe(DEMO_MARKET_DATE);
    expect(screen.queryByText(/更新|实时行情/)).toBeNull();
    expect(screen.getByText('涨幅最大')).toBeTruthy();
    expect(screen.getByText('跌幅最大')).toBeTruthy();
    expect(screen.getByText('平均变动')).toBeTruthy();
    expect(container.textContent).not.toMatch(/最新农业市场|全部品种与来源|已接入市场|尚未接入/);
    expect(screen.getByRole('link', { name: '决策' }).getAttribute('href')).toBe('/decision');
    expect(screen.getByRole('link', { name: '报告' }).getAttribute('href')).toBe('/reports');
  });
  it('右票唯一入口位于全部统计之前，不删除行情或统计', () => {
    const { container } = render(page());
    const summary = container.querySelector('.city-summary')!;
    expect(summary.firstElementChild).toBe(screen.getByRole('navigation', { name: '城市工作空间' }));
    expect(within(summary as HTMLElement).getAllByRole('link')).toHaveLength(2);
    expect(summary.querySelectorAll('dt')).toHaveLength(5);
    expect(container.querySelectorAll('.market-overview__price')).toHaveLength(8);
  });
  it('六城立即切换、双纸面不卸载、使用本城样例且报告直达正式报告', () => {
    const { container } = render(page());
    const papers = [...container.querySelectorAll('.liaoning-paper')];
    for (const city of STUDY_CITY_IDS) {
      fireEvent.click(screen.getByRole('button', { name: getCity(city)!.shortName }));
      expect(screen.getByTestId('url').textContent).toBe(`/liaoning?city=${city}`);
      expect([...container.querySelectorAll('.liaoning-paper')]).toEqual(papers);
      expect(container.querySelector('.market-overview__price strong')?.textContent).toBe(String(demoMarketFor(city).rows[0].pricePerKg));
      const actions = within(screen.getByRole('navigation', { name: '城市工作空间' }));
      const decision = actions.getByRole('link', { name: '决策' }), report = actions.getByRole('link', { name: '报告' });
      expect(decision.className).toBe(report.className);
      expect(decision.getAttribute('href')).toContain(`/cities/${city}/decision?city=${city}`);
      expect(report.getAttribute('href')).toContain(`/reports/${city}?city=${city}`);
      expect(container.querySelectorAll('.market-overview__price')).toHaveLength(8);
      expect(screen.getByText(DEMO_MARKET_LABEL)).toBeTruthy();
      expect(screen.getByText(`样例日期 ${DEMO_MARKET_DATE}`)).toBeTruthy();
    }
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('url').textContent).toBe('/liaoning');
    expect([...container.querySelectorAll('.liaoning-paper')]).toEqual(papers);
  });
  it('行情随城市同步更新，清除选择立即恢复默认价格', () => {
    const { container } = render(page('/liaoning?city=shenyang'));
    const change = () => container.querySelector('.market-overview__change')?.textContent;
    expect(change()).toBe('+1.6%');
    fireEvent.click(screen.getByRole('button', { name: '铁岭' }));
    expect(change()).toBe('+1.4%');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(container.querySelector('.market-overview__price strong')?.textContent).toBe('3.9');
  });
  it('未知城市不建立选择，Escape 立即回全省且不创建别城入口', () => {
    render(page('/liaoning?city=anshan'));
    expect(screen.queryByRole('button', { name: '返回地图' })).toBeNull();
    expect(within(screen.getByRole('navigation', {name:'地图城市选择'})).getAllByRole('button').filter(b => b.getAttribute('aria-pressed') === 'true')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '丹东' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('url').textContent).toBe('/liaoning');
  });
});

describe('date-scaled market anchors', () => {
  it('uses actual -30/-7/-1/0 spacing, and preserves trend selection across scopes', () => {
    const points = marketTrendPoints(demoMarketFor(null).rows[0], '2026-10-10');
    expect(points.map(point => point.date)).toEqual(['2026-09-10','2026-10-03','2026-10-09','2026-10-10']);
    expect((points[1].x-points[0].x)/(points[2].x-points[1].x)).toBeCloseTo(23/6);
    const rendered = render(page());
    fireEvent.click(screen.getByRole('button',{name:'长期趋势'}));
    expect(screen.getAllByRole('img')).toHaveLength(8);
    expect(rendered.container.querySelectorAll('.market-overview__trend-dates')).toHaveLength(8);
    expect(rendered.container.querySelector('.market-overview__trend-dates time')?.getAttribute('dateTime')).toBe('2026-09-10');
    const paper = rendered.container.querySelector('.liaoning-page__current');
    fireEvent.click(screen.getByRole('button',{name:'大连'}));
    expect(rendered.container.querySelector('.liaoning-page__current')).toBe(paper);
    expect(screen.getAllByRole('img')).toHaveLength(8);
  });
});
