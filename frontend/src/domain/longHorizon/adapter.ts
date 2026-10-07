import type {
  ForecastSource, LongHorizonCapability, LongHorizonCropCap, LongHorizonEntry,
  LongHorizonStatus, RangeType,
} from './types';

const STATUSES: LongHorizonStatus[] = ['PRODUCTION_POINT', 'SCENARIO_ONLY', 'EXPLORATORY_SCENARIO_ONLY'];
const RANGE_TYPES: RangeType[] = ['scenario_range', 'prediction_interval'];
const SOURCES: ForecastSource[] = ['seasonal', 'long_horizon_model', 'scenario_only'];

const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nullableNumber = (v: unknown): v is number | null => v === null || finite(v);
const nullableString = (v: unknown): v is string | null => v === null || typeof v === 'string';
const isStatus = (v: unknown): v is LongHorizonStatus => STATUSES.includes(v as LongHorizonStatus);
const isRangeType = (v: unknown): v is RangeType => RANGE_TYPES.includes(v as RangeType);
const isSource = (v: unknown): v is ForecastSource => SOURCES.includes(v as ForecastSource);

const FAIL = '长期预测数据格式不完整，暂时无法显示。';

/** 校验 `/api/forecast/capabilities` 响应。 */
export function adaptForecastCapability(raw: unknown): LongHorizonCapability {
  const fail = (): never => { throw new Error(FAIL); };
  if (!record(raw)) return fail();
  if (typeof raw.city_id !== 'string' || typeof raw.supported !== 'boolean') return fail();
  if (!nullableString(raw.as_of) || !nullableString(raw.limitation)) return fail();
  if (typeof raw.model_version !== 'string' || typeof raw.data_version !== 'string') return fail();
  if (!Array.isArray(raw.horizons) || !raw.horizons.every(item => Number.isInteger(item))) return fail();
  if (!Array.isArray(raw.crops)) return fail();
  const crops: LongHorizonCropCap[] = raw.crops.map((crop): LongHorizonCropCap => {
    if (!record(crop) || typeof crop.id !== 'string' || !crop.id || typeof crop.label !== 'string') return fail();
    if (!Array.isArray(crop.horizons)) return fail();
    const horizons = crop.horizons.map((h): LongHorizonCropCap['horizons'][number] => {
      if (!record(h) || !Number.isInteger(h.days) || !isStatus(h.production_status) || !isRangeType(h.range_type)) return fail();
      if (!nullableString(h.method) || !nullableString(h.confidence)) return fail();
      if (!Number.isInteger(h.n_nonoverlap)) return fail();
      return {
        days: h.days as number, method: h.method, confidence: h.confidence,
        rangeType: h.range_type, productionStatus: h.production_status, nNonoverlap: h.n_nonoverlap as number,
      };
    });
    return { id: crop.id, label: crop.label, horizons };
  });
  return {
    cityId: raw.city_id, supported: raw.supported, crops,
    asOf: raw.as_of, horizons: raw.horizons as number[],
    modelVersion: raw.model_version, dataVersion: raw.data_version, limitation: raw.limitation,
  };
}

/** 校验 `/api/forecast/long-horizon` 响应；null 永远不变成 0。 */
export function adaptLongHorizonEntry(raw: unknown): LongHorizonEntry {
  const fail = (): never => { throw new Error(FAIL); };
  if (!record(raw)) return fail();
  if (typeof raw.crop !== 'string' || !Number.isInteger(raw.horizon)) return fail();
  if (!isStatus(raw.production_status) || !isRangeType(raw.range_type) || typeof raw.available !== 'boolean') return fail();
  if (!nullableNumber(raw.point_forecast) || !nullableNumber(raw.range_low) || !nullableNumber(raw.range_high)) return fail();
  if (raw.point_forecast !== null && raw.point_forecast <= 0) return fail();
  if (!record(raw.forecast) || !isSource((raw.forecast as Record<string, unknown>).source)) return fail();
  const forecast = raw.forecast as Record<string, unknown>;
  if (typeof forecast.fallback_used !== 'boolean') return fail();
  if (!nullableNumber(forecast.model_disagreement)) return fail();
  const lo = raw.range_low as number | null;
  const hi = raw.range_high as number | null;
  const point = raw.point_forecast as number | null;
  // 区间必须包含点值（服务端已按比值带跨过 1.0 保证；此处再守一道）
  if (lo !== null && hi !== null && point !== null && !(lo <= point && point <= hi)) return fail();
  if (lo !== null && hi !== null && lo > hi) return fail();
  return {
    crop: raw.crop, horizon: raw.horizon as number,
    pointForecast: point, rangeLow: lo, rangeHigh: hi,
    rangeType: raw.range_type, productionStatus: raw.production_status,
    confidence: nullableString(raw.confidence) ? (raw.confidence as string | null) : null,
    method: nullableString(raw.method) ? (raw.method as string | null) : null,
    unit: typeof raw.unit === 'string' ? raw.unit : 'CNY/kg',
    source: forecast.source as ForecastSource,
    modelDisagreementPct: forecast.model_disagreement as number | null,
    fallbackUsed: forecast.fallback_used,
    asOf: nullableString(raw.as_of) ? (raw.as_of as string | null) : null,
    anchorDate: nullableString(raw.anchor_observation_date) ? (raw.anchor_observation_date as string | null) : null,
    available: raw.available,
    notes: Array.isArray(raw.notes) ? raw.notes.filter(n => typeof n === 'string') as string[] : [],
  };
}

export function findHorizonCap(cap: LongHorizonCapability, crop: string): LongHorizonCropCap | null {
  return cap.crops.find(item => item.id === crop) ?? null;
}

/** 选一个「最可用的长期档位」：优先 PRODUCTION_POINT，其次较长 horizon。 */
export function preferredHorizon(crop: LongHorizonCropCap): number | null {
  if (!crop.horizons.length) return null;
  const ranked = [...crop.horizons].sort((a, b) => {
    const prodA = a.productionStatus === 'PRODUCTION_POINT' ? 0 : 1;
    const prodB = b.productionStatus === 'PRODUCTION_POINT' ? 0 : 1;
    if (prodA !== prodB) return prodA - prodB;
    return b.days - a.days;
  });
  return ranked[0].days;
}