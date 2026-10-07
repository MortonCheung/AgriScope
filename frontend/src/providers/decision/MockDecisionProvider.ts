import { operatingProfit, unknownRange } from '../../domain/decision/calculations';
import type { DecisionCandidate, DecisionProvider, DecisionRequest, DecisionResult } from '../../domain/decision/types';
import { parseDecisionResult, validateRequest } from '../../domain/decision/validation';
import { adaptLegacyFixture } from './legacyAdapter';
import { getDecisionSamples, readLegacyFixture } from './fixtures';

export const MOCK_STATES = ['normal','high_risk','low_confidence','insufficient_market_data','user_input_required','model_error','loading','empty','partial_data','proxy_only','no_clear_winner','scenario_only'] as const;
export type MockState = typeof MOCK_STATES[number];
const unknownConfidence = () => ({score:null,grade:null,level:'unknown' as const,basis:'公式情景未重新计算模型置信度。',is_mock:true});
export function emptyDecision(request: DecisionRequest, status: DecisionResult['status'], warning: string): DecisionResult {
  return {contract_version:'0',status,request,candidates:[],recommendation:{candidate_id:null,confidence:unknownConfidence(),reasons:[]},issues:[],warnings:[warning],assumptions:[],model_version:'decision-ui-v0',data_version:'legacy-v2-20261007',data_status:'mock',fixture_id:null};
}
/** Deterministic operating examples; deliberately does not recreate a recommender. */
export class MockDecisionProvider implements DecisionProvider {
  readonly data_mode='mock' as const;
  listSamples(options:{signal?:AbortSignal}={}){return getDecisionSamples(options.signal);}
  constructor(private readonly testState?: MockState) {}
  async decide(request: DecisionRequest, options: { signal?: AbortSignal } = {}): Promise<DecisionResult> {
    const errors=validateRequest(request);
    if (errors.length) throw new Error(errors.join(' '));
    if(request.contract_version!=='0')throw new Error('历史演示不支持正式市场评估请求。');
    options.signal?.throwIfAborted();
    if (this.testState === 'loading') return new Promise((_,reject) => {
      const abort=()=>reject(new DOMException('Aborted','AbortError'));
      options.signal?.addEventListener('abort',abort,{once:true});
      if(options.signal?.aborted) abort();
    });
    if (this.testState==='model_error') return emptyDecision(request,'model_error','模型暂时无法返回结果，请重试。');
    if (this.testState==='user_input_required') return emptyDecision(request,'user_input_required','请补充目标作物的实际亩均成本与亩产。');
    if (this.testState==='empty') return emptyDecision(request,'no_data','这些条件下暂时没有可比较的方案。');
    if (request.user_context.city_id!=='shenyang' || this.testState==='insufficient_market_data') {
      const result=emptyDecision(request,'no_data','这个城市暂时没有同口径种植决策样例。');
      result.issues=['insufficient_market_data'];return result;
    }
    const samples=await getDecisionSamples(options.signal);
    const c=request.user_context;
    const month=c.harvest_window.end.slice(0,7);
    const preferred=samples.find((s)=>s.request.contract_version==='0' && s.request.user_context.risk_preference===c.risk_preference && s.request.user_context.harvest_window.end.slice(0,7)===month)
      ?? samples.find((s)=>s.request.contract_version==='0' && s.request.user_context.harvest_window.end.slice(0,7)===month) ?? samples[0];
    const fixture=await readLegacyFixture(preferred.id,options.signal);
    let result=adaptLegacyFixture(fixture);
    if (this.testState) return applyTestState(result,this.testState,request);
    const candidates: DecisionCandidate[]=[];
    for (const original of result.candidates) {
      if (c.crop_preferences.length && !c.crop_preferences.includes(original.crop)) continue;
      if (original.harvest_window.start<c.harvest_window.start || original.harvest_window.end>c.harvest_window.end) continue;
      if (!original.planting_window || original.planting_window.start<c.planting_window.start || original.planting_window.end>c.planting_window.end) continue;
      const actual=c.actual_inputs[original.crop];
      const cost=actual?.cost_per_mu ?? original.inputs.cost_per_mu;
      const yieldPerMu=actual?.yield_kg_per_mu ?? original.inputs.yield_kg_per_mu;
      if (cost===null || yieldPerMu===null || original.price.base===null) continue;
      const area=Math.min(c.area_mu,Math.floor(c.budget_cny/cost*10)/10);
      if(area<=0) continue;
      const candidate=structuredClone(original);
      candidate.area_mu=area;
      candidate.inputs={cost_per_mu:cost,yield_kg_per_mu:yieldPerMu,cost_source:actual?.cost_per_mu ? '用户实际输入' : original.inputs.cost_source,yield_source:actual?.yield_kg_per_mu ? '用户实际输入' : original.inputs.yield_source};
      candidate.profit={...unknownRange('CNY',true),low:operatingProfit(original.price.low,area,yieldPerMu,cost),base:operatingProfit(original.price.base,area,yieldPerMu,cost),high:operatingProfit(original.price.high,area,yieldPerMu,cost)};
      candidate.roi={...unknownRange('ratio',true),low:candidate.profit.low===null?null:candidate.profit.low/(area*cost),base:candidate.profit.base===null?null:candidate.profit.base/(area*cost),high:candidate.profit.high===null?null:candidate.profit.high/(area*cost)};
      candidate.break_even_price=cost/yieldPerMu;
      candidate.confidence=unknownConfidence();
      candidate.reasons=['沿用历史价格情景，按你的面积和成本核算。'];
      candidate.data_quality={label:'历史价格 · 公式情景',proxy_flags:original.data_quality.proxy_flags,mock_fields:['area_mu','inputs','profit','roi','break_even_price','confidence','strategies']};
      candidate.stress_scenarios=[];
      candidate.warnings=candidate.warnings.filter((w)=>!(actual?.cost_per_mu && w.includes('成本科目')));
      candidate.warnings.push('方向沿用历史样例，没有按新条件重新推荐。');
      if(area<c.area_mu) candidate.warnings.push('可用预算限制了这份方案的种植面积。');
      candidates.push(candidate);
    }
    if(!candidates.length) return emptyDecision(request,'no_data','当前作物或日期范围没有匹配的历史情景，请调整条件。');
    result={...result,request,candidates,data_status:'mock',model_version:'decision-ui-formula-v0',
      recommendation:{candidate_id:null,confidence:unknownConfidence(),reasons:['自定义条件仅作方案比较，暂不生成模型推荐。']},
      issues:['scenario_only','no_clear_winner',...(candidates.some((x)=>x.data_quality.proxy_flags.length)?['proxy_only' as const]:[])],
      warnings:['自定义条件为演示情景，价格与风险沿用明确窗口的历史样例。',...(c.actual_inputs && Object.values(c.actual_inputs).some((a)=>a.cost_per_mu)?[]:['参考成本可能缺人工、地租和折旧，利润存在高估风险。'])],
      assumptions:[`价格与风险来自「${preferred.label}」样例的对应上市窗口。`,'只计算收入减成本；未重算价格、风险、置信度或排序。','预算限制种植面积，单户面积不改变市场价格。']};
    return parseDecisionResult(result);
  }
}
function applyTestState(result: DecisionResult,state: MockState,request: DecisionRequest): DecisionResult {
  result.request=request;
  result.data_status='mock';result.model_version='decision-ui-test-v0';
  result.warnings.unshift('界面测试样例，全部读数用于验证交互。');
  for(const c of result.candidates){
    c.data_quality.mock_fields=['all'];c.price.is_mock=true;c.profit.is_mock=true;c.roi.is_mock=true;c.confidence.is_mock=true;
    c.stress_scenarios=c.stress_scenarios.map((s)=>({...s,is_mock:true,profit:{...s.profit,is_mock:true}}));
  }
  result.recommendation.confidence.is_mock=true;
  if(state==='normal'){result.issues=[];result.recommendation.confidence={score:78,grade:'B',level:'high',basis:'界面测试设定。',is_mock:true};}
  if(state==='high_risk'){result.issues.push('high_risk');result.candidates[0].risks={hri:85,market_risk:90,climate_exposure:70};result.warnings.push('这份测试方案承受较高市场压力。');}
  if(state==='low_confidence') result.issues.push('low_confidence');
  if(state==='proxy_only') result.issues.push('proxy_only');
  if(state==='no_clear_winner') result.issues.push('no_clear_winner');
  if(state==='scenario_only') result.issues.push('scenario_only');
  if(state==='partial_data'){
    result.issues.push('partial_result');result.candidates[0].price=unknownRange('CNY/kg',true);
    result.candidates[0].profit=unknownRange('CNY',true);result.candidates[0].roi=unknownRange('ratio',true);result.candidates[0].risks.climate_exposure=null;
    result.candidates[0].stress_scenarios=[];result.warnings.push('部分字段缺失，空值不表示零。');
  }
  result.issues=[...new Set(result.issues)];
  return parseDecisionResult(result);
}
