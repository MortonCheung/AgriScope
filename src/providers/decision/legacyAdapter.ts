import type { Confidence, DecisionCandidate, DecisionRequest, DecisionResult, ScenarioRange, Strategy, StressScenario } from '../../domain/decision/types';
import { unknownRange } from '../../domain/decision/calculations';
import { parseDecisionResult } from '../../domain/decision/validation';

export interface LegacyRequest { city: string; available_area_mu: number; budget: number; earliest_plant_date: string; latest_harvest_date: string; risk_preference: 'conservative' | 'balanced' | 'aggressive'; allowed_crops?: string[] | null }
interface LegacyPlan {
  crop: string; area_mu: number; planting_window?: string; harvest_window?: string; harvest_date?: string;
  price_low?: number; price_mid?: number; price_high?: number; is_calibrated_interval?: boolean;
  profit_pessimistic?: number | null; profit_baseline?: number | null; profit_optimistic?: number | null;
  HRI?: number; market_risk?: number; climate_exposure?: number; climate_risk?: number;
  confidence?: number; confidence_grade?: Confidence['grade']; cost_per_mu?: number; expected_yield_per_mu?: number; cost_level?: string; yield_level?: string;
}
export interface LegacyFixture {
  id: string; label: string; request: LegacyRequest; snapshot_version: string;
  output: {
    recommended_plan: LegacyPlan; alternatives: LegacyPlan[];
    labels: { label: string; crop: string; harvest_date: string; area_mu: number; profit_baseline: number | null }[];
    pareto_frontier: LegacyPlan[];
    confidence: { score: number; grade: Confidence['grade']; note: string };
    risk_summary: { profit_plausibility?: { plausible: boolean; flags: string[] } };
    plan_risks: string[]; limitations: string[];
    stress_test: { recommended_plan_stress?: { scenarios: { shock: string; profit_baseline: number; profit_pessimistic: number; roi_baseline: number; profit_delta: number }[] } };
  };
}
export const STRATEGY_LABELS: Record<Strategy, string> = { balanced: '综合方案', return: '收益优先', robust: '稳健方案', low_risk: '低风险方案', alternative: '替代方案' };
const STRATEGIES: Record<string, Strategy> = { 'Best Balanced':'balanced','Best Return':'return','Most Robust':'robust','Lowest Risk':'low_risk','Alternative':'alternative' };
const SOURCE_LABELS: Record<string,string> = { regional_proxy:'区域参考成本',sector_proxy:'行业参考成本',observed_city:'城市公开成本',observed_city_aggregate:'城市蔬菜合计亩产',observed_city_county_crop:'城市区县作物亩产',user:'用户实际输入' };
const value = (v: number | null | undefined) => typeof v === 'number' && Number.isFinite(v) ? v : null;
const range = (low: number | null | undefined, base: number | null | undefined, high: number | null | undefined, unit: ScenarioRange['unit']): ScenarioRange => ({ low:value(low),base:value(base),high:value(high),unit,semantics:'historical_seasonal_scenario',is_calibrated_interval:false,is_mock:false });
function windowFrom(text: string | undefined): { start: string; end: string } {
  const dates = text?.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  if (!dates[0]) throw new Error('历史方案日期不完整。');
  return { start:dates[0],end:dates[1] ?? dates[0] };
}
export function normalizeLegacyRequest(request: LegacyRequest, cityId = 'shenyang'): DecisionRequest {
  return {
    contract_version:'0',
    user_context: { city_id:cityId,area_mu:request.available_area_mu,budget_cny:request.budget,risk_preference:request.risk_preference,
      planting_window:{start:request.earliest_plant_date,end:request.latest_harvest_date},
      harvest_window:{start:request.earliest_plant_date,end:request.latest_harvest_date},crop_preferences:request.allowed_crops ?? [],actual_inputs:{} },
    input_source:{kind:'structured'},
  };
}
export function legacyConfidence(score: number | null | undefined, grade: Confidence['grade'], basis: string): Confidence {
  return { score:value(score),grade:grade ?? null,level:grade === 'A' || grade === 'B' ? 'high' : grade === 'C' ? 'medium' : grade === 'D' ? 'low' : 'unknown',basis,is_mock:false };
}
export function candidateId(crop: string, harvestEnd: string): string {
  return `${encodeURIComponent(crop)}-${harvestEnd}`;
}
function adaptPlan(plan: LegacyPlan, fixture: LegacyFixture): DecisionCandidate {
  const harvest = windowFrom(plan.harvest_window ?? plan.harvest_date);
  const cost = value(plan.cost_per_mu);
  const yieldPerMu = value(plan.expected_yield_per_mu);
  const totalCost = cost === null ? null : cost * plan.area_mu;
  const profit = range(plan.profit_pessimistic,plan.profit_baseline,plan.profit_optimistic,'CNY');
  const roi = range(...([profit.low,profit.base,profit.high].map((p) => p === null || totalCost === null || totalCost <= 0 ? null : p / totalCost) as [number|null,number|null,number|null]),'ratio');
  roi.semantics = 'formula_scenario';
  const proxy = [plan.cost_level,plan.yield_level].filter((s) => s?.includes('proxy') || s === 'observed_city_aggregate').map((s) => SOURCE_LABELS[s!] ?? '参考输入');
  const strategies = fixture.output.labels.filter((l) => l.crop === plan.crop && l.harvest_date === harvest.end).map((l) => STRATEGIES[l.label]).filter(Boolean);
  const warnings = [];
  if (proxy.length) warnings.push('成本或亩产采用参考口径，收益不能替代实际经营核算。');
  if (cost !== null) warnings.push('成本科目可能缺人工、地租和折旧，利润存在高估风险。');
  if (plan.price_mid === undefined) warnings.push('此窗口只有部分历史输出，缺失读数保持为空。');
  return {
    id:candidateId(plan.crop,harvest.end),crop:plan.crop,area_mu:plan.area_mu,
    planting_window:plan.planting_window ? windowFrom(plan.planting_window) : null,harvest_window:harvest,
    strategies:strategies.length ? [...new Set(strategies)] : ['alternative'],
    price:{...range(plan.price_low,plan.price_mid,plan.price_high,'CNY/kg'),is_calibrated_interval:plan.is_calibrated_interval ?? false},profit,roi,
    break_even_price:cost === null || yieldPerMu === null || yieldPerMu <= 0 ? null : cost / yieldPerMu,
    inputs:{cost_per_mu:cost,yield_kg_per_mu:yieldPerMu,cost_source:SOURCE_LABELS[plan.cost_level ?? ''] ?? '未提供',yield_source:SOURCE_LABELS[plan.yield_level ?? ''] ?? '未提供'},
    risks:{hri:value(plan.HRI),market_risk:value(plan.market_risk),climate_exposure:value(plan.climate_exposure ?? plan.climate_risk)},
    confidence:legacyConfidence(plan.confidence,plan.confidence_grade ?? null,'候选原始置信度，未含推荐层折扣。'),
    reasons:[],warnings,data_quality:{label:proxy.length ? '参考口径' : '历史输出',proxy_flags:proxy,mock_fields:[]},
    evidence:[{city_id:'shenyang',research_id:'A1.3',label:'月份与价格',role:'background'},{city_id:'shenyang',research_id:'A6',label:'量价与风险传导',role:'background'}],stress_scenarios:[],
  };
}
const SHOCKS: Record<string,{label:string;changes:StressScenario['changes']}> = {
  'price_-10%':{label:'价格下降 10%',changes:{price_pct:-10,yield_pct:0,cost_pct:0,delay_days:0}},
  'price_-20%':{label:'市场转弱',changes:{price_pct:-20,yield_pct:0,cost_pct:0,delay_days:0}},
  'yield_-20%':{label:'生产受损',changes:{price_pct:0,yield_pct:-20,cost_pct:0,delay_days:0}},
  'cost_+20%':{label:'成本上涨',changes:{price_pct:0,yield_pct:0,cost_pct:20,delay_days:0}},
  'harvest_delay_+7d':{label:'上市延迟 7 天',changes:{price_pct:0,yield_pct:0,cost_pct:0,delay_days:7}},
};
export function adaptLegacyFixture(fixture: LegacyFixture, request = normalizeLegacyRequest(fixture.request)): DecisionResult {
  const raw = fixture.output;
  const plans = [raw.recommended_plan,...raw.alternatives];
  for (const label of raw.labels) {
    if (plans.some((p) => p.crop === label.crop && windowFrom(p.harvest_window ?? p.harvest_date).end === label.harvest_date)) continue;
    const partial = raw.pareto_frontier.find((p) => p.crop === label.crop && p.harvest_date === label.harvest_date);
    plans.push(partial ?? {crop:label.crop,harvest_date:label.harvest_date,area_mu:label.area_mu,profit_baseline:label.profit_baseline});
  }
  const candidates = plans.map((p) => adaptPlan(p,fixture));
  const recommended = candidates[0];
  recommended.reasons = ['旧模型在收益与下行情景之间给出的综合选择。'];
  for (const shock of raw.stress_test.recommended_plan_stress?.scenarios ?? []) {
    const def = SHOCKS[shock.shock];
    if (!def) continue;
    recommended.stress_scenarios.push({id:shock.shock,label:def.label,changes:def.changes,
      profit:{...unknownRange('CNY'),low:value(shock.profit_pessimistic),base:value(shock.profit_baseline),semantics:'model_scenario'},
      roi:value(shock.roi_baseline),delta_cny:value(shock.profit_delta),is_mock:false,
      note:def.changes.delay_days ? '旧模型此延迟情景没有重新估价；零变化不代表延迟没有风险。' : '旧模型参数压力情景，非发生概率或因果估计。'});
  }
  const globalConfidence = legacyConfidence(raw.confidence.score,raw.confidence.grade,'推荐层已包含参考输入、日历与排序差异的折扣。');
  const warnings = ['价格范围是历史同月情景，未校准为概率区间。',...(raw.risk_summary.profit_plausibility?.flags ?? []).map((s) => s.replace(/^⚠\s*/,''))];
  const issues: DecisionResult['issues'] = [];
  if (globalConfidence.level === 'low') issues.push('low_confidence');
  if (candidates.some((c) => c.data_quality.proxy_flags.length)) issues.push('proxy_only');
  if (/几乎相同|并列|不给出/.test(raw.confidence.note ?? '')) issues.push('no_clear_winner');
  if (candidates.some((c) => c.price.base === null)) issues.push('partial_result');
  return parseDecisionResult({contract_version:'0',status:'ok',request,candidates,
    recommendation:{candidate_id:recommended.id,confidence:globalConfidence,reasons:[raw.confidence.note || '按旧模型权重比较。']},issues,warnings,
    assumptions:['旧模型历史样例，尚未接入最终模型。','种植日历包含推定窗口。','面积只改变收益敞口，不改变价格与风险评分。','旧模型不做复种、跨城联合优化；单季土地允许分割。','风险偏好只改变旧模型排序权重，不改变价格和风险评分。'],
    model_version:'decision-engine-v2-legacy',data_version:fixture.snapshot_version,data_status:'legacy_model_fixture',fixture_id:fixture.id});
}
