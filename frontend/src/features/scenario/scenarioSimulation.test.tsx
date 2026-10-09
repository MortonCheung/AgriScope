// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DailySnapshot } from '../../domain/daily/types';

vi.mock('./useScenarioSimulation', () => ({ useScenarioSimulation: vi.fn() }));
vi.mock('../daily/useDaily', () => ({ useDaily: vi.fn() }));

import { ScenarioSimulation } from './ScenarioSimulation';
import { useScenarioSimulation } from './useScenarioSimulation';
import { useDaily } from '../daily/useDaily';

const capability = {
  cityId: 'shenyang', supported: true, asOf: '2026-10-06', horizons: [30, 60], modelVersion: 'long_horizon_v2_rc2', dataVersion: 'abc', limitation: null,
  crops: [{ id: '土豆', label: '土豆', horizons: [
    { days: 30, method: 'elasticnet', confidence: 'low', rangeType: 'scenario_range' as const, productionStatus: 'SCENARIO_ONLY' as const, nNonoverlap: 0 },
    { days: 60, method: 'elasticnet', confidence: 'low', rangeType: 'scenario_range' as const, productionStatus: 'SCENARIO_ONLY' as const, nNonoverlap: 0 },
  ] }],
};

const daily: DailySnapshot = {
  cityId: 'shenyang', city: '沈阳', status: 'partial', runDate: '2026-10-08', latestDataDate: '2026-10-06',
  freshness: 'DELAYED', sourceFreshness: 'DELAYED', ageDays: 2,
  crops: [{ crop: '土豆', dataDate: '2026-10-06', pricePerKg: 2.2, changePreviousObservation: null, change7d: null, change30d: -0.014, historicalPercentile: 0.4, hri: 46.2, marketRisk: 47.6, signal: 'NORMAL', confidence: 62, warnings: [], sourceId: 'SRC', freshness: 'DELAYED', sourceFreshness: 'DELAYED', modelStatus: 'FINAL', finalStatus: null }],
  sources: [{ id: 'SRC', name: '辽宁省农产品批发市场', url: 'https://example.gov.cn', priceLevel: 'wholesale' }],
  sourceMeta: { schemaVersion: '1.1.0', pipelineVersion: '1.1.0', dataVersion: 'v', modelVersion: 'final_v1', modelStatus: 'FINAL', generatedAt: '2026-10-08 02:30:16', snapshotHash: null, finalCodeFingerprint: null },
};

beforeEach(() => {
  vi.mocked(useScenarioSimulation).mockReturnValue({
    capability: { status: 'ready', data: capability },
    crop: '土豆',
    cropCap: capability.crops[0],
    series: { status: 'ready', data: { crop: '土豆', points: [
      { horizon: 30, productionStatus: 'SCENARIO_ONLY', point: 2.4, low: 1.7, high: 2.5, rangeType: 'scenario_range', method: 'elasticnet', confidence: 'low', unit: 'CNY/kg' },
      { horizon: 60, productionStatus: 'SCENARIO_ONLY', point: 2.26, low: 1.76, high: 2.28, rangeType: 'scenario_range', method: 'elasticnet', confidence: 'low', unit: 'CNY/kg' },
    ], anchorDate: '2026-10-06', asOf: '2026-10-06', modelVersion: 'long_horizon_v2_rc2', dataVersion: 'abc' } },
  });
  vi.mocked(useDaily).mockReturnValue({ status: 'ready', data: daily });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mount() {
  return render(<MemoryRouter initialEntries={['/scenario-lab?city=shenyang']}><ScenarioSimulation /></MemoryRouter>);
}

describe('情景模拟：现实 / 模拟', () => {
  it('shows the persistent simulation banner and 现实数据 ≠ 用户假设', () => {
    mount();
    expect(screen.getByText('当前正在查看模拟情景')).toBeTruthy();
    expect(screen.getByText(/现实数据 ≠ 用户假设/)).toBeTruthy();
  });

  it('renders both worlds with real observed and model-scenario readings', () => {
    mount();
    expect(screen.getByText(/现实世界 · 已发布观测/)).toBeTruthy();
    expect(screen.getByText(/模拟世界 · 模型情景/)).toBeTruthy();
    expect(screen.getAllByText(/2.4 元\/kg/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2.2 元\/kg/).length).toBeGreaterThan(0);
  });

  it('distinguishes reality and simulation lines with a legend and aria summary', () => {
    mount();
    expect(screen.getByText(/现实线 · 已发布观测价格/)).toBeTruthy();
    expect(screen.getByText(/模拟线 · 模型情景点估计/)).toBeTruthy();
    const chart = screen.getByRole('img', { name: /现实线/ });
    expect(chart.getAttribute('aria-label')).toContain('模拟线');
  });

  it('marks profit stress variables as USER_INPUT_REQUIRED and never fabricates a recommendation', () => {
    mount();
    expect(screen.getByText('USER_INPUT_REQUIRED')).toBeTruthy();
    const text = document.body.textContent ?? '';
    for (const forbidden of ['建议卖到', '收益最高', '最佳销售', '卖到大连']) expect(text).not.toContain(forbidden);
  });
});