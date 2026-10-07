// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adaptForecastCapability, adaptLongHorizonDecision, adaptLongHorizonEntry } from '../../domain/longHorizon/adapter';
import { LongHorizonPlanning } from './LongHorizonPlanning';
import { HttpLongHorizonProvider } from '../../providers/longHorizon';
import type { LongHorizonDecisionRequest } from '../../domain/longHorizon/types';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const freshness = () => ({ status: 'CURRENT', daily_latest_data_date: '2026-10-06', long_horizon_as_of: '2026-10-06', daily_delayed: true });
const target = (type = 'harvest_market_price', point = 2) => ({ crop: '土豆', horizon: 120, target_type: type,
  point_forecast: point, range_low: point * .8, range_high: point * 1.2, range_type: 'scenario_range',
  production_status: 'SCENARIO_ONLY', confidence: 'low', method: 'b_last_value', actual_method: 'b_last_value',
  unit: 'CNY/kg', available: true, fallback_used: false, anchor_observation_date: '2026-10-06', model_disagreement_pct: 10,
  target_window: { definition: type, start_offset: type === 'harvest_market_price' ? 114 : 1, end_offset_exclusive: type === 'harvest_market_price' ? 128 : 121 } });
const targets = () => ({ harvest_market_price: target(), cycle_market_average: target('cycle_market_average', 10) });
const capability = () => adaptForecastCapability({ city_id: 'shenyang', supported: true, as_of: '2026-10-06',
  horizons: [30,60,90,120,150,180], model_version: 'long_horizon_v2', data_version: 'runtime-test', limitation: null,
  freshness: freshness(), crops: [{ id: '土豆', label: '土豆', horizons: [30,60,90,120,150,180].map(days => ({ days,
    method: 'b_last_value', confidence: 'low', range_type: 'scenario_range', production_status: days >= 150 ? 'EXPLORATORY_SCENARIO_ONLY' : 'SCENARIO_ONLY', n_nonoverlap: 0 })) }] });
const response = (request: LongHorizonDecisionRequest) => ({ contract_version: '2', request, status: 'SCENARIO_ONLY',
  basis: 'harvest_market_price', market_as_of: '2026-10-06', horizon_days: 120, expected_harvest_date: '2027-02-03',
  candidates: [{ crop: '土豆', area_mu: request.user_context.area_mu, available: true, targets: targets(),
    price: { low: 1.6, base: 2, high: 2.4, unit: 'CNY/kg', basis: 'harvest_market_price' },
    profit: { available: false, low: null, base: null, high: null, basis: 'missing', scenario_only: true },
    budget_feasible: null, harvest_relative_to_current: 0,
    current_market_context: { as_of: '2026-10-06', current_price: 2, hri: null, market_risk: 30, semantics: 'current_market_environment_not_future_risk' },
    freshness: freshness(), warnings: ['缺少实际成本和亩产。'], actual_method: 'b_last_value', fallback_used: false,
    production_status: 'SCENARIO_ONLY', confidence: 'low' }],
  ranking_basis: 'harvest_relative_market_environment', ranking: [{ crop: '土豆', score: 0 }],
  recommendation: { crop: '土豆', strength: 'weak', reason: '仅情景' }, freshness: freshness(), llm_status: 'LLM_UNAVAILABLE',
  model_version: 'long_horizon_v2', data_version: 'runtime-test', warnings: ['风险描述当前市场环境。'] });
const request = (): LongHorizonDecisionRequest => ({ contract_version: '2', user_context: { city_id: 'shenyang',
  area_mu: 10, budget_cny: 30000, risk_preference: 'balanced', crop_preferences: ['土豆'], actual_inputs: {},
  market_context: { expected_harvest_horizon_days: 120 } }, input_source: { kind: 'structured' } });

function provider() {
  return { capabilities: vi.fn().mockResolvedValue(capability()), decision: vi.fn(async (r: LongHorizonDecisionRequest) => adaptLongHorizonDecision(response(r), r)) };
}

describe('v2 harvest boundary', () => {
  it('keeps dual targets distinct and exposes stale and actual fallback', () => {
    const raw = { ...target(), schema_version: 'lh_forecast_v2', as_of: '2026-10-06', notes: [], targets: targets(),
      freshness: { ...freshness(), status: 'LONG_HORIZON_STALE' },
      forecast: { source: 'scenario_only', actual_method: 'b_last_value', fallback_used: true, model_disagreement: 10 } };
    const entry = adaptLongHorizonEntry(raw);
    expect(entry.targets?.harvest_market_price.pointForecast).toBe(2);
    expect(entry.targets?.cycle_market_average.pointForecast).toBe(10);
    expect(entry.freshness?.status).toBe('LONG_HORIZON_STALE');
    expect(entry.actualMethod).toBe('b_last_value'); expect(entry.fallbackUsed).toBe(true);
    expect(() => adaptLongHorizonEntry({ ...raw, targets: undefined })).toThrow('格式不完整');
  });

  it('rejects a decision that substitutes cycle price for harvest', () => {
    const r = request(), raw = response(r); raw.candidates[0].price.base = 10;
    expect(() => adaptLongHorizonDecision(raw, r)).toThrow('格式不完整');
  });

  it('rejects fake profit for missing inputs and mismatched request echoes', () => {
    const r = request(), raw = response(r); raw.candidates[0].profit.base = 100 as unknown as null;
    expect(() => adaptLongHorizonDecision(raw, r)).toThrow('格式不完整');
    const raw2 = response(r); raw2.request = { ...r, user_context: { ...r.user_context, area_mu: 20 } };
    expect(() => adaptLongHorizonDecision(raw2, r)).toThrow('格式不完整');
  });

  it('posts to the independent decision endpoint without short-contract conversion', async () => {
    const r = request(); const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => response(r) });
    vi.stubGlobal('fetch', fetcher);
    try { await new HttpLongHorizonProvider().decision(r);
      expect(new URL(fetcher.mock.calls[0][0]).pathname).toBe('/api/decision/long-horizon');
      expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(r);
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('structured harvest flow', () => {
  it('requires an explicit user horizon and never auto-selects the longest registry entry', async () => {
    const p = provider(); render(<LongHorizonPlanning cityId="shenyang" provider={p}/>);
    await screen.findByRole('button', { name: '比较上市决策 →' });
    expect(screen.getByRole('combobox', { name: '预计上市跨度' })).toHaveValue('');
    fireEvent.change(screen.getByLabelText(/种植面积/), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/可用预算/), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: '比较上市决策 →' }));
    expect(screen.getByRole('alert')).toHaveTextContent('明确选择'); expect(p.decision).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('combobox', { name: '预计上市跨度' }), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: '比较上市决策 →' }));
    await screen.findByText('预计上市窗口价格');
    expect(p.decision.mock.calls[0][0].user_context.market_context.expected_harvest_horizon_days).toBe(120);
    expect(screen.getByText('整个周期市场均价')).toBeVisible();
    expect(screen.getByText(/真实 LLM 尚不可用/)).toBeVisible();
    expect(screen.getAllByText(/Daily 数据发布延迟/).length).toBeGreaterThan(0);
    expect(screen.getByText(/这不是利润排序/)).toBeVisible();
  });

  it('rejects unmatched dates without snapping or issuing a request', async () => {
    const p = provider(); render(<LongHorizonPlanning cityId="shenyang" provider={p}/>);
    await screen.findByRole('button', { name: '比较上市决策 →' });
    fireEvent.change(screen.getByLabelText(/种植面积/), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/可用预算/), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('预计上市日（可选）'), { target: { value: '2027-01-05' } });
    fireEvent.click(screen.getByRole('button', { name: '比较上市决策 →' }));
    expect(screen.getByRole('alert')).toHaveTextContent('不会自动改成附近日期'); expect(p.decision).not.toHaveBeenCalled();
  });

  it('keeps unsupported cities isolated', async () => {
    const p = provider(); render(<LongHorizonPlanning cityId="dalian" provider={p}/>);
    expect(screen.getByText('这个城市的上市决策待接入')).toBeVisible();
    await waitFor(() => expect(p.capabilities).not.toHaveBeenCalled());
  });
});
