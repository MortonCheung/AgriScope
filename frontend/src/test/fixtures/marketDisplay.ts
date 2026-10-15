/** SYNTHETIC TEST FIXTURES. Never import this module from production code. */
import {
  DISPLAY_PRODUCTS, DISPLAY_PRICE_LEVELS, DISPLAY_REGIONS, LEGACY_DISPLAY_PRICE_LEVELS,
  validateDisplayMarket, type DisplayMarketRecord, type DisplayMarketSnapshot,
} from '../../domain/market/displayMarket';

const OBSERVATION = '2025-10-13';
const COLLECTED = '2025-10-14T01:30:00Z';
export function makeMarketFixture(version: '2' | '3' = '3'): DisplayMarketSnapshot {
  const levels = version === '3' ? DISPLAY_PRICE_LEVELS : LEGACY_DISPLAY_PRICE_LEVELS;
  const records = DISPLAY_REGIONS.flatMap((region, regionIndex) => DISPLAY_PRODUCTS.flatMap((product, productIndex) =>
    levels.map((price_level, levelIndex): DisplayMarketRecord => {
      const price = 2 + regionIndex + productIndex * 0.1 + levelIndex * 0.01;
      return { region, product, price_level, price, observation_date: OBSERVATION, collectedAt: COLLECTED,
        change_percent: 0, history: [{ date: OBSERVATION, price }],
        ...(version === '3' ? { unit: '元/kg' as const, source: {
          id: `TEST-SYNTHETIC-${region}-${price_level}`, name: `${region} synthetic test source`,
          url: `https://example.test/${region}/${price_level}`,
        } } : {}),
      };
    })));
  return sparseMarketFixture(records, version);
}

/** Derive the complete missing matrix and coverage from explicit test observations. */
export function sparseMarketFixture(records: DisplayMarketRecord[], version: '2' | '3' = '3'): DisplayMarketSnapshot {
  const levels = version === '3' ? DISPLAY_PRICE_LEVELS : LEGACY_DISPLAY_PRICE_LEVELS;
  const has = new Set(records.map(row => `${row.region}:${row.product}:${row.price_level}`));
  return validateDisplayMarket({
    schema_version: version, products: [...DISPLAY_PRODUCTS], price_levels: [...levels], records,
    ...(version === '3' ? { published_at: '2025-10-14T02:00:00Z' } : {}),
    missing: DISPLAY_REGIONS.flatMap(region => DISPLAY_PRODUCTS.flatMap(product => levels.filter(level => !has.has(`${region}:${product}:${level}`))
      .map(price_level => ({ region, product, price_level, reason: 'no_local_observation' as const })))),
    coverage: Object.fromEntries(DISPLAY_REGIONS.map(region => {
      const local = records.filter(row => row.region === region);
      return [region, { collection_status: version === '3' ? 'configured' : region === 'shenyang' ? 'scheduled' : 'not_configured',
        available_records: local.length, total_records: DISPLAY_PRODUCTS.length * levels.length,
        latest_observation_date: local.map(row => row.observation_date).sort().at(-1) ?? null,
        ...(version === '3' ? { latest_collected_at: [...local].sort((a, b) => Date.parse(a.collectedAt) - Date.parse(b.collectedAt)).at(-1)?.collectedAt ?? null } : {}),
      }];
    })),
  });
}

export const TEST_DISPLAY_MARKET = makeMarketFixture('2');
export const TEST_DISPLAY_MARKET_V3 = makeMarketFixture('3');
