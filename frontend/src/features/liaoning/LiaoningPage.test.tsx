// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { resetAppContext } from '../../app/context/appContext';
import { STUDY_CITY_IDS, getCity } from '../../domain/geography/cities';
import { demoMarketFor } from '../../domain/market/demoMarket';
import { LiaoningPage } from './LiaoningPage';
vi.mock('motion/react', () => ({ useReducedMotion: () => true }));
vi.mock('../spatial/SpatialShell', () => ({ useCitySelection: () => {
  const navigate = useNavigate(); return (city: string) => navigate(`/liaoning?city=${city}`);
} }));
vi.mock('../../app/pageNavigation', () => ({ usePageNavigate: () => useNavigate(), TransitionLink: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => <Link to={to} {...props}>{children}</Link> }));
beforeEach(resetAppContext);
afterEach(cleanup);
function Location() { const url = useLocation(); return <output data-testid="url">{url.pathname}{url.search}</output>; }
const page = (url = '/liaoning') => <MemoryRouter initialEntries={[url]}><LiaoningPage/><Location/></MemoryRouter>;

describe('Report 风格的模拟行情主页', () => {
  it('默认为全省六城等权模拟均价，四个品种只展示一次，单位与价格相邻', () => {
    const { container } = render(page());
    expect(screen.getByRole('button', { name: '全省' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('heading', { name: '辽宁全省' })).toBeTruthy();
    expect(screen.getAllByText('模拟数据').length).toBe(1);
    expect(screen.getByText('六城等权模拟均价 · 仅供演示')).toBeTruthy();
    expect(container.querySelectorAll('.market-overview__price')).toHaveLength(4);
    expect(container.querySelector('.market-overview__value dd')?.textContent).toBe('3.9元/kg');
    expect(container.querySelector('select')).toBeNull();
    expect(container.textContent).not.toMatch(/最新农业市场|全部品种与来源|已接入市场|尚未接入/);
    expect(screen.queryByRole('link', { name: '决策' })).toBeNull();
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
      expect(container.querySelectorAll('.market-overview__price')).toHaveLength(4);
    }
    fireEvent.click(screen.getByRole('button', { name: '全省' }));
    expect(screen.getByTestId('url').textContent).toBe('/liaoning');
    expect([...container.querySelectorAll('.liaoning-paper')]).toEqual(papers);
  });
  it('比较期实际重新计算相同样例的涨跌，切城不重置比较期', () => {
    const { container } = render(page('/liaoning?city=shenyang'));
    const change = () => container.querySelector('.market-overview__price dd[data-direction]')?.textContent;
    expect(change()).toBe('+1.6%');
    fireEvent.click(screen.getByRole('button', { name: '7 日前' }));
    expect(change()).toBe('+5.0%');
    fireEvent.click(screen.getByRole('button', { name: '30 日前' }));
    expect(change()).toBe('+11.8%');
    fireEvent.click(screen.getByRole('button', { name: '铁岭' }));
    expect(screen.getByRole('button', { name: '30 日前' }).getAttribute('aria-pressed')).toBe('true');
    expect(change()).toBe('+6.1%');
  });
  it('未知城市不建立选择，Escape 立即回全省且不创建别城入口', () => {
    render(page('/liaoning?city=anshan'));
    expect(screen.getByRole('button', { name: '全省' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '丹东' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('url').textContent).toBe('/liaoning');
  });
});
