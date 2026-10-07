import { describe, expect, it } from 'vitest';
import { adaptDailySnapshot, findDailyCrop, freshnessForAge, shanghaiDate } from '../../domain/daily/adapter';
import { DAILY_TEST_NOW, dailyTestRaw } from './daily.testData';

describe('Daily published snapshot contract', () => {
  it.each([
    ['2026-10-07', 0, 'FRESH'], ['2026-10-06', 1, 'DELAYED'], ['2026-10-05', 2, 'DELAYED'],
    ['2026-10-04', 3, 'STALE'], ['2026-09-30', 7, 'STALE'], ['2026-09-29', 8, 'MISSING'],
    [null, null, 'MISSING'],
  ] as const)('recomputes %s according to the official daily-age thresholds', (date, age, freshness) => {
    const result = adaptDailySnapshot(dailyTestRaw(date), DAILY_TEST_NOW);
    expect(result.ageDays).toBe(age);
    expect(result.freshness).toBe(freshness);
    expect(result.crops[0].freshness).toBe(freshness);
    expect(result.sourceFreshness).toBe('FRESH');
    expect(result.crops[0].sourceFreshness).toBe('FRESH');
  });

  it('uses Shanghai business dates across midnight, independently of the local time zone', () => {
    const before = new Date('2026-10-07T15:59:59Z');
    const after = new Date('2026-10-07T16:00:00Z');
    expect(shanghaiDate(before)).toBe('2026-10-07');
    expect(shanghaiDate(after)).toBe('2026-10-08');
    expect(adaptDailySnapshot(dailyTestRaw(), before).freshness).toBe('FRESH');
    expect(adaptDailySnapshot(dailyTestRaw(), after).freshness).toBe('DELAYED');
    expect(freshnessForAge(null)).toBe('MISSING');
  });

  it('preserves published signals, source and model sourceMeta without recalculation', () => {
    const raw = dailyTestRaw('2026-09-29');
    const original = structuredClone(raw);
    const result = adaptDailySnapshot(raw, DAILY_TEST_NOW);
    expect(result.crops[0]).toMatchObject({ signal: 'WATCH', pricePerKg: 4.4, sourceId: 'official-source', finalStatus: 'USER_INPUT_REQUIRED' });
    expect(result.sources[0]).toMatchObject({ id: 'official-source', name: '官方价格来源', url: 'https://example.org/prices', priceLevel: 'wholesale' });
    expect(result.sourceMeta).toMatchObject({ snapshotHash: 'published-snapshot-hash', finalCodeFingerprint: 'published-daily-fingerprint', modelVersion: 'final_v1' });
    expect(raw).toEqual(original);
  });

  it('looks up only exact canonical crops and never infers a crop from a similar name', () => {
    const result = adaptDailySnapshot(dailyTestRaw(), DAILY_TEST_NOW);
    expect(findDailyCrop(result, '西红柿')?.pricePerKg).toBe(4.4);
    for (const crop of ['番茄', '西红柿 ', '辣椒', '青椒', 'tomato']) expect(findDailyCrop(result, crop)).toBeNull();
  });

  it('keeps null measurements missing while a model is unavailable', () => {
    const raw = dailyTestRaw();
    const result = adaptDailySnapshot({ ...raw, model: { ...raw.model, model_status: 'MODEL_UNAVAILABLE' }, crops: [{ ...raw.crops[0], latest_price: null, change_1d: null, change_7d: null, change_30d: null, historical_percentile: null, hri: null, market_risk: null, confidence: null, daily_signal: null, model_status: 'MODEL_UNAVAILABLE' }] }, DAILY_TEST_NOW);
    expect(result.crops[0]).toMatchObject({ pricePerKg: null, changePreviousObservation: null, change7d: null, change30d: null, signal: null, hri: null, marketRisk: null });
    expect(result.sourceMeta.modelStatus).toBe('MODEL_UNAVAILABLE');
  });

  it('retains observed prices when inference is unavailable', () => {
    const raw = dailyTestRaw();
    const result = adaptDailySnapshot({ ...raw, crops: [{ ...raw.crops[0], daily_signal: null, model_status: 'MODEL_UNAVAILABLE' }] }, DAILY_TEST_NOW);
    expect(result.crops[0].pricePerKg).toBe(4.4);
    expect(result.crops[0].signal).toBeNull();
  });

  it.each([
    ['unknown schema', (raw: ReturnType<typeof dailyTestRaw>) => ({ ...raw, schema_version: '2.0.0' })],
    ['wrong city', (raw: ReturnType<typeof dailyTestRaw>) => ({ ...raw, city: '朝阳' })],
    ['wrong timezone', (raw: ReturnType<typeof dailyTestRaw>) => ({ ...raw, timezone: 'UTC' })],
    ['invalid calendar date', (raw: ReturnType<typeof dailyTestRaw>) => ({ ...raw, latest_data_date: '2026-02-30' })],
    ['future observation', (raw: ReturnType<typeof dailyTestRaw>) => ({ ...raw, latest_data_date: '2026-10-08' })],
    ['unsafe source link', (raw: ReturnType<typeof dailyTestRaw>) => ({ ...raw, sources: [{ ...raw.sources[0], url: 'javascript:alert(1)' }] })],
    ['duplicate crop', (raw: ReturnType<typeof dailyTestRaw>) => ({ ...raw, crops: [raw.crops[0], raw.crops[0]] })],
    ['retail price', (raw: ReturnType<typeof dailyTestRaw>) => ({ ...raw, crops: [{ ...raw.crops[0], price_level: 'retail' }] })],
    ['different price unit', (raw: ReturnType<typeof dailyTestRaw>) => ({ ...raw, crops: [{ ...raw.crops[0], unit: '元/斤' }] })],
    ['non-finite change', (raw: ReturnType<typeof dailyTestRaw>) => ({ ...raw, crops: [{ ...raw.crops[0], change_7d: Number.NaN }] })],
    ['percentage in wrong unit', (raw: ReturnType<typeof dailyTestRaw>) => ({ ...raw, crops: [{ ...raw.crops[0], historical_percentile: 50 }] })],
    ['unknown signal', (raw: ReturnType<typeof dailyTestRaw>) => ({ ...raw, crops: [{ ...raw.crops[0], daily_signal: 'BUY' }] })],
    ['undeclared source', (raw: ReturnType<typeof dailyTestRaw>) => ({ ...raw, crops: [{ ...raw.crops[0], source: 'unknown' }] })],
    ['unpublished recommendation', (raw: ReturnType<typeof dailyTestRaw>) => ({ ...raw, recommendation: { crop: '西红柿' } })],
  ])('rejects malformed payload: %s', (_, corrupt) => {
    expect(() => adaptDailySnapshot(corrupt(dailyTestRaw()), DAILY_TEST_NOW)).toThrow('市场数据格式不完整');
  });
});
