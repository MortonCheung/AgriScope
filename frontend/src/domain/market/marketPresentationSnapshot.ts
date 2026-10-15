import {
  DISPLAY_PRICE_LEVELS, DISPLAY_PRODUCTS, DISPLAY_REGIONS, marketValidation as rules, validateDisplayMarket,
  type DisplayPriceLevel, type DisplayProduct, type DisplayRegion, type MarketSnapshot, type MarketSource,
} from './displayMarket';

export interface MarketPresentationRecord {
  region: DisplayRegion;
  product: DisplayProduct;
  price_level: DisplayPriceLevel;
  price: number;
  unit: '元/kg';
  display_date: string;
  observed_at: string | null;
  collected_at: string | null;
  history: { date: string; price: number }[];
  trend_history?: { date: string; price: number }[];
  trend_sources?: MarketSource[];
  change_percent: number;
  sources: MarketSource[];
  comparison_basis: 'previous_same_source_observation' | 'latest_only';
  origin: { kind: 'observed' | 'historical' | 'model_estimate' | 'calibrated_history'; history_kind: string; [key: string]: unknown };
}
export interface MarketPresentationSnapshot {
  schema_version: 'presentation-1';
  regions: DisplayRegion[];
  products: DisplayProduct[];
  price_levels: DisplayPriceLevel[];
  published_at: string;
  input_hash: string;
  records: MarketPresentationRecord[];
}

/** This contract is deliberately separate from official V2/V3 observations. */
export function validateMarketPresentation(value: unknown): MarketPresentationSnapshot {
  const fail = (): never => { throw new Error('行情展示发布校验未通过。'); };
  if (!rules.object(value)) return fail();
  const data = value as unknown as MarketPresentationSnapshot;
  if (data.schema_version !== 'presentation-1' || !rules.exactMembers(data.regions, DISPLAY_REGIONS)
    || !rules.exactMembers(data.products, DISPLAY_PRODUCTS) || !rules.exactMembers(data.price_levels, DISPLAY_PRICE_LEVELS)
    || !rules.isoTimestamp(data.published_at) || typeof data.input_hash !== 'string' || !/^[a-f0-9]{64}$/.test(data.input_hash)
    || !Array.isArray(data.records) || data.records.length !== 224) fail();
  const seen = new Set<string>();
  function history(points: unknown): points is MarketPresentationRecord['history'] {
    if (!Array.isArray(points) || !points.length || points.length > 730) return false;
    let previous = '';
    for (const point of points) {
      if (!rules.object(point) || !rules.validDay(point.date) || point.date <= previous || !rules.positivePrice(point.price)) return false;
      previous = point.date;
    }
    return true;
  }
  for (const row of data.records) {
    if (!rules.object(row) || !DISPLAY_REGIONS.includes(row.region) || !DISPLAY_PRODUCTS.includes(row.product)
      || !DISPLAY_PRICE_LEVELS.includes(row.price_level) || !rules.positivePrice(row.price) || row.unit !== '元/kg'
      || !rules.validDay(row.display_date) || (row.observed_at !== null && !rules.validDay(row.observed_at))
      || (row.collected_at !== null && !rules.validTimestamp(row.collected_at)) || !history(row.history)
      || (row.trend_history !== undefined && (!history(row.trend_history) || row.trend_history.length < 2 || row.trend_history.length > 128)) || !Array.isArray(row.sources)
      || (row.trend_sources !== undefined && (!Array.isArray(row.trend_sources) || !row.trend_sources.every(rules.validSource)))
      || !row.sources.every(rules.validSource) || typeof row.change_percent !== 'number' || !Number.isFinite(row.change_percent)
      || !rules.object(row.origin) || !['observed','historical','model_estimate','calibrated_history'].includes(row.origin.kind)) fail();
    const key = `${row.region}:${row.product}:${row.price_level}`;
    if (seen.has(key)) fail(); seen.add(key);
    if (row.trend_history && (row.origin.trend_history_kind !== 'local_same_source_observations'
      || !Array.isArray(row.origin.trend_series_identity)
      || row.origin.trend_series_identity.slice(0, 3).join(':') !== key)) fail();
    const last = row.history.at(-1)!;
    if (last.date !== row.display_date || last.price !== row.price) fail();
    const before = row.history.at(-2);
    const change = before ? (last.price / before.price - 1) * 100 : 0;
    if (!Number.isFinite(change) || Math.abs(change - row.change_percent) > .0001
      || row.comparison_basis !== (before ? 'previous_same_source_observation' : 'latest_only')) fail();
    if (row.origin.kind === 'observed' || row.origin.kind === 'historical') {
      if (row.observed_at !== row.display_date || row.origin.history_kind !== 'local_same_source_observations') fail();
    } else {
      if (row.origin.history_kind !== 'calculation' || row.history.length !== 1
        || typeof row.origin.price_type_surface_id !== 'string' || !/^[a-f0-9]{64}$/.test(row.origin.price_type_surface_id)) fail();
      if (row.origin.kind === 'model_estimate') {
        const model = row.origin.model;
        if (!rules.object(model) || typeof model.model_id !== 'string' || !model.model_id
          || typeof model.target_type !== 'string' || !model.target_type || !rules.positivePrice(model.price_per_kg)) fail();
      }
    }
  }
  return data;
}

export function validateMarketSnapshot(value: unknown): MarketSnapshot {
  return rules.object(value) && value.schema_version === 'presentation-1' ? validateMarketPresentation(value) : validateDisplayMarket(value);
}
