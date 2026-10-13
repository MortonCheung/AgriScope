import { describe, expect, it } from 'vitest';
import { STUDY_CITY_IDS } from '../geography/cities';
import { DEMO_MARKET_DATE, demoMarketFor, demoPriceChange } from './demoMarket';
describe('homepage simulation data isolation and aggregation', () => {
  it('six cities share a reproducible eight-crop structure, with positive prices and explicit simulation provenance', () => {
    const scopes = STUDY_CITY_IDS.map(id => demoMarketFor(id));
    expect(new Set(scopes.map(scope => scope.rows[0].pricePerKg)).size).toBe(6);
    for (const scope of scopes) {
      expect(scope.kind).toBe('simulation');
      expect(scope.date).toBe(DEMO_MARKET_DATE);
      expect(scope.rows.map(row => row.crop)).toEqual(['黄瓜','甘蓝','青椒','尖椒','土豆','西红柿','茄子','大白菜']);
      for (const row of scope.rows) for (const period of ['pricePerKg','previous','week','month'] as const) expect(row[period]).toBeGreaterThan(0);
    }
  });
  it('province averages each period before calculating percentages rather than averaging percentage changes', () => {
    const province = demoMarketFor(null);
    expect(province.scope).toBe('六城参考均值');
    expect(province.kind).toBe('simulation');
    expect(province.date).toBe('2026-10-10');
    province.rows.forEach((row, index) => {
      for (const key of ['pricePerKg','previous','week','month'] as const) {
        const mean = STUDY_CITY_IDS.reduce((sum, id) => sum + demoMarketFor(id).rows[index][key],0) / 6;
        expect(row[key]).toBeCloseTo(mean,10);
      }
      expect(demoPriceChange(row,'previous')).toBeCloseTo((row.pricePerKg / row.previous - 1)*100,10);
    });
    expect(demoMarketFor('unknown')).toBe(province);
    expect(demoPriceChange(province.rows[3],'previous')).toBe(0);
  });
});
