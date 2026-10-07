import { getCity } from '../geography/cities';
import type { DecisionRequest, DecisionResult, ScenarioRange } from './types';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nullable = (value: unknown) => value === null || finite(value);
export function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validateRequest(value: unknown): string[] {
  if (!record(value) || value.contract_version !== '0' || !record(value.user_context)) return ['种植条件格式不完整。'];
  const c = value.user_context;
  const errors: string[] = [];
  if (typeof c.city_id !== 'string' || !getCity(c.city_id)) errors.push('请从辽宁城市入口选择城市。');
  if (!finite(c.area_mu) || c.area_mu <= 0) errors.push('面积需要大于 0 亩。');
  if (!finite(c.budget_cny) || c.budget_cny <= 0) errors.push('预算需要大于 0 元。');
  if (!['conservative', 'balanced', 'aggressive'].includes(String(c.risk_preference))) errors.push('请选择决策偏好。');
  const planting = c.planting_window;
  const harvest = c.harvest_window;
  for (const [name, window] of [['种植', planting], ['上市', harvest]] as const) {
    if (!record(window) || !isDate(window.start) || !isDate(window.end) || window.start > window.end) errors.push(`${name}日期范围不完整或顺序有误。`);
  }
  if (record(planting) && record(harvest) && isDate(planting.start) && isDate(harvest.start) && planting.start > harvest.start) errors.push('上市不能早于最早种植日期。');
  if (record(planting) && record(harvest) && isDate(planting.end) && isDate(harvest.end) && planting.end > harvest.end) errors.push('最晚种植不能晚于最晚上市日期。');
  if (!Array.isArray(c.crop_preferences) || !c.crop_preferences.every((crop) => typeof crop === 'string' && crop.trim().length > 0)) errors.push('作物偏好格式有误。');
  if (!record(c.actual_inputs)) errors.push('实际成本与亩产格式有误。');
  else for (const [crop, inputs] of Object.entries(c.actual_inputs)) {
    if(!crop.trim()) errors.push('实际投入需要对应作物名称。');
    if (!record(inputs)) { errors.push(`${crop}的成本与亩产格式有误。`); continue; }
    if (inputs.cost_per_mu !== null && (!finite(inputs.cost_per_mu) || inputs.cost_per_mu <= 0)) errors.push(`${crop}亩均成本需要大于 0。`);
    if (inputs.yield_kg_per_mu !== null && (!finite(inputs.yield_kg_per_mu) || inputs.yield_kg_per_mu <= 0)) errors.push(`${crop}亩产需要大于 0。`);
  }
  if (!record(value.input_source) || !['structured', 'natural_language'].includes(String(value.input_source.kind))) errors.push('输入来源格式有误。');
  else if((value.input_source.text!==undefined&&typeof value.input_source.text!=='string')||(value.input_source.kind==='natural_language'&&!(typeof value.input_source.text==='string'&&value.input_source.text.trim()))) errors.push('自然语言输入原文不完整。');
  return errors;
}
/** Field order in JSON is not part of the contract. */
export function sameDecisionContext(a:DecisionRequest,b:DecisionRequest):boolean{
  const x=a.user_context,y=b.user_context;
  const cropKeys=(v:typeof x.actual_inputs)=>Object.keys(v).sort();
  return x.city_id===y.city_id&&x.area_mu===y.area_mu&&x.budget_cny===y.budget_cny&&x.risk_preference===y.risk_preference&&
    x.planting_window.start===y.planting_window.start&&x.planting_window.end===y.planting_window.end&&x.harvest_window.start===y.harvest_window.start&&x.harvest_window.end===y.harvest_window.end&&
    JSON.stringify([...x.crop_preferences].sort())===JSON.stringify([...y.crop_preferences].sort())&&JSON.stringify(cropKeys(x.actual_inputs))===JSON.stringify(cropKeys(y.actual_inputs))&&
    cropKeys(x.actual_inputs).every(k=>x.actual_inputs[k].cost_per_mu===y.actual_inputs[k].cost_per_mu&&x.actual_inputs[k].yield_kg_per_mu===y.actual_inputs[k].yield_kg_per_mu);
}
function range(value: unknown): value is ScenarioRange {
  if (!record(value) || !nullable(value.low) || !nullable(value.base) || !nullable(value.high)) return false;
  if (![ 'CNY', 'CNY/kg', 'ratio' ].includes(String(value.unit)) || !['historical_seasonal_scenario','model_scenario','formula_scenario'].includes(String(value.semantics))) return false;
  if (typeof value.is_mock !== 'boolean' || typeof value.is_calibrated_interval !== 'boolean') return false;
  return (value.low === null || value.base === null || (value.low as number) <= (value.base as number)) &&
    (value.high === null || value.base === null || (value.base as number) <= (value.high as number)) &&
    (value.low === null || value.high === null || (value.low as number) <= (value.high as number));
}
const strings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const windowValid = (v: unknown) => record(v) && isDate(v.start) && isDate(v.end) && v.start <= v.end;
function confidence(v: unknown): boolean {
  return record(v) && nullable(v.score) && (v.score === null || ((v.score as number) >= 0 && (v.score as number) <= 100)) &&
    ['A','B','C','D',null].includes(v.grade as string | null) && ['high','medium','low','unknown'].includes(String(v.level)) && typeof v.basis === 'string' && typeof v.is_mock === 'boolean';
}
/** Fail closed at the boundary: malformed/NaN data never reaches charts. */
export function parseDecisionResult(value: unknown): DecisionResult {
  const fail = () => { throw new Error('决策数据格式不完整，请重试。'); };
  if (!record(value)) return fail();
  if (value.contract_version !== '0' || !['ok','no_data','user_input_required','model_error'].includes(String(value.status)) || validateRequest(value.request).length) return fail();
  if (!strings(value.issues) || !(value.issues as string[]).every((i) => ['high_risk','low_confidence','insufficient_market_data','proxy_only','no_clear_winner','scenario_only','partial_result'].includes(i)) || !strings(value.warnings) || !strings(value.assumptions)) return fail();
  if (!['legacy_model_fixture','mock','model'].includes(String(value.data_status)) || typeof value.model_version !== 'string' || typeof value.data_version !== 'string' || !(value.fixture_id === null || typeof value.fixture_id === 'string')) return fail();
  if (!record(value.recommendation) || !confidence(value.recommendation.confidence) || !strings(value.recommendation.reasons) || !Array.isArray(value.candidates)) return fail();
  const ids = new Set<string>();
  for (const candidate of value.candidates) {
    if (!record(candidate) || typeof candidate.id !== 'string' || !candidate.id || ids.has(candidate.id) || typeof candidate.crop !== 'string' || !candidate.crop || !finite(candidate.area_mu) || candidate.area_mu <= 0) return fail();
    ids.add(candidate.id);
    if (!windowValid(candidate.harvest_window) || !(candidate.planting_window === null || windowValid(candidate.planting_window)) || !strings(candidate.strategies) || !(candidate.strategies as string[]).every((s) => ['balanced','return','robust','low_risk','alternative'].includes(s))) return fail();
    if (!range(candidate.price) || candidate.price.unit !== 'CNY/kg' || !range(candidate.profit) || candidate.profit.unit !== 'CNY' || !range(candidate.roi) || candidate.roi.unit !== 'ratio' || !nullable(candidate.break_even_price) || !confidence(candidate.confidence)) return fail();
    if (!record(candidate.risks) || ![candidate.risks.hri,candidate.risks.market_risk,candidate.risks.climate_exposure].every((v) => v === null || (finite(v) && v >= 0 && v <= 100))) return fail();
    if (!record(candidate.inputs) || ![candidate.inputs.cost_per_mu,candidate.inputs.yield_kg_per_mu].every((v) => v === null || (finite(v) && v > 0)) || typeof candidate.inputs.cost_source !== 'string' || typeof candidate.inputs.yield_source !== 'string') return fail();
    if (!record(candidate.data_quality) || typeof candidate.data_quality.label !== 'string' || !strings(candidate.data_quality.proxy_flags) || !strings(candidate.data_quality.mock_fields) || !strings(candidate.warnings) || !strings(candidate.reasons)) return fail();
    if (!Array.isArray(candidate.evidence) || !candidate.evidence.every((e) => record(e) && typeof e.city_id === 'string' && /^A\d+(\.\d+)?$/.test(String(e.research_id)) && typeof e.label === 'string' && ['background','input'].includes(String(e.role)))) return fail();
    if (!Array.isArray(candidate.stress_scenarios)) return fail();
    for (const stress of candidate.stress_scenarios) {
      if (!record(stress) || typeof stress.id !== 'string' || !stress.id || typeof stress.label !== 'string' || typeof stress.note !== 'string' || typeof stress.is_mock !== 'boolean' || !range(stress.profit) || stress.profit.unit !== 'CNY' || !nullable(stress.roi) || !nullable(stress.delta_cny) || !record(stress.changes)) return fail();
      const changes=stress.changes;
      if(![changes.price_pct,changes.yield_pct,changes.cost_pct,changes.delay_days].every(finite)||[changes.price_pct,changes.yield_pct,changes.cost_pct].some(v=>(v as number)<-100)||!Number.isInteger(changes.delay_days)||(changes.delay_days as number)<0) return fail();
    }
  }
  const recommendation = value.recommendation.candidate_id;
  if (!(recommendation === null || (typeof recommendation === 'string' && ids.has(recommendation)))) return fail();
  if (value.status === 'ok' && ids.size === 0) return fail();
  if(value.status!=='ok'&&(ids.size>0||recommendation!==null)) return fail();
  return value as unknown as DecisionResult;
}
