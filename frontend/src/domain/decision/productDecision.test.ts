import { describe, expect, it } from 'vitest';
import { STUDY_CITY_IDS } from '../geography/cities';
import type { MarketObservation } from '../market/types';
import { createCityDecisionData, productCropOptions, productPriceFor, PRODUCT_CROPS } from './productDecision';
const conditions = { areaMu: 10, yieldKgPerMu: 500, costPerMu: 1000, pricePerKg: 4, saleFraction: .8 };
const observation: MarketObservation = { cityId: 'jinzhou', cityName: '锦州', unit: '元/kg', available: true, selectedCrop: '玉米', snapshotVersion: 's', crops: ['玉米'], series: [{ id: 'corn', crop: '玉米', productName: '玉米', marketName: '市场', priceLevel: 'market_average', source: { name: '价格记录', url: null }, observations: [{ date: '2026-09-01', pricePerKg: 2.7 }], notes: [] }] };
describe('uniform product decision data', () => {
  it.each(STUDY_CITY_IDS)('uses the same valid schema and formula in %s', city => {
    const data = createCityDecisionData({ city, crop: '玉米', conditions, saleDate: '2026-11-10', budgetCny: 15000 });
    expect(data).toMatchObject({ city, crop: '玉米', price: 4, risk: '低', result: { revenueCny: 16000, costCny: 10000, profitCny: 6000 }, salesWindow: { start: '2026-11-10', end: '2026-11-10' }, origin: { profit: 'user_conditions_formula', risk: 'budget_and_sensitivity', window: 'user_sale_date' } });
  });
  it('retains stable choices and only merges valid additional crops', () => {
    expect(productCropOptions()).toEqual(PRODUCT_CROPS);
    expect(productCropOptions(['玉米', '草莓', '', '__proto__', 'bad!'])).toEqual([...PRODUCT_CROPS, '草莓']);
  });
  it('uses available local API prices and ignores wrong city/crop readings', () => {
    expect(productPriceFor('jinzhou', '玉米', observation)).toEqual({ price: 2.7, origin: 'market_api' });
    expect(productPriceFor('tieling', '玉米', observation)).toEqual({ price: 2.4, origin: 'product_fallback' });
    expect(productPriceFor('jinzhou', '草莓', observation)).toEqual({ price: null, origin: 'unavailable' });
    expect(productPriceFor('jinzhou', '玉米', { ...observation, available: false })).toEqual({ price: 2.4, origin: 'product_fallback' });
  });
  it('grades operating risk from budget shortfall and existing downside calculations', () => {
    expect(createCityDecisionData({ city: 'dalian', crop: '玉米', conditions, budgetCny: 9000 })).toMatchObject({ risk: '高', budget: { shortfall: 1000 }, suggestion: '调整种植规模' });
    expect(createCityDecisionData({ city: 'dalian', crop: '玉米', conditions: { ...conditions, costPerMu: 1500 } })?.risk).toBe('中等');
    expect(createCityDecisionData({ city: 'dalian', crop: '玉米', conditions: { ...conditions, pricePerKg: 0 } })).toMatchObject({ risk: '高', result: { profitCny: -10000, breakEvenYield: null } });
  });
  it('does not invent a best date or future model risk and rejects invalid data', () => {
    const data = createCityDecisionData({ city: 'shenyang', crop: '玉米', conditions, saleDate: '2026-02-30' });
    expect(data?.salesWindow).toBeNull(); expect(data?.origin.window).toBe('not_selected');
    expect(createCityDecisionData({ city: 'anshan', crop: '玉米', conditions })).toBeNull();
    expect(createCityDecisionData({ city: 'shenyang', crop: '玉米', conditions, budgetCny: -1 })).toBeNull();
    expect(createCityDecisionData({ city: 'shenyang', crop: '玉米', conditions: { ...conditions, areaMu: Number.MAX_VALUE } })).toBeNull();
  });
});
