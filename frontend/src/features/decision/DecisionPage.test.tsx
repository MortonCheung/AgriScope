// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { DecisionPage } from './DecisionPage';
import { STUDY_CITY_IDS, getCity } from '../../domain/geography/cities';
import { resetAppContext } from '../../app/context/appContext';
vi.mock('../../domain/observations/useObservations', () => ({ useObservations: () => ({ status: 'error', error: '观测连接失败。' }) }));
vi.mock('./useMarketObservation', () => ({ useMarketObservation: () => ({ status: 'error', error: '观测连接失败。', retry: vi.fn() }) }));
function Probe() { const location = useLocation(); return <output aria-label="当前路由">{location.pathname}{location.search}</output>; }
function renderAt(city: string, query = '') { return render(<MemoryRouter initialEntries={[`/cities/${city}/decision${query}`]}><Probe/><Routes><Route path="/cities/:cityId/decision" element={<DecisionPage/>}/><Route path="/liaoning" element={<h1>首页</h1>}/></Routes></MemoryRouter>); }
beforeEach(() => {
  sessionStorage.clear(); resetAppContext();
  vi.stubGlobal('matchMedia', () => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function choose(name: string) { fireEvent.click(within(screen.getByRole('group', { name: '作物' })).getByRole('button', { name })); }
function fill() { choose('玉米'); for (const [label, value] of [[/^种植面积/, '1'], [/^预计亩产/, '100'], [/^每亩总成本/, '50'], [/^假设销售价格/, '1'], [/^可销售比例/, '100']] as const) fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
const profit = () => within(screen.getByRole('region', { name: '农业决策结果' })).getByText('预计收益').nextElementSibling?.textContent;
describe('one live decision workspace across six cities', () => {
  it.each(STUDY_CITY_IDS)('keeps the same inputs, result and city choices in %s', city => {
    const { container } = renderAt(city);
    const links = within(screen.getByRole('navigation', { name: '决策城市' })).getAllByRole('link');
    expect(links.map(link => link.textContent)).toEqual(STUDY_CITY_IDS.map(id => getCity(id)?.shortName));
    expect(links.find(link => link.getAttribute('aria-current') === 'page')?.textContent).toBe(getCity(city)?.shortName);
    expect(screen.getByRole('heading', { name: '农业决策' })).toBeTruthy(); fill(); expect(profit()).toBe('50 元');
    expect(container.querySelectorAll('.workbench__body > aside, .workbench__body > section')).toHaveLength(3);
    expect(container.querySelector('details, [role="tab"], [type="submit"]')).toBeNull();
    expect(container.textContent).not.toMatch(/模型能力|尚未发布|模拟数据|经营计划|短期市场比较|上市窗口情景/);
  });
  it('switches cities without rebuilding the paper and restores independent saved crop drafts', async () => {
    const { container } = renderAt('jinzhou'); fill();
    const paper = container.querySelector('.workbench__paper');
    fireEvent.click(within(screen.getByRole('navigation', { name: '决策城市' })).getByRole('link', { name: '大连' }));
    await waitFor(() => expect(screen.getByLabelText('当前路由').textContent).toContain('/cities/dalian/decision'));
    expect(container.querySelector('.workbench__paper')).toBe(paper);
    expect((screen.getByLabelText(/^种植面积/) as HTMLInputElement).value).toBe('');
    choose('大豆'); fireEvent.change(screen.getByLabelText(/^种植面积/), { target: { value: '8' } });
    fireEvent.click(within(screen.getByRole('navigation', { name: '决策城市' })).getByRole('link', { name: '锦州' }));
    await waitFor(() => expect(profit()).toBe('50 元'));
    expect(screen.getByRole('button', { name: '玉米', pressed: true })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('navigation', { name: '决策城市' })).getByRole('link', { name: '大连' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '大豆', pressed: true })).toBeTruthy());
    expect((screen.getByLabelText(/^种植面积/) as HTMLInputElement).value).toBe('8');
  });
  it('normalizes old module deep links while preserving explicit city and input context', async () => {
    renderAt('jinzhou', '?city=jinzhou&crop=玉米&horizon=14&as_of=2025-07-14&view=input&plan=legacy');
    await waitFor(() => expect(screen.getByLabelText('当前路由').textContent).not.toContain('view='));
    const params = new URLSearchParams(screen.getByLabelText('当前路由').textContent!.split('?')[1]);
    expect(params.get('city')).toBe('jinzhou'); expect(params.get('crop')).toBe('玉米'); expect(params.get('horizon')).toBe('14'); expect(params.get('as_of')).toBe('2025-07-14'); expect(params.has('plan')).toBe(false);
    expect(screen.getByRole('button', { name: '玉米', pressed: true })).toBeTruthy();
  });
  it('returns to the selected home city using Escape', async () => {
    renderAt('dandong'); fireEvent.keyDown(window, { key: 'Escape' });
    await screen.findByRole('heading', { name: '首页' });
    expect(screen.getByLabelText('当前路由').textContent).toBe('/liaoning?city=dandong');
  });
});
