import { describe, expect, it } from 'vitest';
import { adaptForecastCapability, adaptLongHorizonEntry, findHorizonCap, preferredHorizon } from '../../domain/longHorizon/adapter';

const capabilityRaw = () => ({
  city_id: 'shenyang', supported: true, as_of: '2026-09-14', horizons: [30, 60, 90, 120, 150, 180],
  model_version: 'long_horizon_v1', data_version: 'final_v1', limitation: null,
  crops: [{ id: '土豆', label: '土豆', horizons: [
    { days: 90, method: 'm_catboost', confidence: 'high', range_type: 'scenario_range', production_status: 'PRODUCTION_POINT', n_nonoverlap: 22 },
    { days: 120, method: 'm_extra_trees', confidence: 'medium', range_type: 'scenario_range', production_status: 'PRODUCTION_POINT', n_nonoverlap: 17 },
    { days: 180, method: 'm_extra_trees', confidence: 'low', range_type: 'scenario_range', production_status: 'EXPLORATORY_SCENARIO_ONLY', n_nonoverlap: 11 },
  ] }],
});

const entryRaw = () => ({
  crop: '土豆', horizon: 90, point_forecast: 2.054, range_low: 1.7168, range_high: 2.1376,
  range_type: 'scenario_range', production_status: 'PRODUCTION_POINT', confidence: 'high',
  method: 'm_catboost', unit: 'CNY/kg', available: true, as_of: '2026-09-14',
  anchor_observation_date: '2026-09-14', notes: ['窗口均价'],
  forecast: { source: 'long_horizon_model', fallback_used: false, model_disagreement: 2.092 },
});

describe('long-horizon capability adapter', () => {
  it('accepts the published capability schema', () => {
    const cap = adaptForecastCapability(capabilityRaw());
    expect(cap.supported).toBe(true);
    expect(cap.crops[0].horizons.map(h => h.days)).toEqual([90, 120, 180]);
    expect(findHorizonCap(cap, '土豆')?.id).toBe('土豆');
  });

  it('prefers a production horizon over an exploratory one, then the longest', () => {
    const cap = adaptForecastCapability(capabilityRaw());
    expect(preferredHorizon(findHorizonCap(cap, '土豆')!)).toBe(120);
  });

  it('rejects an unknown production status instead of guessing', () => {
    const raw = capabilityRaw();
    raw.crops[0].horizons[0].production_status = 'MAYBE';
    expect(() => adaptForecastCapability(raw)).toThrow('格式不完整');
  });

  it('rejects a non-numeric horizon label', () => {
    const raw = capabilityRaw();
    raw.horizons = ['90'] as unknown as number[];
    expect(() => adaptForecastCapability(raw)).toThrow('格式不完整');
  });
});

describe('long-horizon entry adapter', () => {
  it('accepts a validated entry and never turns null into zero', () => {
    const entry = adaptLongHorizonEntry(entryRaw());
    expect(entry.pointForecast).toBe(2.054);
    expect(entry.source).toBe('long_horizon_model');
    expect(entry.fallbackUsed).toBe(false);
    const empty = adaptLongHorizonEntry({ ...entryRaw(), point_forecast: null, range_low: null, range_high: null, available: false });
    expect(empty.pointForecast).toBeNull();
    expect(empty.rangeLow).toBeNull();
  });

  it('rejects an interval that does not contain the point forecast', () => {
    expect(() => adaptLongHorizonEntry({ ...entryRaw(), range_low: 2.5, range_high: 3.0 })).toThrow('格式不完整');
  });

  it('rejects a scenario range mislabeled as a calibrated prediction interval', () => {
    const raw = entryRaw();
    (raw as Record<string, unknown>).range_type = 'prediction_interval';
    expect(adaptLongHorizonEntry(raw).rangeType).toBe('prediction_interval');
    (raw as Record<string, unknown>).range_type = 'probability';
    expect(() => adaptLongHorizonEntry(raw)).toThrow('格式不完整');
  });

  it('rejects an unknown forecast source', () => {
    const raw = entryRaw();
    (raw.forecast as Record<string, unknown>).source = 'gpt';
    expect(() => adaptLongHorizonEntry(raw)).toThrow('格式不完整');
  });
});