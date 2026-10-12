import type { StudyCityId } from '../geography/cities';
import type { OperatingRisk } from './productDecision';
import type { RiskPreference } from './types';

/** Separate product contract; the frozen Final v1 and harvest v2 remain untouched. */
export interface ProductDecisionRequest {
  contract_version: 'product-1';
  city_id: StudyCityId;
  crop: string;
  area_mu: number;
  budget_cny: number | null;
  target: RiskPreference;
  sale_date: string | null;
  yield_kg_per_mu: number;
  cost_per_mu: number;
  sale_price_per_kg: number;
  sale_fraction: number;
  price_is_user: boolean;
  as_of: string | null;
}
export interface ProductSalesWindow { start: string; end: string }
export interface ProductDecisionCandidate {
  id: string;
  crop: string;
  area_mu: number;
  price_per_kg: number;
  horizon_days: number | null;
  sales_window: ProductSalesWindow | null;
  revenue_cny: number;
  cost_cny: number;
  profit_cny: number;
  break_even_price: number | null;
  risk: OperatingRisk;
  reasons: string[];
}
export interface ProductModelForecast {
  source_city: StudyCityId;
  model_as_of: string;
  horizon_days: number;
  price_per_kg: number;
  price_low: number | null;
  price_high: number | null;
  price_level: string | null;
  method: string | null;
  model_id: string;
  target_type: 'next_window_market_average' | 'harvest_market_price';
  window: ProductSalesWindow | null;
}
export interface ProductDecisionOrigin {
  source_city: StudyCityId | null;
  target_city: StudyCityId;
  route: 'local_model' | 'shenyang_reference' | 'formula';
  model_id: string | null;
  transfer_policy: string | null;
  llm_used: boolean;
  forecasts: ProductModelForecast[];
  window_choices?: ProductSalesWindow[];
  data_version?: string;
  [key: string]: unknown;
}
export interface ProductDecisionResponse {
  contract_version: 'product-1';
  request: ProductDecisionRequest;
  context_hash: string;
  candidates: ProductDecisionCandidate[];
  recommendation: { candidate_id: string | null; reasons: string[] };
  origin: ProductDecisionOrigin;
}
export interface ProductDecisionProvider {
  decide(request: ProductDecisionRequest, options?: { signal?: AbortSignal }): Promise<ProductDecisionResponse>;
  /** Only validated, unexpired responses can be returned here. */
  peek?(request: ProductDecisionRequest): ProductDecisionResponse | null;
}
