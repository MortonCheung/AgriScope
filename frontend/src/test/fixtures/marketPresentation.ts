/** SYNTHETIC TEST FIXTURE. This module must never enter production imports. */
import { DISPLAY_REGIONS } from '../../domain/market/displayMarket';
import { validateMarketPresentation, type MarketPresentationSnapshot } from '../../domain/market/marketPresentationSnapshot';
import { makeMarketFixture } from './marketDisplay';

export function makePresentationFixture(): MarketPresentationSnapshot {
  const official = makeMarketFixture();
  return validateMarketPresentation({
    schema_version: 'presentation-1', regions: [...DISPLAY_REGIONS], products: official.products, price_levels: official.price_levels,
    published_at: official.published_at, input_hash: 'a'.repeat(64),
    records: official.records.map(row => ({
      region: row.region, product: row.product, price_level: row.price_level, price: row.price, unit: '元/kg',
      display_date: row.observation_date, observed_at: row.observation_date, collected_at: row.collectedAt,
      history: row.history, sources: [row.source], change_percent: row.change_percent,
      comparison_basis: 'latest_only', origin: { kind: 'historical', history_kind: 'local_same_source_observations' },
    })),
  });
}
