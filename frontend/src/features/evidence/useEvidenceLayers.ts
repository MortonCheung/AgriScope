import { useEffect, useMemo, useState } from 'react';
import { useDaily } from '../daily/useDaily';
import { getDecisionProvider } from '../../providers/decision';
import { adaptFinalDecision } from '../../providers/decision/finalAdapter';
import { V2Repository } from '../../domain/research/v2/repository';
import { cityEntry, useRuntimeCatalog } from '../../domain/research/runtime/catalog';
import { readSavedDecision } from '../../services/useDecisionSession';
import { canonicalResearchId } from '../../app/routes';
import { researchIdKind } from '../../domain/research/catalog';
import { parseDecisionResult } from '../../domain/decision/validation';
import type {
  DecisionCapability, DecisionRequest, FinalDecisionRequest,
} from '../../domain/decision/types';
import type { DailyFreshness, DailySignal, DailySnapshot } from '../../domain/daily/types';
import type { V2Table } from '../../domain/research/v2/types';
import type { V2CatalogCity, V2CatalogModule } from '../../domain/research/v2/types';

/**
 * Evidence Drawer 的证据层数据（Frontend V3 §15）。
 *
 * 只从真实运行时取数：
 *   · `/api/daily/latest`（最新市场状态、区域市场观测）
 *   · `/api/decision/capabilities`（能力、数据基准日、模型版本）
 *   · `/api/decision`（模型结果：点估计、区间、horizon、版本、更新时间、样本量）
 *   · 研究只读产物（季节结构表、模块标题与研究侧原句）
 * 取不到就如实标 missing / error，绝不用占位数字顶上。
 */

export type LayerState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'missing'; note: string }
  | { status: 'error'; note: string };

export interface MarketLayer {
  latestDataDate: string | null;
  freshness: DailyFreshness;
  generatedAt: string;
  crops: {
    crop: string;
    pricePerKg: number | null;
    dataDate: string | null;
    change30d: number | null;
    signal: DailySignal | null;
    hri: number | null;
    marketRisk: number | null;
  }[];
}

export interface SeasonalLayer {
  label: string;
  value: string;
  /** 研究模块 id + 表名，用于交代来源。 */
  source: string;
}

export interface ModelLayer {
  crop: string;
  horizon: number;
  point: number | null;
  low: number | null;
  high: number | null;
  semantics: string;
  calibrated: boolean;
  modelVersion: string;
  dataVersion: string;
  dataStatus: string;
  asOf: string | null;
  /** /api/decision 响应里的生成时间（真实字段，取不到为 null）。 */
  generatedAt: string | null;
  sampleN: number | null;
  sampleYears: number | null;
  /** WAPE：接口未返回时必须为 null，界面据此写"该指标暂无可用来源"，不得写成准确率。 */
  wape: number | null;
}

export interface WeatherLayer {
  moduleId: string;
  title: string;
  summary: string;
}

export interface RegionalLayer {
  crop: string | null;
  price: number | null;
  markets: { name: string; url: string }[];
}

export interface SufficiencyLayer {
  rows: { label: string; value: string }[];
}

export interface ResearchLayer {
  modules: { id: string; title: string }[];
  entry: { href: string; label: string } | null;
}

export interface EvidenceLayers {
  market: LayerState<MarketLayer>;
  seasonal: LayerState<SeasonalLayer>;
  model: LayerState<ModelLayer>;
  weather: LayerState<WeatherLayer>;
  regional: LayerState<RegionalLayer>;
  sufficiency: LayerState<SufficiencyLayer>;
  research: LayerState<ResearchLayer>;
}

const DECISION_ENDPOINT = (import.meta.env.VITE_DECISION_API_URL as string | undefined) ?? '/api/decision';

/** 抽屉触发来源 → 该城真实存在的模块号后缀（只做导航，不构成研究结论）。 */
const TOPIC_MODULE_SUFFIX: Record<string, string> = {
  forecast: '06',
  'long-horizon': '06',
  risk: '04',
  compare: '05',
  weather: '02',
};

/** 在总索引里选出与该城/来源对应的模块号；找不到返回 null（界面据此隐藏入口）。 */
export function resolveModuleId(entry: V2CatalogCity | null, topic?: string): string | null {
  if (!entry || entry.modules.length === 0) return null;
  // 触发来源可能是 `risk:<id>` 这类复合值，取冒号前的类别。
  const key = topic?.split(':')[0];
  const suffix = key ? TOPIC_MODULE_SUFFIX[key] : undefined;
  const byTopic = suffix ? entry.modules.find((module) => module.module_id.endsWith(suffix)) : undefined;
  return byTopic?.module_id ?? entry.modules[0]?.module_id ?? null;
}

/**
 * 底部入口只在该模块号确实映射到研究树（真实路由）时才给出；
 * 映射不到就隐藏，绝不造一个打不开的链接。
 */
export function resolveResearchEntry(cityId: string, entry: V2CatalogCity | null, topic?: string): { href: string; label: string } | null {
  const moduleId = resolveModuleId(entry, topic);
  if (!moduleId) return null;
  if (researchIdKind(cityId, canonicalResearchId(moduleId)) === null) return null;
  return { href: `/cities/${cityId}/research/${moduleId}`, label: moduleId };
}

/** 季节结构表里取该品种的价格季节幅度；研究表没有这一列/这一行则返回 null。 */
export function seasonalForCrop(table: V2Table, crop?: string): { label: string; value: string } | null {
  const column = ['seasonal_range', 'seasonal_amplitude', 'amplitude'].find((key) => table.columns.includes(key));
  if (!column) return null;
  let rows = table.rows;
  if (crop && table.columns.includes('crop')) rows = rows.filter((row) => row.crop === crop);
  if (table.columns.includes('variable')) {
    const price = rows.filter((row) => row.variable === 'price');
    if (price.length) rows = price;
  }
  if (rows.length === 0) return null;
  const value = rows[0][column];
  if (value === undefined || value === '') return null;
  return { label: '价格季节指数极差', value };
}

/**
 * 用**真实的**上一份种植选择（sessionStorage 里的决策请求）拼出当前作物/跨度下的请求。
 * 没有真实投入就返回 null —— 绝不编造面积、预算或成本。
 */
export function buildDrawerRequest(saved: DecisionRequest, capability: DecisionCapability, crop?: string, horizon?: number): FinalDecisionRequest | null {
  if (saved.contract_version !== '1') return null;
  if (capability.crops.length === 0) return null;
  const context = saved.user_context;
  const target = crop && capability.crops.some((item) => item.id === crop)
    ? crop
    : context.crop_preferences[0] ?? capability.crops[0].id;
  const cropCap = capability.crops.find((item) => item.id === target);
  if (!cropCap || cropCap.horizons.length === 0) return null;
  const allowed = cropCap.horizons.map((item) => item.days);
  const days = horizon && allowed.includes(horizon) ? horizon : allowed.includes(30) ? 30 : allowed[0];
  return {
    contract_version: '1',
    user_context: {
      ...context,
      crop_preferences: [target],
      market_context: { ...context.market_context, horizon_days: days },
    },
    input_source: { kind: 'structured' },
  };
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const nullableNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

interface RawModel {
  generatedAt: string | null;
  sampleN: number | null;
  sampleYears: number | null;
  row: Record<string, unknown>;
}

async function loadDecisionModel(request: FinalDecisionRequest): Promise<{ layer: ModelLayer; raw: RawModel }> {
  const response = await fetch(DECISION_ENDPOINT, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error('模型结果暂时无法加载。');
  const payload: unknown = await response.json();
  const result = parseDecisionResult(adaptFinalDecision(payload, request));
  if (result.data_status !== 'model') throw new Error('正式接口没有返回模型结果。');
  const batch = record(payload) && record(payload.batch) ? payload.batch : {};
  const rows = Array.isArray(batch.all) ? batch.all.filter(record) : [];
  const row = rows.find((item) => item.crop === request.user_context.crop_preferences[0]) ?? rows[0] ?? {};
  const price = record(row.price) ? row.price : {};
  const sample = record(price.sample) ? price.sample : {};
  const candidate = result.candidates.find((item) => item.crop === request.user_context.crop_preferences[0]) ?? result.candidates[0];
  const raw: RawModel = {
    generatedAt: typeof row.generated_at === 'string' ? row.generated_at : null,
    sampleN: nullableNumber(sample.n_obs),
    sampleYears: nullableNumber(sample.n_years),
    row,
  };
  const layer: ModelLayer = {
    crop: candidate?.crop ?? request.user_context.crop_preferences[0],
    horizon: request.user_context.market_context.horizon_days,
    point: candidate?.price.base ?? null,
    low: candidate?.price.low ?? null,
    high: candidate?.price.high ?? null,
    semantics: candidate?.price.semantics ?? 'model_scenario',
    calibrated: candidate?.price.is_calibrated_interval ?? false,
    modelVersion: result.model_version,
    dataVersion: result.data_version,
    dataStatus: result.data_status,
    asOf: candidate?.market_context?.as_of ?? null,
    generatedAt: raw.generatedAt,
    sampleN: raw.sampleN,
    sampleYears: raw.sampleYears,
    // /api/decision 契约里没有 WAPE 字段；缺就缺，不臆造。
    wape: null,
  };
  return { layer, raw };
}

function useCapability(cityId: string): LayerState<DecisionCapability> {
  const [state, setState] = useState<LayerState<DecisionCapability>>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    const provider = getDecisionProvider();
    if (!provider.capabilities) { setState({ status: 'missing', note: '该城市未提供决策能力接口。' }); return; }
    setState({ status: 'loading' });
    provider.capabilities(cityId).then(
      (data) => { if (alive) setState({ status: 'ready', data }); },
      (error: unknown) => { if (alive) setState({ status: 'error', note: error instanceof Error ? error.message : '决策能力暂时无法加载。' }); },
    );
    return () => { alive = false; };
  }, [cityId]);
  return state;
}

function useModel(cityId: string, capability: LayerState<DecisionCapability>, crop?: string, horizon?: number): LayerState<ModelLayer> {
  const [state, setState] = useState<LayerState<ModelLayer>>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    if (capability.status === 'loading') { setState({ status: 'loading' }); return; }
    if (capability.status !== 'ready') { setState({ status: 'missing', note: '决策能力不可用，无法读取模型结果。' }); return; }
    const saved = readSavedDecision(`${cityId}:default:api`);
    if (!saved || saved.user_context.city_id !== cityId) {
      setState({ status: 'missing', note: '模型结果需要先完成一次种植选择（提供面积、预算与实际投入）。' });
      return;
    }
    const request = buildDrawerRequest(saved, capability.data, crop, horizon);
    if (!request) { setState({ status: 'missing', note: '当前作物或跨度不在该城市模型支持范围内。' }); return; }
    setState({ status: 'loading' });
    loadDecisionModel(request).then(
      ({ layer }) => { if (alive) setState({ status: 'ready', data: layer }); },
      (error: unknown) => { if (alive) setState({ status: 'error', note: error instanceof Error ? error.message : '模型结果暂时无法加载。' }); },
    );
    return () => { alive = false; };
  }, [cityId, capability, crop, horizon]);
  return state;
}

function useSeasonal(cityId: string, entry: V2CatalogCity | null, catalogStatus: 'loading' | 'ready' | 'error', crop?: string): LayerState<SeasonalLayer> {
  const [state, setState] = useState<LayerState<SeasonalLayer>>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    if (catalogStatus === 'loading') { setState({ status: 'loading' }); return; }
    if (catalogStatus !== 'ready' || !entry) { setState({ status: 'missing', note: '该城市暂无已发布的研究季节结构。' }); return; }
    const module: V2CatalogModule | undefined = entry.modules.find((item) => item.module_id.endsWith('01')) ?? entry.modules[0];
    const file = module?.tables.find((name) => /seasonal_amplitude|amplitude|seasonal_index/i.test(name));
    if (!module || !file) { setState({ status: 'missing', note: '研究模块未导出季节结构表。' }); return; }
    setState({ status: 'loading' });
    V2Repository.getTable(cityId, file).then(
      (table) => {
        if (!alive) return;
        const found = seasonalForCrop(table, crop);
        if (!found) { setState({ status: 'missing', note: '季节结构表未包含该品种的价格行。' }); return; }
        setState({ status: 'ready', data: { ...found, source: `${module.module_id} · ${file}` } });
      },
      (error: unknown) => { if (alive) setState({ status: 'error', note: error instanceof Error ? error.message : '季节结构表读取失败。' }); },
    );
    return () => { alive = false; };
  }, [cityId, entry, catalogStatus, crop]);
  return state;
}

const FRESHNESS_TEXT: Record<DailyFreshness, string> = { FRESH: '最新', DELAYED: '发布延迟', STALE: '数据较旧', MISSING: '数据缺失' };

function marketLayer(snapshot: DailySnapshot): MarketLayer {
  return {
    latestDataDate: snapshot.latestDataDate,
    freshness: snapshot.freshness,
    generatedAt: snapshot.sourceMeta.generatedAt,
    crops: snapshot.crops.map((item) => ({
      crop: item.crop, pricePerKg: item.pricePerKg, dataDate: item.dataDate,
      change30d: item.change30d, signal: item.signal, hri: item.hri, marketRisk: item.marketRisk,
    })),
  };
}

function sufficiencyLayer(daily: LayerState<MarketLayer>, model: LayerState<ModelLayer>, capability: LayerState<DecisionCapability>): LayerState<SufficiencyLayer> {
  const rows: { label: string; value: string }[] = [];
  if (capability.status === 'ready' && capability.data.supported) rows.push({ label: '城市数据等级', value: capability.data.tier });
  if (daily.status === 'ready') {
    rows.push({ label: '市场快照状态', value: FRESHNESS_TEXT[daily.data.freshness] });
  }
  if (model.status === 'ready') {
    if (model.data.sampleN !== null) rows.push({ label: '价格情景样本量', value: `${model.data.sampleN} 条` });
    if (model.data.sampleYears !== null) rows.push({ label: '覆盖年数', value: `${model.data.sampleYears} 年` });
    if (model.data.sampleN === null) rows.push({ label: '样本量', value: '该指标暂无可用来源' });
  }
  // 缺失率在 /api/daily 与 /api/decision 契约里都没有直接字段，如实标注。
  const dailyReady = daily.status === 'ready';
  const modelReady = model.status === 'ready';
  if (dailyReady || modelReady) rows.push({ label: '缺失率', value: '该指标暂无可用来源' });
  if (rows.length === 0) return { status: 'missing', note: '暂无可用数据充分度字段。' };
  return { status: 'ready', data: { rows } };
}

export function useEvidenceLayers(context: { cityId: string; crop?: string; horizon?: number; topic?: string }): EvidenceLayers {
  const dailyState = useDaily(context.cityId);
  const capability = useCapability(context.cityId);
  const model = useModel(context.cityId, capability, context.crop, context.horizon);
  const catalogState = useRuntimeCatalog();
  const entry = catalogState.status === 'ready' ? cityEntry(catalogState.catalog, context.cityId) : null;
  const seasonal = useSeasonal(context.cityId, entry, catalogState.status, context.crop);

  const market: LayerState<MarketLayer> = useMemo(() => {
    if (context.cityId !== 'shenyang') return { status: 'missing', note: '每日市场快照目前只覆盖沈阳。' };
    if (dailyState.status === 'loading') return { status: 'loading' };
    if (dailyState.status === 'unsupported') return { status: 'missing', note: '该城市的每日市场数据暂未接入。' };
    if (dailyState.status === 'error') return { status: 'error', note: dailyState.error };
    return { status: 'ready', data: marketLayer(dailyState.data) };
  }, [context.cityId, dailyState]);

  const weather: LayerState<WeatherLayer> = useMemo(() => {
    if (catalogState.status === 'loading') return { status: 'loading' };
    const module = entry?.modules.find((item) => item.module_id.endsWith('02'));
    if (!module || !module.summary) return { status: 'missing', note: '该城市暂无天气—市场响应的研究模块。' };
    return { status: 'ready', data: { moduleId: module.module_id, title: module.title, summary: module.summary } };
  }, [catalogState.status, entry]);

  const regional: LayerState<RegionalLayer> = useMemo(() => {
    if (dailyState.status === 'loading') return { status: 'loading' };
    if (dailyState.status !== 'ready') return { status: 'missing', note: '暂无可观察市场来源。' };
    const crop = context.crop && dailyState.data.crops.some((item) => item.crop === context.crop) ? context.crop : null;
    const row = crop ? dailyState.data.crops.find((item) => item.crop === crop) ?? null : null;
    return { status: 'ready', data: { crop, price: row?.pricePerKg ?? null, markets: dailyState.data.sources.map((source) => ({ name: source.name, url: source.url })) } };
  }, [context.crop, dailyState]);

  const sufficiency = useMemo(() => sufficiencyLayer(market, model, capability), [market, model, capability]);

  const research: LayerState<ResearchLayer> = useMemo(() => {
    if (catalogState.status === 'loading') return { status: 'loading' };
    if (catalogState.status === 'error') return { status: 'error', note: catalogState.message };
    if (!entry || entry.modules.length === 0) return { status: 'missing', note: '该城市暂无已发布研究模块。' };
    return {
      status: 'ready',
      data: {
        modules: entry.modules.map((module) => ({ id: module.module_id, title: module.title })),
        entry: resolveResearchEntry(context.cityId, entry, context.topic),
      },
    };
  }, [catalogState, entry, context.cityId, context.topic]);

  return { market, seasonal, model, weather, regional, sufficiency, research };
}