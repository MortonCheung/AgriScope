import type { Confidence, DecisionCandidate, DecisionIssue, DecisionRequest, DecisionResult, FinalDecisionRequest, ScenarioRange } from '../../domain/decision/types';
import { getCity } from '../../domain/geography/cities';
import { isDate, parseDecisionResult, sameDecisionContext, validateRequest } from '../../domain/decision/validation';

type ObjectValue=Record<string,unknown>;
const object=(v:unknown):v is ObjectValue=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const num=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)?v:null;
const strings=(v:unknown):string[]=>Array.isArray(v)&&v.every(x=>typeof x==='string')?v:[];
const block=(v:unknown):ObjectValue=>object(v)?v:{};
export const FINAL_STATUSES=['OK','LOW_CONFIDENCE','PARTIAL','SCENARIO_ONLY','USER_INPUT_REQUIRED','INSUFFICIENT_MARKET_DATA','NO_FEASIBLE_PLAN','NO_FEASIBLE_WINDOW','NO_CLEAR_WINNER','NO_DIVERSIFICATION_BENEFIT','MODEL_ERROR'] as const;
const SOURCE_LABELS:Record<string,string>={user_input:'用户实际输入',real:'公开成本口径',local_reference:'本地参考',regional_proxy:'区域参考',assumption:'假设亩产',missing:'未提供',NOT_FOUND:'未提供'};
const source=(v:unknown)=>typeof v==='string'?(SOURCE_LABELS[v]??'参考口径'):'未提供';
const clean=(v:string)=>v.replace(/Profit/g,'收益').replace(/HRI/g,'跟风风险').replace(/Market Risk/g,'市场风险').replace(/ROI/g,'投入回报率').replace(/proxy/g,'参考口径').replace(/USER_INPUT_REQUIRED/g,'需补实际投入');
const range=(unit:ScenarioRange['unit'],base:unknown,low:unknown=null,high:unknown=null):ScenarioRange=>({unit,base:num(base),low:num(low),high:num(high),semantics:'model_scenario',is_calibrated_interval:false,is_mock:false});
function confidence(score:unknown,basis:string,low=false):Confidence{
  const value=num(score);return {score:value,grade:null,level:value===null?'unknown':low?'low':'reported',basis,is_mock:false};
}
function issuesFor(status:string):DecisionIssue[]{
  const map:Record<string,DecisionIssue[]>={LOW_CONFIDENCE:['low_confidence'],PARTIAL:['partial_result'],SCENARIO_ONLY:['scenario_only'],USER_INPUT_REQUIRED:['user_input_required','partial_result'],INSUFFICIENT_MARKET_DATA:['insufficient_market_data'],NO_FEASIBLE_PLAN:['no_feasible_plan'],NO_FEASIBLE_WINDOW:['no_feasible_window'],NO_CLEAR_WINNER:['no_clear_winner'],NO_DIVERSIFICATION_BENEFIT:['no_diversification_benefit']};
  return map[status]??[];
}
const stateMessage:Record<string,string>={NO_FEASIBLE_PLAN:'这些条件下暂时没有可行方案。',NO_FEASIBLE_WINDOW:'这个作物暂时没有合适的上市窗口。',NO_CLEAR_WINNER:'几个方案差异很小。',NO_DIVERSIFICATION_BENEFIT:'当前组合没有明确的分散收益。',INSUFFICIENT_MARKET_DATA:'当前城市或作物没有同口径市场数据。',USER_INPUT_REQUIRED:'补充实际成本与亩产后，再核算收益。',MODEL_ERROR:'模型暂时无法返回结果，请重试。'};

function candidate(raw:ObjectValue,request:FinalDecisionRequest,asOf:string):DecisionCandidate{
  const context=request.user_context;
  if(raw.city!==getCity(context.city_id)?.shortName||typeof raw.crop!=='string'||!raw.crop||!FINAL_STATUSES.includes(raw.status as typeof FINAL_STATUSES[number]))throw new Error('模型返回的城市、作物或状态不一致。');
  if(context.crop_preferences.length&&!context.crop_preferences.includes(raw.crop))throw new Error('模型返回了未选择的作物。');
  if(num(raw.area_mu)!==context.area_mu||num(raw.horizon_days)!==context.market_context.horizon_days)throw new Error('模型返回的面积或评估跨度不一致。');
  const price=block(raw.price),profit=block(raw.profit),conf=block(raw.confidence),scenario=block(raw.scenario_range);
  if(price.unit!==undefined&&price.unit!=='CNY/kg')throw new Error('模型价格单位与当前契约不一致。');
  const reliable=['scenario_range','scenario_range_widened'].includes(String(scenario.status));
  const actual=profit.available===true&&profit.cost_source_class==='user_input'&&profit.yield_source_class==='user_input'&&context.actual_inputs[raw.crop]?.cost_per_mu!=null&&context.actual_inputs[raw.crop]?.yield_kg_per_mu!=null;
  const harvest=typeof raw.harvest_date==='string'&&isDate(raw.harvest_date)?raw.harvest_date:asOf;
  const warnings=strings(raw.warnings).map(clean).filter(w=>!w.includes('区间校准状态='));
  if(!reliable)warnings.unshift('价格情景范围待评估。');
  if(profit.available!==true)warnings.unshift(stateMessage.USER_INPUT_REQUIRED);
  else if(!actual)warnings.unshift('收益基于参考成本或亩产。');
  const cost=num(profit.cost_per_mu);
  if(cost!==null&&context.area_mu*cost>context.budget_cny)warnings.unshift('这份方案的投入超过可用预算。');
  const reasons=strings(raw.reasons).filter(s=>s.startsWith('历史同期气候暴露=')||s.startsWith('HRI=')||s.startsWith('Market Risk=')).map(s=>clean(s).replace(/（(?:low|medium|high).*?）/g,''));
  const overall=confidence(conf.overall_confidence,'模型给出的当前方向综合可信度；不代表收益保证。',raw.status==='LOW_CONFIDENCE');
  const evidence=Array.isArray(raw.evidence)?raw.evidence.filter(object).map(e=>({city_id:String(e.city_id??context.city_id),research_id:String(e.research_id),label:String(e.label??'研究依据'),role:(e.role==='input'?'input':'background') as 'input'|'background'})):[];
  const risk=(key:string)=>{const b=block(raw[key]);return b.available===false?null:num(b.value);};
  return {id:raw.crop,crop:raw.crop,area_mu:context.area_mu,planting_window:null,harvest_window:{start:harvest,end:harvest},strategies:[context.risk_preference==='aggressive'?'return':context.risk_preference==='conservative'?'robust':'balanced'],
    price:range('CNY/kg',price.mid,reliable?price.low:null,reliable?price.high:null),profit:range('CNY',profit.available===true?profit.profit:null),roi:range('ratio',profit.available===true?profit.roi:null),break_even_price:profit.available===true?num(profit.break_even_price):null,
    inputs:{cost_per_mu:cost,yield_kg_per_mu:num(profit.expected_yield_per_mu),cost_source:source(profit.cost_source_class),yield_source:source(profit.yield_source_class)},
    risks:{hri:risk('hri'),market_risk:risk('market_risk'),climate_exposure:risk('climate_exposure')},confidence:overall,
    confidence_components:{price:confidence(conf.price_confidence,'市场价格情景的模型可信评分。'),profit:confidence(conf.profit_confidence,'投入来源充分程度，不是实现收益的概率。'),risk:confidence(conf.risk_confidence,'风险指标的数据与模型可用性。'),...(conf.data_confidence!==undefined?{data:confidence(conf.data_confidence,'模型返回的数据可信评分。')}:{} )},
    profit_basis:actual?'user_input':profit.available===true?'reference':'missing',market_context:{as_of:asOf,horizon_days:context.market_context.horizon_days,scenario_only:price.scenario_only===true||raw.status==='SCENARIO_ONLY'||context.market_context.horizon_days>=60,range_status:String(scenario.status??'no_range_available'),harvest_date:context.market_context.harvest_date},model_status:String(raw.status),
    reasons,warnings:[...new Set(warnings)],data_quality:{label:actual?'实际投入 · 市场情景':profit.available===true?'参考投入 · 市场情景':'市场情景 · 收益待补充',proxy_flags:strings(raw.proxy_flags).map(clean),mock_fields:[]},evidence,stress_scenarios:[]};
}

/** Adapts actual Final inference, including its batch wrapper and missing modules. */
export function adaptFinalDecision(value:unknown,expected?:DecisionRequest):DecisionResult{
  if(object(value)&&['0','1'].includes(String(value.contract_version)))return parseDecisionResult(value);
  if(!object(value)||validateRequest(value.request).length||!object(value.request)||value.request.contract_version!=='1'||!object(value.batch))throw new Error('正式模型响应格式不完整。');
  const request=value.request as unknown as FinalDecisionRequest;
  if(expected&&!sameDecisionContext(request,expected))throw new Error('模型返回的条件与当前输入不一致。');
  const batch=value.batch;const status=String(batch.status);
  if(!FINAL_STATUSES.includes(status as typeof FINAL_STATUSES[number])||!Array.isArray(batch.all)||!batch.all.every(object)||!Array.isArray(batch.ranking))throw new Error('正式模型状态或候选格式不完整。');
  const rows=batch.all as ObjectValue[];
  if(rows.some(r=>!FINAL_STATUSES.includes(r.status as typeof FINAL_STATUSES[number])))throw new Error('模型返回了未登记状态。');
  const asOf=typeof value.market_as_of==='string'&&isDate(value.market_as_of)?value.market_as_of:request.user_context.market_context.as_of;
  if(asOf!==request.user_context.market_context.as_of)throw new Error('模型使用的数据基准日与当前输入不一致。');
  const usable=rows.filter(r=>object(r.price)&&num(r.price.mid)!==null&&!['INSUFFICIENT_MARKET_DATA','NO_FEASIBLE_PLAN','NO_FEASIBLE_WINDOW','MODEL_ERROR'].includes(String(r.status)));
  const candidates=usable.map(r=>candidate(r,request,asOf));
  const issues:DecisionIssue[]=[...issuesFor(status),...usable.flatMap(r=>issuesFor(String(r.status)))];
  if(candidates.length&&candidates.every(c=>c.profit_basis==='missing')){issues.push('user_input_required');const index=issues.indexOf('no_feasible_plan');if(index>=0)issues.splice(index,1);}
  if(candidates.some(c=>c.market_context?.scenario_only))issues.push('scenario_only');
  if(candidates.some(c=>c.profit_basis==='reference'||c.data_quality.proxy_flags.length))issues.push('proxy_only');
  if(rows.some(r=>r.status==='INSUFFICIENT_MARKET_DATA'))issues.push('insufficient_market_data');
  const first=candidates[0];
  const ranking=(batch.ranking as unknown[]).filter(object);
  const recommended=!issues.includes('no_clear_winner')?candidates.find(c=>c.crop===ranking[0]?.crop)?.id??null:null;
  const terminal:DecisionResult['status']=status==='MODEL_ERROR'||rows.some(r=>r.status==='MODEL_ERROR')&&!candidates.length?'model_error':status==='USER_INPUT_REQUIRED'&&!candidates.length?'user_input_required':'no_data';
  const reason=stateMessage[status];
  const result:DecisionResult={contract_version:'1',status:candidates.length?'ok':terminal,request,candidates,recommendation:{candidate_id:recommended,confidence:first?.confidence??confidence(null,'尚无可比较的市场情景。'),reasons:reason?[reason]:[]},issues:[...new Set(issues)],warnings:candidates.length?[]:[reason??'当前条件下没有可比较结果。'],assumptions:['价格口径为数据基准日后指定跨度的市场情景，不是任意上市日价格。','模型不约束农业种植日历，也不执行预算或面积优化。'],data_status:'model',fixture_id:null,model_version:String(value.model_version??rows[0]?.model_version??''),data_version:String(value.data_version??rows[0]?.data_version??''),code_fingerprint:typeof value.code_fingerprint==='string'?value.code_fingerprint:undefined,model_status:status};
  if(!result.model_version||!result.data_version)throw new Error('正式模型缺少版本标记。');
  return parseDecisionResult(result);
}
