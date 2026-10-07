/** UI-facing contract. Model schemas are adapted at the Provider boundary. */
export const DECISION_CONTRACT_VERSION = '0' as const;
export type RiskPreference = 'conservative' | 'balanced' | 'aggressive';
export interface DateWindow { start: string; end: string }
export interface DecisionRequest {
  contract_version: typeof DECISION_CONTRACT_VERSION;
  user_context: {
    city_id: string;
    area_mu: number;
    budget_cny: number;
    risk_preference: RiskPreference;
    planting_window: DateWindow;
    harvest_window: DateWindow;
    crop_preferences: string[];
    actual_inputs: Record<string, { cost_per_mu: number | null; yield_kg_per_mu: number | null }>;
  };
  input_source: { kind: 'structured' | 'natural_language'; text?: string };
}
export type DataStatus = 'legacy_model_fixture' | 'mock' | 'model';
export type DecisionIssue = 'high_risk' | 'low_confidence' | 'insufficient_market_data' | 'proxy_only' | 'no_clear_winner' | 'scenario_only' | 'partial_result';
export interface ScenarioRange {
  low: number | null;
  base: number | null;
  high: number | null;
  unit: 'CNY' | 'CNY/kg' | 'ratio';
  semantics: 'historical_seasonal_scenario' | 'model_scenario' | 'formula_scenario';
  is_calibrated_interval: boolean;
  is_mock: boolean;
}
export interface Confidence {
  score: number | null;
  grade: 'A' | 'B' | 'C' | 'D' | null;
  level: 'high' | 'medium' | 'low' | 'unknown';
  basis: string;
  is_mock: boolean;
}
export type Strategy = 'balanced' | 'return' | 'robust' | 'low_risk' | 'alternative';
export interface StressScenario {
  id: string;
  label: string;
  changes: { price_pct: number; yield_pct: number; cost_pct: number; delay_days: number };
  profit: ScenarioRange;
  roi: number | null;
  delta_cny: number | null;
  is_mock: boolean;
  note: string;
}
export interface DecisionCandidate {
  id: string;
  crop: string;
  area_mu: number;
  planting_window: DateWindow | null;
  harvest_window: DateWindow;
  strategies: Strategy[];
  price: ScenarioRange;
  profit: ScenarioRange;
  roi: ScenarioRange;
  break_even_price: number | null;
  inputs: { cost_per_mu: number | null; yield_kg_per_mu: number | null; cost_source: string; yield_source: string };
  risks: { hri: number | null; market_risk: number | null; climate_exposure: number | null };
  confidence: Confidence;
  reasons: string[];
  warnings: string[];
  data_quality: { label: string; proxy_flags: string[]; mock_fields: string[] };
  evidence: { city_id: string; research_id: string; label: string; role: 'background' | 'input' }[];
  stress_scenarios: StressScenario[];
}
export interface DecisionResult {
  contract_version: typeof DECISION_CONTRACT_VERSION;
  status: 'ok' | 'no_data' | 'user_input_required' | 'model_error';
  request: DecisionRequest;
  candidates: DecisionCandidate[];
  recommendation: { candidate_id: string | null; confidence: Confidence; reasons: string[] };
  issues: DecisionIssue[];
  warnings: string[];
  assumptions: string[];
  model_version: string;
  data_version: string;
  data_status: DataStatus;
  fixture_id: string | null;
}
export interface DecisionProvider {
  readonly data_mode?: 'fixtures' | 'mock' | 'api';
  listSamples?(options?: { signal?: AbortSignal }): Promise<{id:string;label:string;request:DecisionRequest}[]>;
  decide(request: DecisionRequest, options?: { signal?: AbortSignal }): Promise<DecisionResult>;
}
