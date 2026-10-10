// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DecisionCenter } from './DecisionCenter';
import { getDecisionProvider } from '../../providers/decision';
import { getDailyProvider } from '../../providers/daily';
import { getLongHorizonProvider, getLongHorizonDecisionProvider } from '../../providers/longHorizon';
import { DECISION_FEATURE_IDS } from '../../domain/decision/types';

vi.mock('../../providers/decision', () => ({ getDecisionProvider: vi.fn() }));
vi.mock('../../providers/daily', () => ({ getDailyProvider: vi.fn() }));
vi.mock('../../providers/longHorizon', () => ({ getLongHorizonProvider: vi.fn(), getLongHorizonDecisionProvider: vi.fn() }));

const capability = (supported = true, cityId = 'shenyang') => ({
  city_id: cityId, tier: 'FULL', supported, crops: supported ? [{ id: '黄瓜', label: '黄瓜', horizons: [{ days: 7, mode: 'model' }] }] : [],
  market_as_of: supported ? '2026-10-06' : null, model_version: 'final_v1', data_version: 'final_v1', code_fingerprint: 'abc', limitation: null,
  features: Object.fromEntries(DECISION_FEATURE_IDS.map(key => [key, {
    supported: key === 'short_term_price' ? supported : key === 'long_horizon_scenario' ? supported && cityId === 'shenyang' : true,
    result_type: key === 'long_horizon_scenario' ? cityId === 'shenyang' && supported ? 'EXPLORATORY_REFERENCE' : 'NOT_SUPPORTED' : 'OBSERVATIONAL_ANALYSIS',
    data_sources: [], required_inputs: [], validated_model: key === 'short_term_price', limitations: [],
    horizons: key === 'short_term_price' ? [7,14,30] : key === 'long_horizon_scenario' ? [30,60,90,120,150,180] : [],
    crop_ids: ['黄瓜'],
  }])),
});
const daily = () => ({
  cityId: 'shenyang', city: '沈阳', status: 'partial', runDate: '2026-10-08', latestDataDate: '2026-10-06', freshness: 'DELAYED', sourceFreshness: 'DELAYED', ageDays: 2,
  crops: [{ crop: '黄瓜', dataDate: '2026-10-06', pricePerKg: 3.8, changePreviousObservation: -0.05, change7d: -0.088, change30d: -0.088, historicalPercentile: 0.4676, hri: 42, marketRisk: 50.7, signal: 'NORMAL', confidence: 69.9, warnings: [], sourceId: 's1', freshness: 'DELAYED', sourceFreshness: 'DELAYED', modelStatus: 'FINAL', finalStatus: 'USER_INPUT_REQUIRED' }],
  sources: [{ id: 's1', name: '来源', url: 'https://example.org', priceLevel: 'wholesale' }],
  sourceMeta: { schemaVersion: '1.1.0', pipelineVersion: '1.1.0', dataVersion: 'd', modelVersion: 'final_v1', modelStatus: 'FINAL', generatedAt: '2026-10-08', snapshotHash: 'abc12345', finalCodeFingerprint: 'f' },
});
const shortResult = (horizon: number) => {
  const spread = horizon === 30 ? 6.5 : horizon === 14 ? 6.15 : 6.48;
  return { candidates: [{ crop: '黄瓜', price: { base: 3.8 + spread / 4, low: 3.8 - spread / 4, high: 3.8 + spread, is_calibrated_interval: false }, risks: { hri: 42, market_risk: 50.7, climate_exposure: 41.7 }, confidence: { score: 69.9 }, market_context: { range_status: 'scenario_range_widened' } }] };
};
const forecast = (horizon: number) => ({ crop: '黄瓜', horizon, pointForecast: 5, rangeLow: 4, rangeHigh: 8, productionStatus: horizon >= 150 ? 'EXPLORATORY_SCENARIO_ONLY' : 'SCENARIO_ONLY', confidence: 'low', rangeType: 'scenario_range' });
const longCompare = () => ({ candidates: [{ crop: '黄瓜', production_status: 'SCENARIO_ONLY', price: { base: 5.163 }, current_market_context: { current_price: 3.8 }, harvest_relative_to_current: 0.36 }] });

function primeProviders(supported = true) {
  const decide = vi.fn(async (request: { user_context: { market_context: { horizon_days: number } } }) => shortResult(request.user_context.market_context.horizon_days));
  vi.mocked(getDecisionProvider).mockReturnValue({ data_mode: 'api', decide, capabilities: async (cityId: string) => capability(supported, cityId) } as never);
  vi.mocked(getDailyProvider).mockReturnValue({ latest: async () => daily() } as never);
  vi.mocked(getLongHorizonProvider).mockReturnValue({ forecast: async (input: { horizonDays: number }) => forecast(input.horizonDays) } as never);
  vi.mocked(getLongHorizonDecisionProvider).mockReturnValue({ decision: async () => longCompare() } as never);
  return decide;
}

beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('matchMedia', () => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderCenter = (cityId = 'shenyang') => render(<MemoryRouter initialEntries={[`/cities/${cityId}/decision`]}><DecisionCenter cityId={cityId} savedRequest={null} onAdjustConditions={() => {}}/></MemoryRouter>);
const hasText = (fragment: string) => (content: string) => content.includes(fragment);

describe('decision center view', () => {
  it('renders a rule-assembled judgment sentence from real fields', async () => {
    primeProviders();
    renderCenter();
    const sentence = await screen.findByText(hasText('沈阳 · 黄瓜'));
    expect(sentence.textContent).toContain('近 6 年中枢');
    expect(sentence.textContent).toContain('市场风险中等');
    expect(sentence.textContent).toMatch(/中心值 \d/);
    expect(screen.getByLabelText(/沈阳黄瓜历史价格与7天预测/)).toBeTruthy();
  });

  it('switches 7/14/30 in place without removing the chart and re-requests each horizon', async () => {
    const decide = primeProviders();
    renderCenter();
    await screen.findByText(hasText('沈阳 · 黄瓜'));
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(3)); // 7/14/30 prefetched
    const before = document.querySelector('.decision');
    fireEvent.click(screen.getByRole('button', { name: '14 天' }));
    await waitFor(() => expect(screen.getByLabelText(/14天预测/)).toBeTruthy());
    expect(document.querySelector('.decision')).toBe(before); // same subtree → no page reload
    expect(screen.getByLabelText(/沈阳黄瓜历史价格与14天预测/)).toBeTruthy();
  });

  it('shows the long-horizon partition copy and degrades 150/180 certainty', async () => {
    primeProviders();
    renderCenter();
    await screen.findByText(hasText('沈阳 · 黄瓜'));
    expect(screen.getByText('用于种植与上市周期参考，不等同于短期生产预测。')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('短期预测 ──── 7 / 14 / 30')).toBeTruthy());
    expect(screen.getByText('长期场景 ──── 30 / 60 / 90 / 120 / 150 / 180')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText(hasText('探索性结果')).length).toBeGreaterThan(0));
    expect(screen.getAllByText(hasText('探索性结果：未通过独立生产门禁')).length).toBeGreaterThan(0);
  });

  it('expands a risk bar to reveal its real source and research link', async () => {
    primeProviders();
    renderCenter();
    await screen.findByText(hasText('沈阳 · 黄瓜'));
    fireEvent.click(screen.getByRole('button', { name: /市场波动/ }));
    const link = await screen.findByRole('link', { name: '研究依据：作物 × 价格波动 →' });
    expect(link.getAttribute('href')).toBe('/cities/shenyang/research/A1.7');
    expect(screen.getByText('market_risk')).toBeTruthy();
  });

  it('compares crops with only the allowed labels and never a score', async () => {
    primeProviders();
    renderCenter();
    await screen.findByText(hasText('沈阳 · 黄瓜'));
    const table = await screen.findByLabelText('作物比较');
    expect(table.textContent).toMatch(/更值得关注|可关注|谨慎|暂无明显优势|数据不足/);
    expect(table.textContent).not.toMatch(/分\b|\d{1,3}\s*分/);
  });

  it('keeps the main page when opening the why drawer', async () => {
    primeProviders();
    renderCenter();
    const sentence = await screen.findByText(hasText('沈阳 · 黄瓜'));
    fireEvent.click(screen.getAllByRole('button', { name: '为什么？' })[0]);
    expect(sentence).toBeTruthy(); // 主页面不离开
    expect(document.querySelector('.center-judgment')).toBeTruthy();
  });

  it('limits unsupported messaging to price references and preserves access to user-condition tools', async () => {
    primeProviders(false);
    renderCenter('dalian');
    expect(await screen.findByText('大连暂未提供短期价格参考')).toBeTruthy();
    expect(screen.getByText(/经营工具可按你填写的亩产/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '填写经营条件' })).toBeTruthy();
    expect(screen.queryByText(/决策数据待接入/)).toBeNull();
  });

  it('loads Chaoyang short prices without any long forecast, comparison or daily request', async () => {
    const decide = primeProviders();
    renderCenter('chaoyang');
    await screen.findByText(hasText('朝阳 · 黄瓜'));
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(3));
    expect(getLongHorizonProvider).not.toHaveBeenCalled();
    expect(getLongHorizonDecisionProvider).not.toHaveBeenCalled();
    expect(getDailyProvider).not.toHaveBeenCalled();
    expect(screen.queryByText('长期上市窗口的行情场景')).toBeNull();
    expect(screen.queryByLabelText('作物比较')).toBeNull();
  });

  it('hides an old-city result immediately while another city capability is pending', async () => {
    primeProviders();
    const rendered = renderCenter();
    await screen.findByText(hasText('沈阳 · 黄瓜'));
    vi.mocked(getDecisionProvider).mockReturnValue({ data_mode: 'api', decide: vi.fn(), capabilities: () => new Promise(() => {}) } as never);
    rendered.rerender(<MemoryRouter><DecisionCenter cityId="chaoyang" savedRequest={null} onAdjustConditions={() => {}}/></MemoryRouter>);
    expect(screen.queryByText(hasText('沈阳 · 黄瓜'))).toBeNull();
    expect(screen.getByText('读取朝阳的决策数据')).toBeTruthy();
    expect(screen.queryByText('长期上市窗口的行情场景')).toBeNull();
  });
});
