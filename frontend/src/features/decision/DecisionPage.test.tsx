// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { DecisionPage } from './DecisionPage';
import { DECISION_FEATURE_IDS, type DecisionCapability, type DecisionFeature } from '../../domain/decision/types';
import { STUDY_CITY_IDS } from '../../domain/geography/cities';
import { getDecisionProvider } from '../../providers/decision';
import { getMarketProvider } from '../../providers/market';
import { resetAppContext } from '../../app/context/appContext';
vi.mock('../../providers/decision', () => ({ getDecisionProvider: vi.fn() }));
vi.mock('../../providers/market', () => ({ getMarketProvider: vi.fn() }));
vi.mock('../../domain/observations/useObservations', () => ({ useObservations: () => ({ status: 'error', error: '观测连接失败。' }) }));
vi.mock('../evidence/EvidenceDrawer', () => ({ EvidenceDrawer: () => null }));
const decide = vi.fn(); const capabilities = vi.fn(); const observations = vi.fn();
function cap(cityId: string): DecisionCapability {
  const short = ['shenyang', 'chaoyang'].includes(cityId); const long = cityId === 'shenyang';
  return { city_id: cityId, tier: short ? 'READY' : 'INSUFFICIENT', supported: short, crops: short ? [{ id: '土豆', label: '土豆', horizons: [7, 14, 30].map(days => ({ days, mode: 'model' as const })) }] : [], market_as_of: short ? '2026-09-21' : null, model_version: 'v', data_version: 'd', code_fingerprint: 'f', limitation: null,
    features: Object.fromEntries(DECISION_FEATURE_IDS.map(id => {
      const supported = id === 'short_term_price' ? short : id === 'long_horizon_scenario' ? long : true;
      return [id, { supported, result_type: !supported ? 'NOT_SUPPORTED' : id === 'break_even' ? 'DETERMINISTIC_CALCULATION' : id === 'user_scenario' ? 'USER_ASSUMPTION_SCENARIO' : id === 'short_term_price' ? 'VERIFIED_MODEL' : id === 'long_horizon_scenario' ? 'EXPLORATORY_REFERENCE' : 'OBSERVATIONAL_ANALYSIS', data_sources: [], required_inputs: [], limitations: [], validated_model: id === 'short_term_price' && supported, horizons: id === 'short_term_price' && supported ? [7, 14, 30] : [], crop_ids: supported && (id === 'short_term_price' || id === 'long_horizon_scenario') ? ['土豆'] : [] } satisfies DecisionFeature];
    })) as unknown as DecisionCapability['features'] };
}
function Probe() { const location = useLocation(); return <output aria-label="当前路由">{location.pathname}{location.search}</output>; }
function renderAt(city: string, query = '') { return render(<MemoryRouter initialEntries={[`/cities/${city}/decision${query}`]}><Probe /><Routes><Route path="/cities/:cityId/decision" element={<DecisionPage />} /></Routes></MemoryRouter>); }
beforeEach(() => {
  sessionStorage.clear(); resetAppContext(); decide.mockReset(); capabilities.mockReset(); observations.mockReset();
  capabilities.mockImplementation(async (cityId: string) => cap(cityId));
  observations.mockImplementation(async (cityId: string) => ({ cityId, cityName: cityId, unit: '元/kg', available: ['shenyang', 'chaoyang', 'jinzhou'].includes(cityId), selectedCrop: ['shenyang', 'chaoyang', 'jinzhou'].includes(cityId) ? '土豆' : null, snapshotVersion: 'v', crops: ['shenyang', 'chaoyang', 'jinzhou'].includes(cityId) ? ['土豆'] : [], series: ['shenyang', 'chaoyang', 'jinzhou'].includes(cityId) ? [{ id: cityId, crop: '土豆', productName: '土豆', marketName: `${cityId}正式市场`, priceLevel: 'market_average', source: { name: '本城正式来源', url: null }, observations: [{ date: '2025-07-14', pricePerKg: 2 }], notes: [] }] : [] }));
  vi.mocked(getDecisionProvider).mockReturnValue({ data_mode: 'api', capabilities, decide });
  vi.mocked(getMarketProvider).mockReturnValue({ observations });
});
afterEach(cleanup);

describe('四模块固定与六城能力门禁', () => {
  it.each(STUDY_CITY_IDS)('keeps four modules in %s and permits real user planning without a price model', async cityId => {
    const { container } = renderAt(cityId);
    const menu = within(screen.getByRole('list', { name: '决策工具' }));
    expect(menu.getAllByRole('button').map(button => button.textContent)).toEqual(['经营计划', '市场观察', '短期市场比较', '上市窗口情景']);
    await waitFor(() => expect(capabilities).toHaveBeenCalled());
    await waitFor(() => expect(menu.getByRole('button', { name: '市场观察' }).hasAttribute('disabled')).toBe(!['shenyang', 'chaoyang', 'jinzhou'].includes(cityId)));
    expect(menu.getByRole('button', { name: '经营计划' }).hasAttribute('disabled')).toBe(false);
    expect(menu.getByRole('button', { name: '短期市场比较' }).hasAttribute('disabled')).toBe(!['shenyang', 'chaoyang'].includes(cityId));
    expect(menu.getByRole('button', { name: '上市窗口情景' }).hasAttribute('disabled')).toBe(cityId !== 'shenyang');
    fireEvent.change(screen.getByLabelText('计划作物'), { target: { value: '__custom__' } });
    fireEvent.change(screen.getByLabelText('作物名称'), { target: { value: '土豆' } });
    for (const [label, value] of [[/^种植面积/, '1'], [/^预计亩产/, '100'], [/^每亩总成本/, '50'], [/^假设销售价格/, '1'], [/^可销售比例/, '100']] as const) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: '核算我的计划' }));
    expect(within(screen.getByRole('region', { name: '经营核算结果' })).getByText('利润').nextElementSibling?.textContent).toBe('50 元');
    expect(container.querySelectorAll('.workbench__body > aside, .workbench__body > section')).toHaveLength(3);
    expect(decide).not.toHaveBeenCalled();
  });
  it('keeps the paper and sidebar while switching to real Jinzhou market data without model requests', async () => {
    const { container } = renderAt('jinzhou');
    const paper = container.querySelector('.workbench__paper'); const sidebar = container.querySelector('.workbench__sidebar');
    const menu = within(screen.getByRole('list', { name: '决策工具' }));
    await waitFor(() => expect(menu.getByRole('button', { name: '市场观察' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(menu.getByRole('button', { name: '市场观察' }));
    expect(screen.getByText('2 元/kg')).toBeTruthy();
    expect(container.querySelector('.workbench__paper')).toBe(paper); expect(container.querySelector('.workbench__sidebar')).toBe(sidebar);
    expect(decide).not.toHaveBeenCalled();
    fireEvent.click(menu.getByRole('button', { name: '经营计划' }));
    expect(container.querySelector('.workbench__paper')).toBe(paper);
  });
  it('replaces an unsupported model deep link with executable planning while preserving the city context', async () => {
    renderAt('jinzhou', '?city=jinzhou&crop=土豆&horizon=14&as_of=2025-07-14&view=input');
    await waitFor(() => expect(screen.getByLabelText('当前路由').textContent).toContain('view=planning'));
    expect(screen.getByLabelText('当前路由').textContent).toContain('city=jinzhou&crop=%E5%9C%9F%E8%B1%86&horizon=14&as_of=2025-07-14');
    expect(screen.getByRole('button', { name: '核算我的计划' })).toBeTruthy();
    expect(decide).not.toHaveBeenCalled();
  });
});
