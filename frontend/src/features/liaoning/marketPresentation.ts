import { demoPriceChange, type DemoMarket } from '../../domain/market/demoMarket';

export const marketDirection = (change: number) => Math.abs(change) < .05 ? 'flat' : change > 0 ? 'up' : 'down';
export const signedChange = (change: number) => marketDirection(change) === 'flat' ? '0.0' : `${change > 0 ? '+' : ''}${change.toFixed(1)}`;

export function summarizeMarket(market: DemoMarket) {
  const changes = market.rows.map(row => ({ crop: row.crop, change: demoPriceChange(row, 'previous') }));
  const rising = changes.filter(row => marketDirection(row.change) === 'up');
  const falling = changes.filter(row => marketDirection(row.change) === 'down');
  return {
    rising: rising.length, falling: falling.length,
    topRiser: rising.reduce<typeof changes[number] | null>((best, row) => !best || row.change > best.change ? row : best, null),
    topFaller: falling.reduce<typeof changes[number] | null>((best, row) => !best || row.change < best.change ? row : best, null),
    average: changes.length ? changes.reduce((sum, row) => sum + row.change, 0) / changes.length : 0,
  };
}
