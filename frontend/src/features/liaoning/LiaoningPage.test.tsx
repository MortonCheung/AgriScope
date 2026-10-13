// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { resetAppContext } from '../../app/context/appContext';
import { STUDY_CITY_IDS, getCity } from '../../domain/geography/cities';
import { DISPLAY_PRICE_LEVELS, INITIAL_DISPLAY_MARKET, PRICE_LEVEL_BUTTON, PRICE_LEVEL_LABEL, displayMarketFor, type DisplayMarketRecord } from '../../domain/market/displayMarket';
import { LiaoningPage } from './LiaoningPage';
import { CityMapFallback } from './CityMapFallback';
import { marketTrendPoints } from './MarketOverview';
vi.mock('motion/react', () => ({ useReducedMotion: () => true }));
vi.mock('../../providers/market/displayMarketProvider', () => ({ getDisplayMarketProvider: () => ({ latest: () => new Promise(() => {}) }) }));
vi.mock('../spatial/SpatialShell', () => ({ useCitySelection: () => {
  const navigate = useNavigate(); return (city: string) => navigate(`/liaoning?city=${city}`);
} }));
vi.mock('../../app/pageNavigation', () => ({ usePageNavigate: () => useNavigate(), TransitionLink: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => <Link to={to} {...props}>{children}</Link> }));
beforeEach(resetAppContext);
afterEach(cleanup);
function Location() { const url = useLocation(); return <output data-testid="url">{url.pathname}{url.search}</output>; }
function MapFixture() { const navigate = useNavigate(); return <CityMapFallback selectedCityId={null} onSelectCity={city => navigate(`/liaoning?city=${city}`)}/>; }
const page = (url = '/liaoning') => <MemoryRouter initialEntries={[url]}><MapFixture/><LiaoningPage/><Location/></MemoryRouter>;
const formatted = (value: number) => new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const forbidden = /暂无数据|数据缺失|数据不足|未采集|模拟数据|演示数据|数据异常|demo|null|undefined|NaN|Infinity/;
function chooseProduct(product: string) {
  fireEvent.click(screen.getByRole('combobox', { name: '商品' }));
  fireEvent.click(screen.getByRole('option', { name: product }));
}

describe('完整真实行情主页', () => {
  it('后台请求尚未返回也立即展示八张完整行情，价格两位、单位与数据相邻', () => {
    const { container } = render(page());
    const market = displayMarketFor(INITIAL_DISPLAY_MARKET, null, 'wholesale');
    expect(container.textContent).not.toMatch(forbidden);
    expect(screen.getByRole('heading', { name: '价格概览' })).toBeTruthy();
    expect(container.querySelectorAll('.market-overview__price')).toHaveLength(8);
    expect(container.querySelector('.market-overview__value')?.textContent).toBe(`${formatted(market.rows[0].price)}元/kg`);
    expect(container.querySelector('select')).toBeNull();
    expect(container.querySelector('.liaoning-page__city .choice-buttons')).toBeNull();
    expect(screen.getByRole('combobox', { name: '商品' })).toBeTruthy();
    expect(screen.getByText('辽宁')).toBeTruthy();
    expect(container.querySelector('.market-overview__price time')?.getAttribute('dateTime')).toBe(market.rows[0].observation_date);
    expect(container.textContent).not.toMatch(/情景参考价|六城参考均值|参考日期|尚未接入/);
    expect(screen.getByRole('link', { name: '决策' }).getAttribute('href')).toBe('/decision');
    expect(screen.getByRole('link', { name: '报告' }).getAttribute('href')).toBe('/reports');
  });
  it('保留右纸唯一入口与全部统计，左纸商品筛选不改变右纸八商品摘要', () => {
    const { container } = render(page());
    const summary = container.querySelector('.city-summary')!;
    expect(summary.firstElementChild).toBe(screen.getByRole('navigation', { name: '城市工作空间' }));
    expect(within(summary as HTMLElement).getAllByRole('link')).toHaveLength(2);
    expect(summary.querySelectorAll('dt')).toHaveLength(5);
    const originalSummary = summary.textContent;
    chooseProduct('土豆');
    expect(container.querySelectorAll('.market-overview__price')).toHaveLength(1);
    expect(container.querySelector('.market-overview__price h3')?.textContent).toBe('土豆');
    expect(summary.textContent).toBe(originalSummary);
    chooseProduct('全部商品');
    expect(container.querySelectorAll('.market-overview__price')).toHaveLength(8);
  });
  it('六城×三类型×八商品完整，切换保持双纸DOM、当前类型及单品筛选', () => {
    const { container } = render(page());
    const papers = [...container.querySelectorAll('.liaoning-paper')];
    for (const city of STUDY_CITY_IDS) {
      fireEvent.click(screen.getByRole('button', { name: getCity(city)!.shortName }));
      expect(screen.getByTestId('url').textContent).toBe(`/liaoning?city=${city}`);
      for (const level of DISPLAY_PRICE_LEVELS) {
        fireEvent.click(screen.getByRole('button', { name: PRICE_LEVEL_BUTTON[level] }));
        expect(screen.getByRole('button', { name: PRICE_LEVEL_BUTTON[level] }).getAttribute('aria-pressed')).toBe('true');
        const expected = displayMarketFor(INITIAL_DISPLAY_MARKET, city, level);
        const cards = [...container.querySelectorAll('.market-overview__price')];
        expect(cards).toHaveLength(8);
        cards.forEach((card, index) => {
          expect(card.querySelector('h3')?.textContent).toBe(expected.rows[index].product);
          expect(card.querySelector('strong')?.textContent).toBe(formatted(expected.rows[index].price));
          expect(card.querySelector('time')?.getAttribute('dateTime')).toBe(expected.rows[index].observation_date);
          expect(card.textContent).toContain(PRICE_LEVEL_LABEL[level]);
          expect(card.textContent).not.toMatch(forbidden);
        });
        expect([...container.querySelectorAll('.liaoning-paper')]).toEqual(papers);
      }
      const actions = within(screen.getByRole('navigation', { name: '城市工作空间' }));
      expect(actions.getByRole('link', { name: '决策' }).getAttribute('href')).toContain(`/cities/${city}/decision?city=${city}`);
      expect(actions.getByRole('link', { name: '报告' }).getAttribute('href')).toContain(`/reports/${city}?city=${city}`);
    }
    chooseProduct('土豆');
    fireEvent.click(screen.getByRole('button', { name: '沈阳' }));
    expect(container.querySelectorAll('.market-overview__price')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '集市' }).getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('strong')?.textContent).toBe(formatted(displayMarketFor(INITIAL_DISPLAY_MARKET, 'shenyang', 'retail_market').rows[4].price));
  });
  it('连续20次城市/商品/类型操作不重挂纸面，也不重置长期趋势', () => {
    const { container } = render(page());
    const papers = [...container.querySelectorAll('.liaoning-paper')];
    fireEvent.click(screen.getByRole('button', { name: '长期趋势' }));
    for (let index = 0; index < 20; index += 1) {
      const city = STUDY_CITY_IDS[index % STUDY_CITY_IDS.length];
      const level = DISPLAY_PRICE_LEVELS[index % DISPLAY_PRICE_LEVELS.length];
      fireEvent.click(screen.getByRole('button', { name: getCity(city)!.shortName }));
      fireEvent.click(screen.getByRole('button', { name: PRICE_LEVEL_BUTTON[level] }));
      chooseProduct(index % 2 === 0 ? '土豆' : '全部商品');
      expect([...container.querySelectorAll('.liaoning-paper')]).toEqual(papers);
      expect(screen.getByRole('button', { name: '长期趋势' }).getAttribute('aria-pressed')).toBe('true');
      expect(screen.getAllByRole('img')).toHaveLength(index % 2 === 0 ? 1 : 8);
      expect(container.textContent).not.toMatch(forbidden);
    }
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('url').textContent).toBe('/liaoning');
    expect([...container.querySelectorAll('.liaoning-paper')]).toEqual(papers);
    expect(screen.getByRole('button', { name: '长期趋势' }).getAttribute('aria-pressed')).toBe('true');
  });
  it('未知城市使用省级完整行情，Esc不会创建其它城市入口', () => {
    const { container } = render(page('/liaoning?city=anshan'));
    expect(within(screen.getByRole('navigation', { name: '地图城市选择' })).getAllByRole('button').filter(button => button.getAttribute('aria-pressed') === 'true')).toHaveLength(0);
    expect(container.querySelector('strong')?.textContent).toBe(formatted(displayMarketFor(INITIAL_DISPLAY_MARKET, null, 'wholesale').rows[0].price));
    fireEvent.click(screen.getByRole('button', { name: '丹东' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('url').textContent).toBe('/liaoning');
  });
});

describe('真实日期价格趋势', () => {
  it('按真实历史日期间距定位，不生成前30天、7天、1天虚构锚点', () => {
    const row: DisplayMarketRecord = { ...INITIAL_DISPLAY_MARKET.records[0], history: [
      { date: '2026-09-01', price: 1 }, { date: '2026-09-03', price: 2 }, { date: '2026-09-10', price: 3 },
    ] };
    const points = marketTrendPoints(row);
    expect(points.map(point => point.date)).toEqual(['2026-09-01', '2026-09-03', '2026-09-10']);
    expect((points[1].x - points[0].x) / (points[2].x - points[1].x)).toBeCloseTo(2 / 7);
    expect(points[0].x).toBe(32);
    expect(points[2].x).toBe(304);
    expect(marketTrendPoints({ ...row, history: [row.history[0]] })[0].x).toBe(168);
  });
});
