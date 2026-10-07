import type { DecisionCandidate, DecisionCapability, DecisionProvider, DecisionRequest, DecisionResult, StressScenario } from '../../domain/decision/types';
import { parseDecisionResult, sameDecisionContext, validateRequest, isDate } from '../../domain/decision/validation';
import { adaptFinalDecision } from './finalAdapter';
import { resolveProviderMode } from './providerPolicy';
export { LegacyFixtureProvider } from './demoProvider';
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const nullable=(v:unknown)=>v===null||typeof v==='number'&&Number.isFinite(v);
async function readApi(endpoint:string,body:unknown|undefined,signal?:AbortSignal):Promise<unknown>{
  const controller=new AbortController();const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const timer=setTimeout(abort,15000);
  try{const response=await fetch(endpoint,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),signal:controller.signal});if(!response.ok)throw new Error('模型暂时无法返回结果，请重试。');return await response.json();}
  catch(error){if(signal?.aborted)throw new DOMException('Aborted','AbortError');if(controller.signal.aborted)throw new Error('模型响应超时，请重试。');if(error instanceof TypeError)throw new Error('正式模型连接暂时不可用，请重试。');if(error instanceof SyntaxError)throw new Error('模型响应格式不完整，请重试。');throw error;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export function parseCapability(value:unknown,cityId:string):DecisionCapability{
  if(!object(value)||value.city_id!==cityId||typeof value.supported!=='boolean'||typeof value.tier!=='string'||!(value.market_as_of===null||isDate(value.market_as_of))||!Array.isArray(value.crops)||!value.crops.every(c=>object(c)&&typeof c.id==='string'&&c.id&&typeof c.label==='string'&&Array.isArray(c.horizons)&&c.horizons.every(h=>object(h)&&[7,14,30,60,90].includes(Number(h.days))&&typeof h.days==='number'&&['model','scenario_only'].includes(String(h.mode)))))throw new Error('城市决策能力暂时无法确认。');
  if(value.supported&&(!value.market_as_of||value.crops.length===0))throw new Error('城市市场数据日期尚未就绪。');
  if(typeof value.model_version!=='string'||typeof value.data_version!=='string'||typeof value.code_fingerprint!=='string'||!(value.limitation===null||typeof value.limitation==='string'))throw new Error('城市能力缺少版本信息。');return value as unknown as DecisionCapability;
}
export class HttpDecisionProvider implements DecisionProvider {
  readonly data_mode='api' as const;
  constructor(private readonly endpoint:string,private readonly adapter:(payload:unknown)=>DecisionResult=adaptFinalDecision,private readonly options:{capabilityUrl?:string;stressUrl?:string}={}){}
  async decide(request:DecisionRequest,options:{signal?:AbortSignal}={}):Promise<DecisionResult>{const errors=validateRequest(request);if(errors.length)throw new Error(errors.join(' '));const result=parseDecisionResult(this.adapter(await readApi(this.endpoint,request,options.signal)));if(!sameDecisionContext(result.request,request))throw new Error('模型返回的条件与当前输入不一致。');if(request.contract_version==='1'&&result.data_status!=='model')throw new Error('正式接口不能返回历史样例或演示结果。');return result;}
  async capabilities(cityId:string,options:{signal?:AbortSignal}={}){const endpoint=this.options.capabilityUrl??`${this.endpoint.replace(/\/$/,'')}/capabilities`;return parseCapability(await readApi(`${endpoint}${endpoint.includes('?')?'&':'?'}${new URLSearchParams({city:cityId})}`,undefined,options.signal),cityId);}
  async stress(request:DecisionRequest,candidate:DecisionCandidate,changes:StressScenario['changes'],options:{signal?:AbortSignal}={}):Promise<StressScenario>{
    const raw=await readApi(this.options.stressUrl??`${this.endpoint.replace(/\/$/,'')}/stress`,{request,candidate_id:candidate.id,changes},options.signal);
    if(!object(raw)||raw.candidate_id!==candidate.id||!object(raw.changes)||!Object.entries(changes).every(([key,value])=>(raw.changes as Record<string,unknown>)[key]===value)||typeof raw.available!=='boolean'||!nullable(raw.profit_base)||!nullable(raw.delta_cny)||!nullable(raw.roi)||typeof raw.note!=='string'||typeof raw.model_version!=='string'||typeof raw.data_version!=='string')throw new Error('压力结果格式或条件不一致。');
    if(!raw.available&&(raw.profit_base!==null||raw.delta_cny!==null||raw.roi!==null))throw new Error('不可用压力结果不能携带收益。');
    return {id:'custom',label:'压力情景',changes,profit:{unit:'CNY',low:null,base:raw.profit_base as number|null,high:null,semantics:'model_scenario',is_calibrated_interval:false,is_mock:false},roi:raw.roi as number|null,delta_cny:raw.delta_cny as number|null,is_mock:false,note:raw.note};
  }
}
class UnavailableProvider implements DecisionProvider {
  readonly data_mode='api' as const;
  async decide():Promise<DecisionResult>{throw new Error('正式模型连接尚未配置。');}
  async capabilities():Promise<DecisionCapability>{throw new Error('正式模型连接尚未配置。');}
}
class DemoProvider implements DecisionProvider {
  constructor(readonly data_mode:'fixtures'|'mock',private readonly state?:string){}
  private async load(){const {createDemoProvider}=await import('./demoProvider');return createDemoProvider(this.data_mode,this.state as Parameters<typeof createDemoProvider>[1]);}
  async listSamples(options:{signal?:AbortSignal}={}){return (await this.load()).listSamples!(options);}
  async decide(request:DecisionRequest,options:{signal?:AbortSignal}={}){return (await this.load()).decide(request,options);}
}
const mode=resolveProviderMode(import.meta.env.VITE_DECISION_PROVIDER,import.meta.env.VITE_ENABLE_DEMO==='true',import.meta.env.PROD);
const demosAllowed=!import.meta.env.PROD||import.meta.env.VITE_ENABLE_DEMO==='true'&&(import.meta.env.VITE_DECISION_PROVIDER==='fixtures'||import.meta.env.VITE_DECISION_PROVIDER==='mock');
const provider:DecisionProvider=demosAllowed&&(mode==='fixtures'||mode==='mock')?new DemoProvider(mode):mode==='unavailable'?new UnavailableProvider():new HttpDecisionProvider(import.meta.env.VITE_DECISION_API_URL||'/api/decision',adaptFinalDecision,{capabilityUrl:import.meta.env.VITE_CAPABILITY_URL,stressUrl:import.meta.env.VITE_STRESS_URL});
const testProviders=new Map<string,DecisionProvider>();
export function getDecisionProvider(testState?:string|null):DecisionProvider{
  if(import.meta.env.DEV&&testState&&['normal','high_risk','low_confidence','insufficient_market_data','user_input_required','model_error','loading','empty','partial_data','proxy_only','no_clear_winner','scenario_only'].includes(testState)){if(!testProviders.has(testState))testProviders.set(testState,new DemoProvider('mock',testState));return testProviders.get(testState)!;}
  return provider;
}
