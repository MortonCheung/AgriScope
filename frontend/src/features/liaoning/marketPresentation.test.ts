import { describe, expect, it } from 'vitest';
import { demoMarketFor, demoPriceChange, type DemoMarket } from '../../domain/market/demoMarket';
import { marketDirection, signedChange, summarizeMarket } from './marketPresentation';

const market = (changes: number[]): DemoMarket => ({ ...demoMarketFor(null), rows: changes.map((change, index) => ({ crop: `品种${index}`, previous: 100, pricePerKg: 100 + change, month: 100, week: 100 })) });
describe('displayed daily market summary', () => {
  it('derives counts, extremes and equal-weight average from the same daily prices', () => {
    const source = demoMarketFor('shenyang');
    const summary = summarizeMarket(source);
    expect(summary.rising).toBe(4); expect(summary.falling).toBe(3);
    expect(summary.topRiser?.crop).toBe('青椒'); expect(summary.topFaller?.crop).toBe('甘蓝');
    expect(summary.average).toBeCloseTo(source.rows.reduce((sum, row) => sum + demoPriceChange(row, 'previous'), 0) / 8);
  });
  it('never labels a rising crop as biggest fall, or flat prices as movers', () => {
    expect(summarizeMarket(market([1, 3])).topFaller).toBeNull();
    expect(summarizeMarket(market([-2, -4])).topRiser).toBeNull();
    expect(summarizeMarket(market([0, .02, -.02]))).toMatchObject({ rising: 0, falling: 0, topRiser: null, topFaller: null });
    expect(summarizeMarket(market([]))).toMatchObject({ average: 0, topRiser: null, topFaller: null });
  });
  it('shares the visible zero threshold without negative zero', () => {
    expect(marketDirection(-.02)).toBe('flat'); expect(signedChange(-.02)).toBe('0.0');
    expect(signedChange(1.63)).toBe('+1.6'); expect(signedChange(-2.14)).toBe('-2.1');
  });
});
