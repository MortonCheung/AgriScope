/** Daily is market context, never a second recommendation engine. */
export type DailyFreshness = 'FRESH' | 'DELAYED' | 'STALE' | 'MISSING';
export type DailySignal = 'NORMAL' | 'WATCH' | 'HIGH' | 'VERY_HIGH' | 'UNKNOWN';
export type DailyModelStatus = 'FINAL' | 'PARTIAL' | 'MODEL_UNAVAILABLE' | 'LEGACY_FALLBACK';

export interface DailySource {
  id: string;
  name: string;
  url: string;
  priceLevel: 'wholesale';
}
export interface DailyCrop {
  /** Exact canonical name supplied by Daily; no fuzzy crop matching. */
  crop: string;
  dataDate: string | null;
  pricePerKg: number | null;
  changePreviousObservation: number | null;
  change7d: number | null;
  change30d: number | null;
  historicalPercentile: number | null;
  hri: number | null;
  marketRisk: number | null;
  signal: DailySignal | null;
  confidence: number | null;
  warnings: string[];
  sourceId: string | null;
  freshness: DailyFreshness;
  sourceFreshness: DailyFreshness;
  modelStatus: DailyModelStatus | null;
  finalStatus: string | null;
}
export interface DailySnapshot {
  cityId: 'shenyang';
  city: '沈阳';
  status: 'complete' | 'partial' | 'failed';
  runDate: string;
  latestDataDate: string | null;
  freshness: DailyFreshness;
  sourceFreshness: DailyFreshness;
  ageDays: number | null;
  crops: DailyCrop[];
  sources: DailySource[];
  sourceMeta: {
    schemaVersion: '1.1.0';
    pipelineVersion: string;
    dataVersion: string;
    modelVersion: string;
    modelStatus: DailyModelStatus | null;
    generatedAt: string;
    snapshotHash: string | null;
    finalCodeFingerprint: string | null;
  };
}
export interface DailyProvider {
  latest(cityId: string, options?: { signal?: AbortSignal }): Promise<DailySnapshot>;
}
export type DailyState =
  | { status: 'loading' }
  | { status: 'unsupported' }
  | { status: 'ready'; data: DailySnapshot }
  | { status: 'error'; error: string };
