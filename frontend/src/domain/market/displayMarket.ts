import { getCity, isStudyCity, STUDY_CITY_IDS, type StudyCityId } from '../geography/cities';

export const DISPLAY_PRODUCTS = ['黄瓜', '甘蓝', '青椒', '尖椒', '土豆', '西红柿', '茄子', '大白菜'] as const;
export const LEGACY_DISPLAY_PRICE_LEVELS = ['wholesale', 'supermarket', 'retail_market'] as const;
export const DISPLAY_PRICE_LEVELS = [...LEGACY_DISPLAY_PRICE_LEVELS, 'market_average'] as const;
export const DISPLAY_REGIONS = [...STUDY_CITY_IDS, 'liaoning'] as const;
export type DisplayProduct = typeof DISPLAY_PRODUCTS[number];
export type DisplayPriceLevel = typeof DISPLAY_PRICE_LEVELS[number];
export type DisplayRegion = StudyCityId | 'liaoning';
export const PRICE_LEVEL_LABEL: Record<DisplayPriceLevel, string> = {
  wholesale: '批发价', supermarket: '超市零售价', retail_market: '集市零售价', market_average: '官方市场监测均价',
};
export const PRICE_LEVEL_BUTTON: Record<DisplayPriceLevel, string> = {
  wholesale: '批发', supermarket: '超市', retail_market: '集市', market_average: '监测均价',
};
export interface MarketSource { id: string; name: string; url: string }
export interface DisplayMarketRecord {
  region: DisplayRegion;
  product: DisplayProduct;
  price_level: DisplayPriceLevel;
  price: number;
  observation_date: string;
  collectedAt: string;
  change_percent: number;
  history: { date: string; price: number }[];
  /** V2 did not publish these fields; compatibility never invents them. */
  unit?: '元/kg';
  source?: MarketSource;
}
export interface MissingMarketCell { region: DisplayRegion; product: DisplayProduct; price_level: DisplayPriceLevel; reason: 'no_local_observation' }
export interface MarketCoverage {
  collection_status: 'configured' | 'scheduled' | 'not_configured';
  available_records: number;
  total_records: number;
  latest_observation_date: string | null;
  latest_collected_at?: string | null;
}
export interface DisplayMarketSnapshot {
  schema_version: '2' | '3';
  products: DisplayProduct[];
  price_levels: DisplayPriceLevel[];
  records: DisplayMarketRecord[];
  missing: MissingMarketCell[];
  coverage: Record<DisplayRegion, MarketCoverage>;
  published_at?: string | null;
}
export interface DisplayMarketView {
  cityId: StudyCityId | null;
  scope: string;
  priceLevel: DisplayPriceLevel;
  rows: DisplayMarketRecord[];
  missing?: MissingMarketCell[];
  schemaVersion?: DisplayMarketSnapshot['schema_version'];
  coverage?: MarketCoverage;
  publishedAt?: string | null;
  /** Actual rows of this region, retaining each original price level/source. */
  regionRows?: DisplayMarketRecord[];
}

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const validDay = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  // This only rejects impossible/future evidence; it never creates a data date.
  const today = new Date(new Date().getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value && value <= today;
};
const positivePrice = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const exactMembers = (value: unknown, expected: readonly string[]) => Array.isArray(value)
  && value.length === expected.length && new Set(value).size === expected.length
  && value.every(item => typeof item === 'string' && expected.includes(item));
const isoTimestamp = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && validDay(value.slice(0, 10)) && Number.isFinite(Date.parse(value))
  && Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60
  && (value.endsWith('Z') || (Number(value.slice(-5, -3)) < 24 && Number(value.slice(-2)) < 60));
// Historical source timestamps may only have date precision. Do not invent a clock time.
const validTimestamp = (value: unknown): value is string => validDay(value) || isoTimestamp(value);
const validSource = (value: unknown): value is MarketSource => {
  if (!object(value) || !['id', 'name', 'url'].every(key => typeof value[key] === 'string' && value[key].trim().length > 0)) return false;
  const raw = value.url as string;
  if (!/^https?:\/\//i.test(raw) || /[\s\\\u0000-\u001f\u007f]/.test(raw)) return false;
  try { const url = new URL(raw); return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password; }
  catch { return false; }
};

/** Validate every cell and its evidence before atomically replacing a publication. */
export function validateDisplayMarket(value: unknown): DisplayMarketSnapshot {
  const fail = (): never => { throw new Error('行情发布包校验未通过。'); };
  if (!object(value)) return fail();
  const data = value as unknown as DisplayMarketSnapshot;
  const version = data.schema_version;
  const levels: readonly DisplayPriceLevel[] = version === '3' ? DISPLAY_PRICE_LEVELS : LEGACY_DISPLAY_PRICE_LEVELS;
  if (!['2', '3'].includes(version) || !exactMembers(data.products, DISPLAY_PRODUCTS)
    || !exactMembers(data.price_levels, levels) || !Array.isArray(data.records) || !Array.isArray(data.missing)
    || !object(data.coverage) || !exactMembers(Object.keys(data.coverage), DISPLAY_REGIONS)) return fail();
  if ((version === '3' && !Object.hasOwn(data, 'published_at'))
    || (Object.hasOwn(data, 'published_at') && data.published_at !== null && !isoTimestamp(data.published_at))) fail();
  const keys = new Set<string>();
  for (const row of data.records) {
    if (!object(row) || !DISPLAY_REGIONS.includes(row.region) || !DISPLAY_PRODUCTS.includes(row.product)
      || !levels.includes(row.price_level) || !positivePrice(row.price)
      || !validDay(row.observation_date) || !(version === '3' ? isoTimestamp(row.collectedAt) : validTimestamp(row.collectedAt))
      || typeof row.change_percent !== 'number' || !Number.isFinite(row.change_percent)
      || !Array.isArray(row.history) || row.history.length < 1 || row.history.length > 4
      || (version === '3' && (row.unit !== '元/kg' || !validSource(row.source)))
      || (Object.hasOwn(row, 'unit') && row.unit !== '元/kg')
      || (Object.hasOwn(row, 'source') && !validSource(row.source))) fail();
    const key = `${row.region}:${row.product}:${row.price_level}`;
    if (keys.has(key)) fail();
    keys.add(key);
    let previous = '';
    for (const point of row.history) {
      if (!object(point) || !validDay(point.date) || point.date <= previous || !positivePrice(point.price)) fail();
      previous = point.date;
    }
    const last = row.history.at(-1)!;
    if (last.date !== row.observation_date || last.price !== row.price) fail();
    const previousPoint = row.history.at(-2);
    const change = previousPoint ? (last.price / previousPoint.price - 1) * 100 : 0;
    if (!Number.isFinite(change) || Math.abs(change - row.change_percent) > 0.0001) fail();
  }
  for (const row of data.missing) {
    if (!object(row) || !DISPLAY_REGIONS.includes(row.region) || !DISPLAY_PRODUCTS.includes(row.product)
      || !levels.includes(row.price_level) || row.reason !== 'no_local_observation') fail();
    const key = `${row.region}:${row.product}:${row.price_level}`;
    if (keys.has(key)) fail(); keys.add(key);
  }
  if (keys.size !== DISPLAY_REGIONS.length * DISPLAY_PRODUCTS.length * levels.length) fail();
  for (const region of DISPLAY_REGIONS) {
    const item = data.coverage[region];
    const rows = data.records.filter(row => row.region === region);
    const latest = rows.map(row => row.observation_date).sort().at(-1) ?? null;
    const allowedStatus = version === '3' ? ['configured', 'not_configured'] : ['scheduled', 'not_configured'];
    if (!object(item) || !allowedStatus.includes(item.collection_status) || !Number.isInteger(item.available_records)
      || item.available_records !== rows.length || item.total_records !== DISPLAY_PRODUCTS.length * levels.length
      || item.latest_observation_date !== latest) fail();
    if (version === '3' || Object.hasOwn(item, 'latest_collected_at')) {
      const latestCollected = rows.length ? Math.max(...rows.map(row => Date.parse(row.collectedAt))) : null;
      if (latestCollected === null ? item.latest_collected_at !== null
        : !(version === '3' ? isoTimestamp(item.latest_collected_at) : validTimestamp(item.latest_collected_at))
          || Date.parse(item.latest_collected_at!) !== latestCollected) fail();
    }
  }
  return data;
}

export function displayMarketFor(snapshot: DisplayMarketSnapshot, cityId: string | null, priceLevel: DisplayPriceLevel): DisplayMarketView {
  const selectedCity = cityId && isStudyCity(cityId) ? cityId : null;
  const region: DisplayRegion = selectedCity ?? 'liaoning';
  const regionRows = snapshot.records.filter(row => row.region === region);
  // V2 never provided this fourth price level: show explicit absence, never alias wholesale.
  const missing = snapshot.price_levels.includes(priceLevel)
    ? snapshot.missing.filter(row => row.region === region && row.price_level === priceLevel)
    : DISPLAY_PRODUCTS.map(product => ({ region, product, price_level: priceLevel, reason: 'no_local_observation' as const }));
  return { cityId: selectedCity, scope: selectedCity ? getCity(selectedCity)!.shortName : '辽宁', priceLevel,
    rows: regionRows.filter(row => row.price_level === priceLevel).sort((a, b) => DISPLAY_PRODUCTS.indexOf(a.product) - DISPLAY_PRODUCTS.indexOf(b.product)),
    missing, schemaVersion: snapshot.schema_version, coverage: snapshot.coverage[region],
    publishedAt: snapshot.published_at ?? null, regionRows,
  };
}

// Empty availability is the only seed until an API publication has passed validation.
export const UNAVAILABLE_DISPLAY_MARKET: DisplayMarketSnapshot = validateDisplayMarket({
  schema_version: '3', products: [...DISPLAY_PRODUCTS], price_levels: [...DISPLAY_PRICE_LEVELS], records: [], published_at: null,
  missing: DISPLAY_REGIONS.flatMap(region => DISPLAY_PRODUCTS.flatMap(product => DISPLAY_PRICE_LEVELS.map(price_level => ({ region, product, price_level, reason: 'no_local_observation' as const })))),
  coverage: Object.fromEntries(DISPLAY_REGIONS.map(region => [region, { collection_status: 'not_configured', available_records: 0, total_records: 32, latest_observation_date: null, latest_collected_at: null }])),
});
