import type {
  ForecastSource, LongHorizonCapability, LongHorizonCropCap, LongHorizonEntry,
  LongHorizonStatus, RangeType, LongHorizonFreshness, TargetType, TargetEstimate, LongHorizonDecisionResult, LongHorizonDecisionRequest,
} from './types';

const STATUSES: LongHorizonStatus[] = ['PRODUCTION_POINT', 'PRODUCTION_SCENARIO', 'SCENARIO_ONLY', 'EXPLORATORY_SCENARIO_ONLY', 'RESEARCH_ONLY'];
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
const canonical = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (record(v)) return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
};

export function adaptFreshness(raw: unknown): LongHorizonFreshness {
  if (!record(raw) || !['CURRENT', 'LONG_HORIZON_STALE', 'DAILY_UNAVAILABLE'].includes(String(raw.status))
    || !nullableString(raw.daily_latest_data_date) || !nullableString(raw.long_horizon_as_of) || typeof raw.daily_delayed !== 'boolean') throw new Error(FAIL);
  return { status: raw.status as LongHorizonFreshness['status'], dailyLatestDataDate: raw.daily_latest_data_date,
    longHorizonAsOf: raw.long_horizon_as_of, dailyDelayed: raw.daily_delayed };
}

export function adaptTarget(raw: unknown, type: TargetType): TargetEstimate {
  if (!record(raw) || raw.target_type !== type || raw.unit !== 'CNY/kg' || !isStatus(raw.production_status)
    || !isRangeType(raw.range_type) || ![raw.point_forecast, raw.range_low, raw.range_high].every(nullableNumber)
    || !nullableString(raw.method) || !nullableString(raw.confidence) || typeof raw.fallback_used !== 'boolean'
    || typeof raw.available !== 'boolean') throw new Error(FAIL);
  const point = raw.point_forecast as number | null, lo = raw.range_low as number | null, hi = raw.range_high as number | null;
  if (raw.available !== (point !== null) || [point, lo, hi].some(v => v !== null && v <= 0)
    || (lo !== null && hi !== null && lo > hi)
    || (point !== null && ((lo !== null && lo > point) || (hi !== null && hi < point)))) throw new Error(FAIL);
  const window = raw.target_window;
  if (!record(window) || typeof window.definition !== 'string' || !Number.isInteger(window.start_offset)
    || !Number.isInteger(window.end_offset_exclusive) || Number(window.start_offset) >= Number(window.end_offset_exclusive)) throw new Error(FAIL);
  return { targetType: type, pointForecast: point, rangeLow: lo, rangeHigh: hi, rangeType: raw.range_type,
    productionStatus: raw.production_status, confidence: raw.confidence, method: raw.method,
    actualMethod: typeof raw.actual_method === 'string' ? raw.actual_method : raw.method,
    fallbackUsed: raw.fallback_used, available: raw.available,
    anchorDate: typeof raw.anchor_observation_date === 'string' ? raw.anchor_observation_date : null,
    modelDisagreementPct: finite(raw.model_disagreement_pct) ? raw.model_disagreement_pct : null,
    window: { definition: window.definition, startOffset: window.start_offset as number, endOffsetExclusive: window.end_offset_exclusive as number } };
}

function adaptTargets(raw: unknown): Record<TargetType, TargetEstimate> {
  if (!record(raw)) throw new Error(FAIL);
  return { harvest_market_price: adaptTarget(raw.harvest_market_price, 'harvest_market_price'),
    cycle_market_average: adaptTarget(raw.cycle_market_average, 'cycle_market_average') };
}

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
    ...(raw.freshness === undefined ? {} : { freshness: adaptFreshness(raw.freshness) }),
  };
}

/** 校验 `/api/forecast/long-horizon` 响应；null 永远不变成 0。 */
export function adaptLongHorizonEntry(raw: unknown): LongHorizonEntry {
  const fail = (): never => { throw new Error(FAIL); };
  if (!record(raw)) return fail();
  if (typeof raw.crop !== 'string' || !Number.isInteger(raw.horizon)) return fail();
  if (raw.unit !== 'CNY/kg' || raw.schema_version === 'lh_forecast_v2' && !record(raw.targets)) return fail();
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
    ...(raw.targets === undefined ? {} : { targets: adaptTargets(raw.targets), targetType: raw.target_type as TargetType }),
    actualMethod: typeof forecast.actual_method === 'string' ? forecast.actual_method : nullableString(raw.method) ? raw.method : null,
    ...(raw.freshness === undefined ? {} : { freshness: adaptFreshness(raw.freshness) }),
    llmStatus: typeof raw.llm_status === 'string' ? raw.llm_status : undefined,
  };
}

/** Independent v2 contract: no conversion to the short-model v1 or silent demo substitution. */
export function adaptLongHorizonDecision(raw: unknown, expected: LongHorizonDecisionRequest): LongHorizonDecisionResult {
  if (!record(raw) || raw.contract_version !== '2' || !record(raw.request)
    || canonical(raw.request) !== canonical(expected) || !['SCENARIO_ONLY', 'NO_FEASIBLE_PLAN'].includes(String(raw.status))
    || raw.basis !== 'harvest_market_price' || typeof raw.market_as_of !== 'string' || !Number.isInteger(raw.horizon_days)
    || typeof raw.expected_harvest_date !== 'string' || !Array.isArray(raw.candidates) || !Array.isArray(raw.ranking)
    || !['profit_scenario', 'harvest_relative_market_environment'].includes(String(raw.ranking_basis))
    || !record(raw.recommendation) || !nullableString(raw.recommendation.crop) || raw.recommendation.strength !== 'weak'
    || typeof raw.recommendation.reason !== 'string' || typeof raw.model_version !== 'string' || typeof raw.data_version !== 'string'
    || !Array.isArray(raw.warnings) || !raw.warnings.every(v => typeof v === 'string')) throw new Error(FAIL);
  const candidates = raw.candidates.map(c => {
    if (!record(c) || typeof c.crop !== 'string' || !finite(c.area_mu) || c.area_mu !== expected.user_context.area_mu
      || typeof c.available !== 'boolean' || !record(c.price) || c.price.unit !== 'CNY/kg' || c.price.basis !== 'harvest_market_price'
      || ![c.price.low, c.price.base, c.price.high].every(nullableNumber) || !record(c.profit)
      || ![c.profit.low, c.profit.base, c.profit.high].every(nullableNumber) || typeof c.profit.available !== 'boolean'
      || !['user_input', 'missing'].includes(String(c.profit.basis)) || c.profit.scenario_only !== true
      || !(c.budget_feasible === null || typeof c.budget_feasible === 'boolean') || !nullableNumber(c.harvest_relative_to_current)
      || !record(c.current_market_context) || !nullableString(c.current_market_context.as_of)
      || ![c.current_market_context.current_price, c.current_market_context.hri, c.current_market_context.market_risk].every(nullableNumber)
      || c.current_market_context.semantics !== 'current_market_environment_not_future_risk'
      || !Array.isArray(c.warnings) || !c.warnings.every(v => typeof v === 'string')
      || !nullableString(c.actual_method) || typeof c.fallback_used !== 'boolean' || !isStatus(c.production_status)) throw new Error(FAIL);
    if (!c.profit.available && [c.profit.low, c.profit.base, c.profit.high].some(v => v !== null)) throw new Error(FAIL);
    const targets = adaptTargets(c.targets);
    if (targets.harvest_market_price.pointForecast !== c.price.base) throw new Error(FAIL);
    return { ...c, crop: c.crop, targets, freshness: adaptFreshness(c.freshness) };
  });
  const ids = candidates.map(c => c.crop);
  if (new Set(ids).size !== ids.length || raw.ranking.some(r => !record(r) || !ids.includes(String(r.crop)) || !finite(r.score))
    || raw.recommendation.crop !== null && !ids.includes(raw.recommendation.crop)) throw new Error(FAIL);
  return { ...raw, candidates, freshness: adaptFreshness(raw.freshness) } as unknown as LongHorizonDecisionResult;
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
