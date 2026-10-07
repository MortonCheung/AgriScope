/** Long-Horizon 契约类型（后端 /api/forecast/*，schema lh_forecast_v1）。 */

export type LongHorizonStatus = 'PRODUCTION_POINT' | 'SCENARIO_ONLY' | 'EXPLORATORY_SCENARIO_ONLY';
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
  | { status: 'ready'; data: LongHorizonEntry; capability: LongHorizonCropCap };