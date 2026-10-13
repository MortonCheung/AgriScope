import { describe, expect, it } from 'vitest';
import { INITIAL_DISPLAY_MARKET, displayMarketFor, type DisplayMarketView } from '../../domain/market/displayMarket';
import { marketDirection, signedChange, summarizeMarket } from './marketPresentation';
const source = displayMarketFor(INITIAL_DISPLAY_MARKET, 'shenyang', 'wholesale');
const market = (changes: number[]): DisplayMarketView => ({ ...source, rows: changes.map((change, index) => ({ ...source.rows[index], change_percent: change })) });
describe('真实行情变动摘要', () => {
  it('统计、极值和平均变动都来自同一组当前城市当前价格类型的八商品', () => {
    const summary = summarizeMarket(source);
    expect(summary.rising).toBe(source.rows.filter(row => marketDirection(row.change_percent) === 'up').length);
    expect(summary.falling).toBe(source.rows.filter(row => marketDirection(row.change_percent) === 'down').length);
    expect(summary.average).toBeCloseTo(source.rows.reduce((sum, row) => sum + row.change_percent, 0) / 8);
    expect(summarizeMarket(market([1, 3])).topRiser?.product).toBe(source.rows[1].product);
    expect(summarizeMarket(market([-2, -4])).topFaller?.product).toBe(source.rows[1].product);
  });
  it('全上涨时不把上涨商品说成跌幅最大，平稳时不创造涨跌', () => {
    expect(summarizeMarket(market([1, 3])).topFaller).toBeNull();
    expect(summarizeMarket(market([-2, -4])).topRiser).toBeNull();
    expect(summarizeMarket(market([0, .02, -.02]))).toMatchObject({ rising: 0, falling: 0, topRiser: null, topFaller: null });
    expect(summarizeMarket({ ...source, rows: [] })).toMatchObject({ average: 0, topRiser: null, topFaller: null });
  });
  it('格式化归零不产生负零', () => {
    expect(marketDirection(-.02)).toBe('flat'); expect(signedChange(-.02)).toBe('0.0');
    expect(signedChange(1.63)).toBe('+1.6'); expect(signedChange(-2.14)).toBe('-2.1');
  });
});
