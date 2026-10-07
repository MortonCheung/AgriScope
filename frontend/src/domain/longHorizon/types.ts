/** Long-Horizon 契约类型（后端 /api/forecast/*，schema lh_forecast_v1）。 */

export type LongHorizonStatus = 'PRODUCTION_POINT' | 'PRODUCTION_SCENARIO' | 'SCENARIO_ONLY' | 'EXPLORATORY_SCENARIO_ONLY' | 'RESEARCH_ONLY';
export type TargetType = 'harvest_market_price' | 'cycle_market_average';
export interface LongHorizonFreshness {
  status: 'CURRENT' | 'LONG_HORIZON_STALE' | 'DAILY_UNAVAILABLE';
  dailyLatestDataDate: string | null;
  longHorizonAsOf: string | null;
  dailyDelayed: boolean;
}
export interface TargetEstimate {
  targetType: TargetType;
  pointForecast: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  rangeType: RangeType;
  productionStatus: LongHorizonStatus;
  confidence: string | null;
  method: string | null;
  actualMethod: string | null;
  fallbackUsed: boolean;
  available: boolean;
  anchorDate?: string | null;
  modelDisagreementPct?: number | null;
  window: { definition: string; startOffset: number; endOffsetExclusive: number } | null;
}
export type RangeType = 'scenario_range' | 'prediction_interval';
export type ForecastSource = 'seasonal' | 'long_horizon_model' | 'scenario_only';

export interface LongHorizonHorizonCap {
  days: number;
  method: string | null;
  confidence: string | null;
  rangeType: RangeType;
  productionStatus: LongHorizonStatus;
  nNonoverlap: number;
}

export interface LongHorizonCropCap {
  id: string;
  label: string;
  horizons: LongHorizonHorizonCap[];
}

export interface LongHorizonCapability {
  cityId: string;
  supported: boolean;
  crops: LongHorizonCropCap[];
  asOf: string | null;
  horizons: number[];
  modelVersion: string;
  dataVersion: string;
  limitation: string | null;
  freshness?: LongHorizonFreshness;
}

/** N 天窗口均价的情景化估计 —— 不是第 N 天的点位预测。 */
export interface LongHorizonEntry {
  crop: string;
  horizon: number;
  pointForecast: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  rangeType: RangeType;
  productionStatus: LongHorizonStatus;
  confidence: string | null;
  method: string | null;
  unit: string;
  source: ForecastSource;
  modelDisagreementPct: number | null;
  fallbackUsed: boolean;
  asOf: string | null;
  anchorDate: string | null;
  available: boolean;
  notes: string[];
  targetType?: TargetType;
  targets?: Record<TargetType, TargetEstimate>;
  actualMethod?: string | null;
  freshness?: LongHorizonFreshness;
  llmStatus?: string;
}

export interface LongHorizonRequest {
  cityId: string;
  crop: string;
  horizonDays: number;
}

export interface LongHorizonProvider {
  capabilities(cityId: string, options?: { signal?: AbortSignal }): Promise<LongHorizonCapability>;
  forecast(input: LongHorizonRequest, options?: { signal?: AbortSignal }): Promise<LongHorizonEntry>;
}

export type LongHorizonState =
  | { status: 'loading' }
  | { status: 'unsupported' }
  | { status: 'error'; error: string }
  | { status: 'awaiting_selection'; capability: LongHorizonCropCap }
  | { status: 'ready'; data: LongHorizonEntry; capability: LongHorizonCropCap };

export interface LongHorizonDecisionRequest {
  contract_version: '2';
  user_context: {
    city_id: string; area_mu: number; budget_cny: number;
    risk_preference: 'conservative' | 'balanced' | 'aggressive';
    crop_preferences: string[];
    actual_inputs: Record<string, { cost_per_mu: number | null; yield_kg_per_mu: number | null }>;
    market_context: { as_of?: string; expected_harvest_horizon_days?: number; expected_harvest_date?: string | null };
  };
  input_source: { kind: 'structured' };
}
export interface LongHorizonDecisionCandidate {
  crop: string; area_mu: number; available: boolean;
  targets: Record<TargetType, TargetEstimate>;
  price: { low: number | null; base: number | null; high: number | null; unit: 'CNY/kg'; basis: 'harvest_market_price' };
  profit: { available: boolean; low: number | null; base: number | null; high: number | null; basis: 'user_input' | 'missing'; scenario_only: boolean };
  budget_feasible: boolean | null;
  harvest_relative_to_current: number | null;
  current_market_context: { as_of: string | null; current_price: number | null; hri: number | null; market_risk: number | null; semantics: string;
    source?: string; hri_level?: string | null; market_risk_level?: string | null;
    climate_exposure?: { available: boolean; value: number | null; reason: string; semantics: string } };
  freshness: LongHorizonFreshness;
  warnings: string[];
  actual_method: string | null; fallback_used: boolean;
  model_disagreement?: Record<string, unknown>;
  production_status: LongHorizonStatus; confidence: string | null;
}
export interface LongHorizonDecisionResult {
  contract_version: '2'; request: LongHorizonDecisionRequest;
  status: 'SCENARIO_ONLY' | 'NO_FEASIBLE_PLAN';
  market_as_of: string; horizon_days: number; expected_harvest_date: string;
  candidates: LongHorizonDecisionCandidate[];
  ranking_basis: 'profit_scenario' | 'harvest_relative_market_environment';
  ranking: { crop: string; score: number }[];
  recommendation: { crop: string | null; strength: 'weak'; reason: string };
  freshness: LongHorizonFreshness; llm_status: string;
  model_version: string; data_version: string; warnings: string[];
  risk_preference_usage?: { selected: string; ranking_rule: string; future_risk_weighting: boolean; note: string };
}
