import { getCity, isStudyCity, STUDY_CITY_IDS, type StudyCityId } from '../geography/cities';

/** Homepage-only synthetic examples. Never consumed by formal observations or decisions. */
export const DEMO_MARKET_DATE = '2026-10-10';
export const DEMO_MARKET_LABEL = '情景参考价';
export type DemoPeriod = 'previous' | 'week' | 'month';
export interface DemoPrice {
  crop: string;
  pricePerKg: number;
  previous: number;
  week: number;
  month: number;
}
export interface DemoMarket {
  kind: 'simulation';
  cityId: StudyCityId | null;
  scope: string;
  date: string;
  rows: readonly DemoPrice[];
}

const CROPS = ['黄瓜', '甘蓝', '青椒', '尖椒', '土豆', '西红柿', '茄子', '大白菜'] as const;
// Each tuple: current, previous day, seven days ago, thirty days ago (CNY/kg).
// Fixed samples keep the demo reproducible; these are not collected market prices.
const SAMPLES: Record<StudyCityId, readonly (readonly [number, number, number, number])[]> = {
  shenyang: [[3.8, 3.74, 3.62, 3.4], [1.6, 1.65, 1.72, 1.8], [4.2, 4.1, 4, 3.9], [4.6, 4.6, 4.7, 4.5], [2.2, 2.18, 2.1, 2.05], [4.1, 4.04, 3.9, 3.7], [3.6, 3.65, 3.7, 3.8], [1.4, 1.42, 1.5, 1.6]],
  tieling: [[3.5, 3.45, 3.4, 3.3], [1.5, 1.54, 1.6, 1.7], [4, 3.92, 3.8, 3.7], [4.3, 4.3, 4.4, 4.2], [2.1, 2.08, 2, 1.95], [3.9, 3.84, 3.7, 3.5], [3.4, 3.45, 3.5, 3.6], [1.3, 1.32, 1.4, 1.5]],
  chaoyang: [[3.9, 3.82, 3.7, 3.5], [1.7, 1.75, 1.8, 1.9], [4.3, 4.22, 4.1, 4], [4.7, 4.7, 4.8, 4.6], [2.3, 2.27, 2.2, 2.15], [4.2, 4.13, 4, 3.8], [3.7, 3.73, 3.8, 3.9], [1.5, 1.52, 1.6, 1.7]],
  jinzhou: [[3.7, 3.65, 3.55, 3.4], [1.6, 1.64, 1.7, 1.8], [4.1, 4.04, 3.95, 3.8], [4.5, 4.5, 4.6, 4.4], [2.15, 2.13, 2.05, 2], [4, 3.94, 3.8, 3.6], [3.5, 3.54, 3.6, 3.7], [1.35, 1.37, 1.45, 1.55]],
  dandong: [[4.1, 4.03, 3.9, 3.7], [1.9, 1.95, 2, 2.1], [4.6, 4.5, 4.4, 4.2], [5, 5, 5.1, 4.9], [2.5, 2.47, 2.4, 2.3], [4.5, 4.43, 4.3, 4.1], [4, 4.04, 4.1, 4.2], [1.7, 1.72, 1.8, 1.9]],
  dalian: [[4.4, 4.32, 4.2, 4], [2, 2.04, 2.1, 2.2], [4.8, 4.7, 4.6, 4.4], [5.2, 5.2, 5.3, 5.1], [2.6, 2.57, 2.5, 2.4], [4.7, 4.62, 4.5, 4.3], [4.2, 4.25, 4.3, 4.4], [1.8, 1.82, 1.9, 2]],
};
const cityMarkets = new Map<StudyCityId, DemoMarket>(STUDY_CITY_IDS.map(cityId => [cityId, {
  kind: 'simulation', cityId, scope: getCity(cityId)!.shortName, date: DEMO_MARKET_DATE,
  rows: SAMPLES[cityId].map(([pricePerKg, previous, week, month], index) => ({ crop: CROPS[index], pricePerKg, previous, week, month })),
}]));
const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const provinceMarket: DemoMarket = {
  kind: 'simulation', cityId: null, scope: '六城参考均值', date: DEMO_MARKET_DATE,
  rows: CROPS.map((crop, index) => ({ crop,
    pricePerKg: mean(STUDY_CITY_IDS.map(id => SAMPLES[id][index][0])),
    previous: mean(STUDY_CITY_IDS.map(id => SAMPLES[id][index][1])),
    week: mean(STUDY_CITY_IDS.map(id => SAMPLES[id][index][2])),
    month: mean(STUDY_CITY_IDS.map(id => SAMPLES[id][index][3])),
  })),
};

export function demoMarketFor(cityId: string | null): DemoMarket {
  return cityId && isStudyCity(cityId) ? cityMarkets.get(cityId)! : provinceMarket;
}
export function demoPriceChange(row: DemoPrice, period: DemoPeriod): number {
  return (row.pricePerKg / row[period] - 1) * 100;
}
