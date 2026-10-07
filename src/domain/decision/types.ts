/** UI-facing contract. Model schemas are adapted at the Provider boundary. */
export const DECISION_CONTRACT_VERSION = '1' as const;
export type RiskPreference = 'conservative' | 'balanced' | 'aggressive';
export interface DateWindow { start: string; end: string }
interface UserContext {
    city_id: string;
    area_mu: number;
    budget_cny: number;
    risk_preference: RiskPreference;
    crop_preferences: string[];
    actual_inputs: Record<string, { cost_per_mu: number | null; yield_kg_per_mu: number | null }>;
}
interface InputSource { kind: 'structured' | 'natural_language'; text?: string }
/** v0 is retained only for explicit historical demos. */
export interface LegacyDecisionRequest {
  contract_version:'0';
  user_context:UserContext & {planting_window:DateWindow;harvest_window:DateWindow};
  input_source:InputSource;
}
export interface FinalDecisionRequest {
  contract_version:'1';
  user_context:UserContext & {market_context:{as_of:string;horizon_days:number;harvest_date:string|null}};
  input_source:InputSource;
}
export type DecisionRequest=LegacyDecisionRequest|FinalDecisionRequest;
export type DataStatus = 'legacy_model_fixture' | 'mock' | 'model';
export type DecisionIssue = 'high_risk' | 'low_confidence' | 'insufficient_market_data' | 'proxy_only' | 'no_clear_winner' | 'scenario_only' | 'partial_result' | 'user_input_required' | 'no_feasible_plan' | 'no_feasible_window' | 'no_diversification_benefit';
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
  level: 'high' | 'medium' | 'low' | 'unknown' | 'reported';
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
  profit_basis?:'user_input'|'reference'|'missing';
  confidence_components?:Partial<Record<'price'|'profit'|'risk'|'data',Confidence>>;
  market_context?:{as_of:string;horizon_days:number;scenario_only:boolean;range_status:string;harvest_date:string|null};
  model_status?:string;
}
export interface DecisionResult {
  contract_version: '0'|'1';
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
  model_status?:string;
  code_fingerprint?:string;
}
export interface DecisionCapability {
  city_id:string;tier:string;supported:boolean;
  crops:{id:string;label:string;horizons:{days:number;mode:'model'|'scenario_only'}[]}[];
  market_as_of:string|null;model_version:string;data_version:string;code_fingerprint:string;limitation:string|null;
}
export interface DecisionProvider {
  readonly data_mode?: 'fixtures' | 'mock' | 'api';
  listSamples?(options?: { signal?: AbortSignal }): Promise<{id:string;label:string;request:DecisionRequest}[]>;
  decide(request: DecisionRequest, options?: { signal?: AbortSignal }): Promise<DecisionResult>;
  capabilities?(cityId:string,options?:{signal?:AbortSignal}):Promise<DecisionCapability>;
  stress?(request:DecisionRequest,candidate:DecisionCandidate,changes:StressScenario['changes'],options?:{signal?:AbortSignal}):Promise<StressScenario>;
}
