import type { DailyCrop, DailyFreshness, DailyModelStatus, DailySignal, DailySnapshot } from './types';

const DAY_MS = 86_400_000;
const FRESHNESS: DailyFreshness[] = ['FRESH', 'DELAYED', 'STALE', 'MISSING'];
const SIGNALS: DailySignal[] = ['NORMAL', 'WATCH', 'HIGH', 'VERY_HIGH', 'UNKNOWN'];
const MODEL_STATUSES: DailyModelStatus[] = ['FINAL', 'PARTIAL', 'MODEL_UNAVAILABLE', 'LEGACY_FALLBACK'];
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nullableNumber = (value: unknown): value is number | null => value === null || finite(value);
const nullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
const isFreshness = (value: unknown): value is DailyFreshness => FRESHNESS.includes(value as DailyFreshness);
const modelStatus = (value: unknown): value is DailyModelStatus | null => value === null || MODEL_STATUSES.includes(value as DailyModelStatus);
const score = (value: unknown) => nullableNumber(value) && (value === null || value >= 0 && value <= 100);

function dateEpoch(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const epoch = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(epoch) && new Date(epoch).toISOString().slice(0, 10) === value ? epoch : null;
}
/** Business calendar days are Shanghai dates; compare their UTC midnights. */
export function shanghaiDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
/** Thresholds come from data/daily/config.py freshness_for_age (schema 1.1.0). */
export function freshnessForAge(age: number | null): DailyFreshness {
  if (age === null) return 'MISSING';
  if (age <= 0) return 'FRESH';
  if (age <= 2) return 'DELAYED';
  if (age <= 7) return 'STALE';
  return 'MISSING';
}
function ageForDate(dataDate: string | null, asOf: string): number | null {
  return dataDate === null ? null : Math.max(0, Math.floor((dateEpoch(asOf)! - dateEpoch(dataDate)!) / DAY_MS));
}
function sourceUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
}

/** Validate the published schema before adapting it; null never becomes zero. */
export function adaptDailySnapshot(raw: unknown, now = new Date()): DailySnapshot {
  const fail = (): never => { throw new Error('市场数据格式不完整，暂时无法显示。'); };
  if (!record(raw) || raw.schema_version !== '1.1.0' || raw.city !== '沈阳' || raw.timezone !== 'Asia/Shanghai') return fail();
  if (!['complete', 'partial', 'failed'].includes(String(raw.status)) || !isFreshness(raw.data_freshness) || dateEpoch(raw.date) === null) return fail();
  if (!(raw.latest_data_date === null || dateEpoch(raw.latest_data_date) !== null) || typeof raw.crawl_status !== 'string') return fail();
  if (raw.contract_valid === false || raw.recommendation !== null || !Array.isArray(raw.crops) || !Array.isArray(raw.sources)) return fail();
  for (const key of ['daily_pipeline_version', 'data_version', 'model_version', 'generated_at']) if (typeof raw[key] !== 'string' || !raw[key]) return fail();
  if (raw.snapshot_hash !== undefined && !nullableString(raw.snapshot_hash)) return fail();
  const model = record(raw.model) ? raw.model : {};
  const overallModelStatus = model.model_status ?? null;
  if (!modelStatus(overallModelStatus) || !nullableString(model.final_code_fingerprint ?? null)) return fail();
  // The response can be older than today's published data; never preserve a stale FRESH label.
  const asOf = [raw.date as string, shanghaiDate(now)].sort().at(-1)!;
  const latestDataDate = raw.latest_data_date as string | null;
  if (latestDataDate && latestDataDate > asOf) return fail();
  const sources = raw.sources.map(source => {
    if (!record(source) || typeof source.source_id !== 'string' || !source.source_id || typeof source.name !== 'string' || !sourceUrl(source.url) || source.price_level !== 'wholesale' || source.city !== '沈阳') return fail();
    return { id: source.source_id, name: source.name, url: source.url, priceLevel: 'wholesale' as const };
  });
  const ids = new Set<string>();
  const crops = raw.crops.map((crop): DailyCrop => {
    if (!record(crop) || typeof crop.crop !== 'string' || !crop.crop.trim() || crop.crop.trim() !== crop.crop || ids.has(crop.crop)) return fail();
    ids.add(crop.crop);
    if (crop.price_level !== 'wholesale' || crop.unit !== '元/公斤' || !(crop.data_date === null || dateEpoch(crop.data_date) !== null) || !isFreshness(crop.data_freshness)) return fail();
    if (typeof crop.data_date === 'string' && (crop.data_date > asOf || !latestDataDate || crop.data_date > latestDataDate)) return fail();
    if (!nullableNumber(crop.latest_price) || (crop.latest_price !== null && crop.latest_price <= 0)) return fail();
    for (const key of ['change_1d', 'change_7d', 'change_30d']) if (!nullableNumber(crop[key]) || (crop[key] !== null && (crop[key] as number) < -1)) return fail();
    if (!nullableNumber(crop.historical_percentile) || (crop.historical_percentile !== null && (crop.historical_percentile < 0 || crop.historical_percentile > 1))) return fail();
    if (![crop.hri, crop.market_risk, crop.confidence].every(score) || !strings(crop.warnings) || !nullableString(crop.source)) return fail();
    if (crop.source !== null && !sources.some(source => source.id === crop.source)) return fail();
    if (!(crop.daily_signal === null || SIGNALS.includes(crop.daily_signal as DailySignal)) || !modelStatus(crop.model_status ?? null) || !nullableString(crop.final_status ?? null)) return fail();
    return {
      crop: crop.crop, dataDate: crop.data_date as string | null, pricePerKg: crop.latest_price,
      changePreviousObservation: crop.change_1d as number | null, change7d: crop.change_7d as number | null, change30d: crop.change_30d as number | null,
      historicalPercentile: crop.historical_percentile, hri: crop.hri as number | null, marketRisk: crop.market_risk as number | null,
      signal: crop.daily_signal as DailySignal | null, confidence: crop.confidence as number | null, warnings: [...crop.warnings], sourceId: crop.source,
      freshness: freshnessForAge(ageForDate(crop.data_date as string | null, asOf)), sourceFreshness: crop.data_freshness,
      modelStatus: (crop.model_status ?? null) as DailyModelStatus | null, finalStatus: (crop.final_status ?? null) as string | null,
    };
  });
  const ageDays = ageForDate(latestDataDate, asOf);
  return {
    cityId: 'shenyang', city: '沈阳', status: raw.status as DailySnapshot['status'], runDate: raw.date as string,
    latestDataDate, ageDays, freshness: freshnessForAge(ageDays), sourceFreshness: raw.data_freshness, crops, sources,
    sourceMeta: {
      schemaVersion: '1.1.0', pipelineVersion: raw.daily_pipeline_version as string, dataVersion: raw.data_version as string,
      modelVersion: raw.model_version as string, modelStatus: overallModelStatus, generatedAt: raw.generated_at as string,
      snapshotHash: (raw.snapshot_hash ?? null) as string | null, finalCodeFingerprint: (model.final_code_fingerprint ?? null) as string | null,
    },
  };
}

export function findDailyCrop(snapshot: DailySnapshot, canonicalCrop: string): DailyCrop | null {
  return snapshot.crops.find(crop => crop.crop === canonicalCrop) ?? null;
}
