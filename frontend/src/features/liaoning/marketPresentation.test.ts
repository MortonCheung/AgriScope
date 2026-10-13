import { describe, expect, it } from 'vitest';
import { INITIAL_DISPLAY_MARKET, displayMarketFor, type DisplayMarketView } from '../../domain/market/displayMarket';
import { marketDirection, signedChange, summarizeMarket } from './marketPresentation';
const source = displayMarketFor(INITIAL_DISPLAY_MARKET, 'shenyang', 'wholesale');
const market = (changes: number[]): DisplayMarketView => ({ ...source, rows: changes.map((change, index) => ({ ...source.rows[index], change_percent: change,
  history: [{ date: '2026-01-01', price: 100 }, { date: '2026-01-02', price: 100 + change }] })) });
describe('真实行情变动摘要', () => {
  it('统计、极值和平均变动都来自同一组当前城市当前价格类型的八商品', () => {
    const summary = summarizeMarket(source);
    expect(summary.rising).toBe(source.rows.filter(row => marketDirection(row.change_percent) === 'up').length);
    expect(summary.falling).toBe(source.rows.filter(row => marketDirection(row.change_percent) === 'down').length);
    const compared = source.rows.filter(row => row.history.length > 1);
    expect(summary.average).toBeCloseTo(compared.length ? compared.reduce((sum, row) => sum + row.change_percent, 0) / compared.length : 0);
    expect(summarizeMarket(market([1, 3])).topRiser?.product).toBe(source.rows[1].product);
    expect(summarizeMarket(market([-2, -4])).topFaller?.product).toBe(source.rows[1].product);
  });
  it('单期价格不冒充持平或稀释已知的平均变动', () => {
    const mixed = market([20, 0]);
    mixed.rows[1].history = [mixed.rows[1].history.at(-1)!];
    expect(summarizeMarket(mixed)).toMatchObject({ comparable: 1, rising: 1, average: 20 });
    mixed.rows[0].history = [mixed.rows[0].history.at(-1)!];
    expect(summarizeMarket(mixed)).toMatchObject({ comparable: 0, rising: 0, falling: 0, average: 0 });
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
