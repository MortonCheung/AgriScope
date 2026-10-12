import { isStudyCity, type StudyCityId } from '../geography/cities';
import type { MarketObservation } from '../market/types';
import { calculatePlanning, planningSensitivity, validPlanningSaleDate, type PlanningInputs, type PlanningResult } from './planning';
import type { RiskPreference } from './types';

export const PRODUCT_CROPS = ['黄瓜', '甘蓝', '青椒', '尖椒', '西红柿', '玉米', '水稻', '大豆', '小麦', '马铃薯'] as const;
export type OperatingRisk = '低' | '中等' | '高';
export type PriceSource = 'user' | 'market_api' | 'product_fallback' | 'unavailable';

/** Product fallback prices only. They never enter the formal model/provider contracts. */
const FALLBACK_PRICES: Readonly<Record<string, number>> = { 黄瓜: 3.8, 甘蓝: 1.6, 青椒: 4.2, 尖椒: 4.6, 西红柿: 4.1, 玉米: 2.4, 水稻: 3, 大豆: 4.8, 小麦: 2.6, 马铃薯: 2.2 };
export interface ProductPrice { price: number | null; origin: PriceSource }

export function productCropOptions(observed: readonly string[] = []): string[] {
  return [...new Set([...PRODUCT_CROPS, ...observed.filter(crop => /^[\u4e00-\u9fa5A-Za-z0-9·\-]{1,12}$/.test(crop))])];
}

export function productPriceFor(city: string, crop: string, observation?: MarketObservation): ProductPrice {
  if (!isStudyCity(city)) return { price: null, origin: 'unavailable' };
  if (observation?.cityId === city && observation.available && observation.selectedCrop === crop) {
    const latest = observation.series.find(series => series.crop === crop)?.observations.at(-1)?.pricePerKg;
    if (latest !== undefined && Number.isFinite(latest) && latest >= 0) return { price: latest, origin: 'market_api' };
  }
  const price = Object.hasOwn(FALLBACK_PRICES, crop) ? FALLBACK_PRICES[crop] : null;
  return { price, origin: price === null ? 'unavailable' : 'product_fallback' };
}

/** One product schema across all six cities. Origin stays available to logs/export. */
export interface CityDecisionData {
  city: StudyCityId;
  crop: string;
  price: number;
  result: PlanningResult;
  risk: OperatingRisk;
  suggestion: string;
  reasons: string[];
  salesWindow: { start: string; end: string } | null;
  budget: { available: number | null; shortfall: number };
  origin: {
    price: PriceSource;
    profit: 'user_conditions_formula';
    risk: 'budget_and_sensitivity';
    window: 'user_sale_date' | 'not_selected';
  };
}

export function createCityDecisionData(input: {
  city: string; crop: string; conditions: PlanningInputs; budgetCny?: number | null;
  target?: RiskPreference; saleDate?: string; priceSource?: PriceSource;
}): CityDecisionData | null {
  const { city, crop, conditions } = input;
  if (!isStudyCity(city) || !crop) return null;
  const result = calculatePlanning(conditions);
  const sensitivity = planningSensitivity(conditions);
  const budget = input.budgetCny ?? null;
  if (!result || !sensitivity || budget !== null && (!Number.isFinite(budget) || budget < 0)) return null;
  const shortfall = budget === null ? 0 : Math.max(0, result.costCny - budget);
  const adverseLoss = sensitivity.some(line => line.points.some(point => point.profitCny < 0));
  const risk: OperatingRisk = shortfall > 0 || result.profitCny <= 0 ? '高' : adverseLoss ? '中等' : '低';
  const reasons = shortfall > 0
    ? ['当前投入超过可用预算，优先缩减面积或降低每亩成本。']
    : result.profitCny <= 0
      ? ['当前销售收入未覆盖投入，优先调整成本、价格或销售比例。']
      : adverseLoss
        ? ['当前条件有盈利空间；价格、亩产或成本变化可能使利润转负，预留资金应对波动。']
        : ['当前条件及单项不利变化下仍有盈利空间，可按计划安排生产。'];
  if (input.target === 'conservative' && risk !== '低') reasons.push('优先控制投入，确保销售价格高于保本价格。');
  if (input.target === 'aggressive' && result.profitCny > 0) reasons.push('优先保障可销售产量和销售比例，提高单位面积收益。');
  const salesWindow = validPlanningSaleDate(input.saleDate) ? { start: input.saleDate, end: input.saleDate } : null;
  return {
    city, crop, price: conditions.pricePerKg, result, risk,
    suggestion: shortfall > 0 ? '调整种植规模' : result.profitCny <= 0 ? '先控制投入' : input.target === 'conservative' ? '控制成本，按计划生产' : input.target === 'aggressive' ? '保障产量与销售' : '按计划安排生产',
    reasons, salesWindow, budget: { available: budget, shortfall },
    origin: {
      price: input.priceSource ?? 'user', profit: 'user_conditions_formula', risk: 'budget_and_sensitivity',
      window: salesWindow ? 'user_sale_date' : 'not_selected',
    },
  };
}
