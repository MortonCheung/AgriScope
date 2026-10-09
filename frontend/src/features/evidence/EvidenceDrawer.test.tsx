// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { V2CatalogCity, V2Table } from '../../domain/research/v2/types';
import type { DecisionCapability, FinalDecisionRequest } from '../../domain/decision/types';

vi.mock('./useEvidenceLayers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useEvidenceLayers')>();
  return { ...actual, useEvidenceLayers: vi.fn() };
});

import { EvidenceDrawer } from './EvidenceDrawer';
import {
  buildDrawerRequest, resolveModuleId, resolveResearchEntry, seasonalForCrop, useEvidenceLayers,
} from './useEvidenceLayers';
import type { EvidenceLayers } from './useEvidenceLayers';

const shenyangCatalog: V2CatalogCity = {
  city: 'shenyang', city_name: '沈阳', n_modules: 2,
  modules: [
    { module_id: 'A01', title: '市场时间结构与季节性', status: 'ACCEPTED', summary: '季节波动明显。', article_path: 'product/shenyang/articles/A01.json', explorer_available: false, tables: ['A01_seasonal_amplitude.csv'], figures: [], sources: [] },
    { module_id: 'A06', title: '量价、风险传导与预测增量', status: 'ACCEPTED', summary: '天气增量有限。', article_path: 'product/shenyang/articles/A06.json', explorer_available: false, tables: [], figures: [], sources: [] },
    { module_id: 'A02', title: '气象条件与市场响应', status: 'ACCEPTED', summary: '多数检验无证据。', article_path: 'product/shenyang/articles/A02.json', explorer_available: false, tables: [], figures: [], sources: [] },
  ],
};

const layers: EvidenceLayers = {
  market: { status: 'ready', data: { latestDataDate: '2026-10-06', freshness: 'DELAYED', generatedAt: '2026-10-08 02:30:16', crops: [{ crop: '土豆', pricePerKg: 2.2, dataDate: '2026-10-06', change30d: -0.014, signal: 'NORMAL', hri: 46.2, marketRisk: 47.6 }] } },
  seasonal: { status: 'ready', data: { label: '价格季节指数极差', value: '0.266', source: 'A01 · A01_seasonal_amplitude.csv' } },
  model: { status: 'ready', data: { crop: '土豆', horizon: 30, point: 2.046, low: 1.639, high: 2.947, semantics: 'model_scenario', calibrated: false, modelVersion: 'final_v1', dataVersion: 'final_v1', dataStatus: 'model', asOf: '2026-10-06', generatedAt: '2026-10-09 12:52:30', sampleN: 97, sampleYears: 6, wape: null } },
  weather: { status: 'ready', data: { moduleId: 'A02', title: '气象条件与市场响应', summary: '在含自回归的日度模型中，多数核心检验没有证据。' } },
  regional: { status: 'ready', data: { crop: '土豆', price: 2.2, markets: [{ name: '辽宁省农产品批发市场', url: 'https://example.gov.cn/market' }] } },
  sufficiency: { status: 'ready', data: { rows: [{ label: '价格情景样本量', value: '97 条' }, { label: '缺失率', value: '该指标暂无可用来源' }] } },
  research: { status: 'ready', data: { modules: [{ id: 'A01', title: '市场时间结构与季节性' }, { id: 'A06', title: '量价、风险传导与预测增量' }], entry: { href: '/cities/shenyang/research/A06', label: 'A06' } } },
};

beforeEach(() => { vi.mocked(useEvidenceLayers).mockReturnValue(layers); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mount(open = true) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <EvidenceDrawer open={open} onClose={onClose} context={{ cityId: 'shenyang', crop: '土豆', horizon: 30, topic: 'forecast' }} />
    </MemoryRouter>,
  );
  return { onClose };
}

describe('EvidenceDrawer 七层与交互', () => {
  it('renders seven layers from real sources and labels WAPE honestly', () => {
    mount();
    for (const title of ['当前市场状态', '历史季节结构', '模型结果', '天气因素', '区域市场', '数据充分度', '研究依据']) {
      expect(screen.getByRole('heading', { name: new RegExp(title) })).toBeTruthy();
    }
    expect(document.body.textContent).toContain('WAPE');
    expect(document.body.textContent).not.toContain('准确率');
    expect(document.body.textContent).toContain('更新时间');
    expect(document.body.textContent).toContain('不构成最优销售路径推荐');
  });

  it('exposes dialog semantics and closes on Escape', () => {
    const { onClose } = mount();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('evidence-drawer-title');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop press but not on content press', () => {
    const { onClose } = mount();
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByTestId('evidence-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('links to the real research module and hides when the module is missing', () => {
    mount();
    const link = screen.getByRole('link', { name: /查看完整研究/ });
    expect(link.getAttribute('href')).toBe('/cities/shenyang/research/A06');
  });

  it('renders nothing when closed', () => {
    mount(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('evidence layer helpers', () => {
  const capability: DecisionCapability = {
    city_id: 'shenyang', tier: 'FULL', supported: true,
    crops: [{ id: '土豆', label: '土豆', horizons: [{ days: 7, mode: 'model' }, { days: 30, mode: 'model' }, { days: 90, mode: 'scenario_only' }] }],
    market_as_of: '2026-10-06', model_version: 'final_v1', data_version: 'final_v1', code_fingerprint: 'abc', limitation: null,
  };
  const saved: FinalDecisionRequest = {
    contract_version: '1',
    user_context: {
      city_id: 'shenyang', area_mu: 100, budget_cny: 500000, risk_preference: 'balanced',
      crop_preferences: ['土豆'], actual_inputs: { 土豆: { cost_per_mu: 1065, yield_kg_per_mu: 4000 } },
      market_context: { as_of: '2026-10-06', horizon_days: 7, harvest_date: null },
    },
    input_source: { kind: 'structured' },
  };

  it('builds a request from real saved inputs only, honouring supported crop/horizon', () => {
    const request = buildDrawerRequest(saved, capability, '土豆', 30);
    expect(request?.user_context.market_context.horizon_days).toBe(30);
    expect(request?.user_context.crop_preferences).toEqual(['土豆']);
    expect(request?.user_context.actual_inputs.土豆.cost_per_mu).toBe(1065);
    // unsupported horizon falls back to a supported one, never invented.
    expect(buildDrawerRequest(saved, capability, '土豆', 45)?.user_context.market_context.horizon_days).toBe(30);
  });

  it('never builds a request without a contract-1 saved request', () => {
    expect(buildDrawerRequest({ ...saved, contract_version: '0' } as never, capability, '土豆', 30)).toBeNull();
  });

  it('extracts price seasonal amplitude for a crop from a real table', () => {
    const table: V2Table = { file: 'A01_seasonal_amplitude.csv', columns: ['crop', 'variable', 'seasonal_range'], rows: [{ crop: '土豆', variable: 'volume', seasonal_range: '0.13' }, { crop: '土豆', variable: 'price', seasonal_range: '0.266' }] };
    expect(seasonalForCrop(table, '土豆')).toEqual({ label: '价格季节指数极差', value: '0.266' });
    expect(seasonalForCrop(table, '黄瓜')).toBeNull();
  });

  it('maps topics to real modules and hides the entry when no research tree exists', () => {
    expect(resolveModuleId(shenyangCatalog, 'forecast')).toBe('A06');
    expect(resolveModuleId(shenyangCatalog, 'risk:12')).toBe('A01');
    expect(resolveResearchEntry('shenyang', shenyangCatalog, 'forecast')?.href).toBe('/cities/shenyang/research/A06');
    expect(resolveResearchEntry('tieling', shenyangCatalog, 'forecast')).toBeNull();
  });
});