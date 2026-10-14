import { describe, expect, it } from 'vitest';
import { DISPLAY_PRICE_LEVELS, DISPLAY_PRODUCTS, DISPLAY_REGIONS, displayMarketFor } from './displayMarket';
import { validateMarketPresentation, validateMarketSnapshot } from './marketPresentationSnapshot';
import published from './publishedPresentation.json';
import { makePresentationFixture } from '../../test/fixtures/marketPresentation';
import { makeMarketFixture } from '../../test/fixtures/marketDisplay';

describe('连续行情整包与正式观测的边界', () => {
  it('真实发布投影含七地区四价型八商品，保留全部真实元数据和长期历史', () => {
    const data = validateMarketPresentation(published);
    for (const region of DISPLAY_REGIONS) for (const level of DISPLAY_PRICE_LEVELS) {
      const view = displayMarketFor(data, region === 'liaoning' ? null : region, level);
      expect(view.rows.map(row => row.product)).toEqual(DISPLAY_PRODUCTS);
      expect(view.rows.every(row => row.region === region && row.price_level === level && row.price > 0)).toBe(true);
      expect(view.regionRows).toHaveLength(32); expect(view.missing).toEqual([]);
    }
    const computed = data.records.find(row => row.origin.kind === 'model_estimate')!;
    expect(computed.history).toHaveLength(1);
    const projected = displayMarketFor(data, computed.region, computed.price_level).rows.find(row => row.product === computed.product)!;
    expect(projected.observation_date).toBe(computed.observed_at);
    expect(projected.collectedAt).toBe(computed.collected_at);
    expect(projected.display_date).toBe(computed.display_date);
    const long = data.records.find(row => (row.trend_history?.length ?? 0) >= 100)!;
    expect(long.trend_history!.at(-1)!.date <= long.display_date).toBe(true);
    expect(JSON.stringify(published)).not.toMatch(/SYNTHETIC|example\.test|provenance|\/Users\/|outputs\//);
  });
  it.each([0, -1, NaN, Infinity, -Infinity, null, '3.5', true])('拒绝无效价格 %s，不回落到编造零值', price => {
    const data = makePresentationFixture(); Object.assign(data.records[0], { price });
    expect(() => validateMarketPresentation(data)).toThrow();
  });
  it.each(['empty','duplicate','wrong region','wrong level','wrong date','future date','history mismatch','history order','change','source','published','input hash','unknown origin','observed date','incomplete levels'])('拒绝无效包 %s，不能混合城市、价型、历史', fault => {
    const data = makePresentationFixture(), row = data.records[0];
    if (fault === 'empty') data.records = [];
    if (fault === 'duplicate') data.records[1] = structuredClone(row);
    if (fault === 'wrong region') Object.assign(row, { region: 'anshan' });
    if (fault === 'wrong level') row.price_level = 'market_average';
    if (fault === 'wrong date') row.display_date = '2025-02-30';
    if (fault === 'future date') row.display_date = '9999-01-01';
    if (fault === 'history mismatch') row.history[0].price += 1;
    if (fault === 'history order') row.history.unshift(row.history[0]);
    if (fault === 'change') row.change_percent = 2;
    if (fault === 'source') row.sources[0].url = 'https://user:pw@example.test/source';
    if (fault === 'published') data.published_at = '2025-02-30T01:00:00Z';
    if (fault === 'input hash') data.input_hash = 'x'.repeat(64);
    if (fault === 'unknown origin') Object.assign(row.origin, { kind: 'fake' });
    if (fault === 'observed date') row.observed_at = null;
    if (fault === 'incomplete levels') data.price_levels.pop();
    expect(() => validateMarketPresentation(data)).toThrow();
  });
  it('计算必须有真实模型/价格面证据，不能把计算日当成采集日或补造历史曲线', () => {
    const data = makePresentationFixture(), row = data.records[0];
    row.origin = { kind: 'model_estimate', history_kind: 'calculation', price_type_surface_id: 'b'.repeat(64) };
    row.observed_at = null; row.collected_at = null;
    expect(() => validateMarketPresentation(data)).toThrow();
    row.origin.model = { model_id: 'TEST-FROZEN-MODEL', target_type: 'window_mean', price_per_kg: row.price };
    expect(validateMarketPresentation(data)).toBe(data);
    row.history.unshift({ date: '2025-10-12', price: row.price });
    row.comparison_basis = 'previous_same_source_observation';
    expect(() => validateMarketPresentation(data)).toThrow();
  });
  it('长期曲线保持原城市商品价型与独立来源，不能拿另一个城市的历史补齐', () => {
    const data = makePresentationFixture(), row = data.records[0];
    row.trend_history = [{ date: '2025-10-11', price: 2 }, { date: '2025-10-12', price: 3 }];
    Object.assign(row.origin, { trend_history_kind: 'local_same_source_observations', trend_series_identity: [row.region, row.product, row.price_level, 'TEST'] });
    row.trend_sources = [row.sources[0]]; expect(validateMarketPresentation(data)).toBe(data);
    (row.origin.trend_series_identity as string[])[0] = 'dalian'; expect(() => validateMarketPresentation(data)).toThrow();
  });
  it('严格V2/V3仍可验证且不改变字段语义，V1与未知schema仍拒绝', () => {
    for (const version of ['2', '3'] as const) expect(validateMarketSnapshot(makeMarketFixture(version)).schema_version).toBe(version);
    for (const version of ['1','4','presentation-2']) expect(() => validateMarketSnapshot({ ...makePresentationFixture(), schema_version: version })).toThrow();
  });
});
