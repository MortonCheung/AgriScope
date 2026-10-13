import publishedMarket from './publishedMarket.json';
import { getCity, isStudyCity, STUDY_CITY_IDS, type StudyCityId } from '../geography/cities';

export const DISPLAY_PRODUCTS = ['黄瓜', '甘蓝', '青椒', '尖椒', '土豆', '西红柿', '茄子', '大白菜'] as const;
export const DISPLAY_PRICE_LEVELS = ['wholesale', 'supermarket', 'retail_market'] as const;
export type DisplayProduct = typeof DISPLAY_PRODUCTS[number];
export type DisplayPriceLevel = typeof DISPLAY_PRICE_LEVELS[number];
export type DisplayRegion = StudyCityId | 'liaoning';
export const PRICE_LEVEL_LABEL: Record<DisplayPriceLevel, string> = {
  wholesale: '批发价', supermarket: '超市零售价', retail_market: '集市零售价',
};
export const PRICE_LEVEL_BUTTON: Record<DisplayPriceLevel, string> = {
  wholesale: '批发', supermarket: '超市', retail_market: '集市',
};
export interface DisplayMarketRecord {
  region: DisplayRegion;
  product: DisplayProduct;
  price_level: DisplayPriceLevel;
  price: number;
  observation_date: string;
  collectedAt: string;
  change_percent: number;
  history: { date: string; price: number }[];
}
export interface DisplayMarketSnapshot {
  schema_version: '1';
  products: DisplayProduct[];
  price_levels: DisplayPriceLevel[];
  records: DisplayMarketRecord[];
}
export interface DisplayMarketView {
  cityId: StudyCityId | null;
  scope: string;
  priceLevel: DisplayPriceLevel;
  rows: DisplayMarketRecord[];
}

const validDay = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};
const positivePrice = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const exactMembers = (value: unknown, expected: readonly string[]) => Array.isArray(value)
  && value.length === expected.length && new Set(value).size === expected.length
  && value.every(item => typeof item === 'string' && expected.includes(item));
const validTimestamp = (value: unknown): value is string => validDay(value) || (typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && validDay(value.slice(0, 10)) && Number.isFinite(Date.parse(value))
  && Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60);

/** Validate the entire published view before replacing any visible prices. */
export function validateDisplayMarket(value: unknown): DisplayMarketSnapshot {
  const data = value as DisplayMarketSnapshot | null;
  const fail = (): never => { throw new Error('行情发布包校验未通过。'); };
  const regions: readonly string[] = [...STUDY_CITY_IDS, 'liaoning'];
  if (!data || data.schema_version !== '1' || !exactMembers(data.products, DISPLAY_PRODUCTS)
    || !exactMembers(data.price_levels, DISPLAY_PRICE_LEVELS) || !Array.isArray(data.records)
    || data.records.length !== regions.length * DISPLAY_PRODUCTS.length * DISPLAY_PRICE_LEVELS.length) return fail();
  const keys = new Set<string>();
  for (const row of data.records) {
    if (!row || !regions.includes(row.region) || !DISPLAY_PRODUCTS.includes(row.product)
      || !DISPLAY_PRICE_LEVELS.includes(row.price_level) || !positivePrice(row.price)
      || !validDay(row.observation_date) || !validTimestamp(row.collectedAt)
      || typeof row.change_percent !== 'number' || !Number.isFinite(row.change_percent)
      || !Array.isArray(row.history) || row.history.length < 1 || row.history.length > 4) fail();
    const key = `${row.region}:${row.product}:${row.price_level}`;
    if (keys.has(key)) fail();
    keys.add(key);
    let previous = '';
    for (const point of row.history) {
      if (!point || !validDay(point.date) || point.date <= previous || !positivePrice(point.price)) fail();
      previous = point.date;
    }
    const last = row.history.at(-1)!;
    if (last.date !== row.observation_date || last.price !== row.price) fail();
    const previousPoint = row.history.at(-2);
    const change = previousPoint ? (last.price / previousPoint.price - 1) * 100 : 0;
    if (Math.abs(change - row.change_percent) > 0.0001) fail();
  }
  return data;
}

// This compact publication is generated from registered real price assets.
export const INITIAL_DISPLAY_MARKET = validateDisplayMarket(publishedMarket);

export function displayMarketFor(snapshot: DisplayMarketSnapshot, cityId: string | null, priceLevel: DisplayPriceLevel): DisplayMarketView {
  const selectedCity = cityId && isStudyCity(cityId) ? cityId : null;
  const region = selectedCity ?? 'liaoning';
  return { cityId: selectedCity, scope: selectedCity ? getCity(selectedCity)!.shortName : '辽宁', priceLevel,
    rows: DISPLAY_PRODUCTS.map(product => snapshot.records.find(row => row.region === region && row.product === product && row.price_level === priceLevel)!),
  };
}
