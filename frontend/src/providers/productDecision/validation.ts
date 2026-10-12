import { isStudyCity } from '../../domain/geography/cities';
import { calculatePlanning, validPlanningSaleDate } from '../../domain/decision/planning';
import { cropIdentity } from '../../domain/decision/cropIdentity';
import type { ProductDecisionRequest, ProductDecisionResponse, ProductSalesWindow } from '../../domain/decision/productApi';

const FAIL = '返回的农业决策与当前条件不一致。';
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nonnegative = (value: unknown): value is number => finite(value) && value >= 0;
const cropName = (value: unknown): value is string => typeof value === 'string' && /^[\u4e00-\u9fffA-Za-z0-9·\-]{1,12}$/.test(value);
const nullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';
const nullableDate = (value: unknown): value is string | null => value === null || validPlanningSaleDate(value);
const reasons = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim().length > 0 && item.length <= 500);
const windowValid = (value: unknown): value is ProductSalesWindow | null => value === null || record(value)
  && Object.keys(value).length === 2 && validPlanningSaleDate(value.start) && validPlanningSaleDate(value.end) && value.start <= value.end;
const near = (a: number, b: number, rounded = false) => Math.abs(a - b) <= (rounded ? .011 : 1e-8) + Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)) * 8;

/** Sorted UTF-8 JSON with binary64 numbers matches the server exactly. */
export function canonicalProductRequest(value: unknown): string {
  if (typeof value === 'number') {
    const bytes = new DataView(new ArrayBuffer(8)); bytes.setFloat64(0, value === 0 ? 0 : value);
    const hex = [...new Uint8Array(bytes.buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return `{"$number":"${hex}"}`;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalProductRequest).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalProductRequest(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function validateProductRequest(value: unknown): asserts value is ProductDecisionRequest {
  const keys = ['contract_version', 'city_id', 'crop', 'area_mu', 'budget_cny', 'target', 'sale_date', 'yield_kg_per_mu', 'cost_per_mu', 'sale_price_per_kg', 'sale_fraction', 'price_is_user', 'as_of'];
  if (!record(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))
    || value.contract_version !== 'product-1' || typeof value.city_id !== 'string' || !isStudyCity(value.city_id) || !cropName(value.crop)
    || !finite(value.area_mu) || value.area_mu <= 0 || !(value.budget_cny === null || nonnegative(value.budget_cny))
    || !['balanced', 'conservative', 'aggressive'].includes(String(value.target)) || !nullableDate(value.sale_date) || !nullableDate(value.as_of)
    || ![value.yield_kg_per_mu, value.cost_per_mu, value.sale_price_per_kg, value.sale_fraction].every(nonnegative)
    || Number(value.sale_fraction) > 1 || typeof value.price_is_user !== 'boolean') throw new Error(FAIL);
  if (!calculatePlanning({ areaMu: value.area_mu, yieldKgPerMu: value.yield_kg_per_mu as number, costPerMu: value.cost_per_mu as number,
    pricePerKg: value.sale_price_per_kg as number, saleFraction: value.sale_fraction as number })) throw new Error(FAIL);
}

export async function productContextHash(request: ProductDecisionRequest): Promise<string> {
  validateProductRequest(request);
  const bytes = new TextEncoder().encode(canonicalProductRequest(request));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** No returned amount is accepted without redoing the operating accounts. */
export async function validateProductResponse(raw: unknown, expected: ProductDecisionRequest): Promise<ProductDecisionResponse> {
  validateProductRequest(expected);
  if (!record(raw) || raw.contract_version !== 'product-1') throw new Error(FAIL);
  validateProductRequest(raw.request);
  if (canonicalProductRequest(raw.request) !== canonicalProductRequest(expected)
    || typeof raw.context_hash !== 'string' || !/^[a-f0-9]{64}$/.test(raw.context_hash)
    || raw.context_hash !== await productContextHash(expected) || !Array.isArray(raw.candidates)
    || !record(raw.recommendation) || !nullableString(raw.recommendation.candidate_id) || !reasons(raw.recommendation.reasons)
    || !record(raw.origin)) throw new Error(FAIL);
  const origin = raw.origin;
  if (origin.target_city !== expected.city_id || !(origin.source_city === null || typeof origin.source_city === 'string' && isStudyCity(origin.source_city))
    || !['local_model', 'shenyang_reference', 'formula'].includes(String(origin.route)) || !nullableString(origin.model_id)
    || !nullableString(origin.transfer_policy) || typeof origin.llm_used !== 'boolean' || !Array.isArray(origin.forecasts)
    || origin.data_version !== undefined && (typeof origin.data_version !== 'string' || !origin.data_version)) throw new Error(FAIL);
  if (origin.route === 'local_model' && origin.source_city !== expected.city_id
    || origin.route === 'shenyang_reference' && (origin.source_city !== 'shenyang' || expected.city_id === 'shenyang' || !origin.transfer_policy)
    || origin.route === 'formula' && (origin.source_city !== null || origin.model_id !== null || origin.forecasts.length)) throw new Error(FAIL);
  for (const forecast of origin.forecasts) {
    if (!record(forecast) || typeof forecast.source_city !== 'string' || !isStudyCity(forecast.source_city)
      || ![expected.city_id, 'shenyang'].includes(forecast.source_city) || !validPlanningSaleDate(forecast.model_as_of)
      || expected.as_of !== null && forecast.model_as_of > expected.as_of || !Number.isInteger(forecast.horizon_days)
      || !nonnegative(forecast.price_per_kg) || forecast.price_per_kg === 0 || !nullableString(forecast.price_level)
      || !nullableString(forecast.method) || typeof forecast.model_id !== 'string' || !forecast.model_id || !windowValid(forecast.window)
      || ![forecast.price_low, forecast.price_high].every(value => value === null || nonnegative(value))
      || finite(forecast.price_low) && forecast.price_low > forecast.price_per_kg
      || finite(forecast.price_high) && forecast.price_high < forecast.price_per_kg) throw new Error(FAIL);
    const nodes = forecast.target_type === 'next_window_market_average' ? [7, 14, 30] : forecast.target_type === 'harvest_market_price' ? [30, 60, 90, 120, 150, 180] : [];
    if (!nodes.includes(Number(forecast.horizon_days)) || forecast.target_type === 'next_window_market_average' && forecast.window !== null) throw new Error(FAIL);
  }
  const forecasts = origin.forecasts as unknown[];
  if (origin.window_choices !== undefined && (!Array.isArray(origin.window_choices) || origin.window_choices.length > 6
    || origin.window_choices.some(window => !windowValid(window) || window === null || !forecasts.some(forecast => record(forecast) && canonicalProductRequest(forecast.window) === canonicalProductRequest(window))))) throw new Error(FAIL);
  const ids = new Set<string>();
  for (const candidate of raw.candidates) {
    if (!record(candidate) || typeof candidate.id !== 'string' || !candidate.id || candidate.id.length > 100 || ids.has(candidate.id)
      || !cropName(candidate.crop) || cropIdentity(candidate.crop) !== cropIdentity(expected.crop)
      || !finite(candidate.area_mu) || candidate.area_mu <= 0 || candidate.area_mu > expected.area_mu + 1e-8
      || !nonnegative(candidate.price_per_kg) || !(candidate.horizon_days === null || Number.isInteger(candidate.horizon_days))
      || !windowValid(candidate.sales_window) || ![candidate.revenue_cny, candidate.cost_cny].every(nonnegative)
      || !finite(candidate.profit_cny) || !(candidate.break_even_price === null || nonnegative(candidate.break_even_price))
      || !['低', '中等', '高'].includes(String(candidate.risk)) || !reasons(candidate.reasons)) throw new Error(FAIL);
    ids.add(candidate.id);
    const accounts = calculatePlanning({ areaMu: candidate.area_mu, yieldKgPerMu: expected.yield_kg_per_mu, costPerMu: expected.cost_per_mu,
      pricePerKg: candidate.price_per_kg, saleFraction: expected.sale_fraction });
    if (!accounts || !near(candidate.revenue_cny as number, accounts.revenueCny, true) || !near(candidate.cost_cny as number, accounts.costCny, true)
      || !near(candidate.profit_cny, accounts.profitCny, true) || (accounts.breakEvenPrice === null ? candidate.break_even_price !== null
        : !finite(candidate.break_even_price) || !near(candidate.break_even_price, accounts.breakEvenPrice))
      || expected.budget_cny !== null && accounts.costCny > expected.budget_cny + .011
      || expected.price_is_user && candidate.price_per_kg !== expected.sale_price_per_kg) throw new Error(FAIL);
    const wantedWindow = expected.sale_date ? { start: expected.sale_date, end: expected.sale_date } : null;
    if (expected.sale_date && canonicalProductRequest(candidate.sales_window) !== canonicalProductRequest(wantedWindow)) throw new Error(FAIL);
    if (candidate.horizon_days !== null) {
      const matching = origin.forecasts.some(forecast => record(forecast) && forecast.horizon_days === candidate.horizon_days
        && forecast.price_per_kg === candidate.price_per_kg && (expected.sale_date !== null || canonicalProductRequest(forecast.window) === canonicalProductRequest(candidate.sales_window)));
      if (!matching) throw new Error(FAIL);
    } else if (candidate.price_per_kg !== expected.sale_price_per_kg || !expected.sale_date && candidate.sales_window !== null) throw new Error(FAIL);
  }
  if (raw.recommendation.candidate_id !== null && !ids.has(raw.recommendation.candidate_id)
    || raw.candidates.length > 0 && raw.recommendation.candidate_id === null) throw new Error(FAIL);
  return structuredClone(raw) as unknown as ProductDecisionResponse;
}
