import type { DecisionProvider, DecisionRequest, DecisionResult } from '../../domain/decision/types';
import { parseDecisionResult, sameDecisionContext, validateRequest } from '../../domain/decision/validation';
import { adaptLegacyFixture } from './legacyAdapter';
import { getDecisionSamples, readLegacyFixture, sameConditions } from './fixtures';
import { emptyDecision, MockDecisionProvider, MOCK_STATES, type MockState } from './MockDecisionProvider';

export class LegacyFixtureProvider implements DecisionProvider {
  readonly data_mode='fixtures' as const;
  listSamples(options:{signal?:AbortSignal}={}){return getDecisionSamples(options.signal);}
  async decide(request: DecisionRequest,options: {signal?:AbortSignal}={}): Promise<DecisionResult>{
    const errors=validateRequest(request);if(errors.length)throw new Error(errors.join(' '));
    const samples=await getDecisionSamples(options.signal);
    const sample=samples.find((s)=>sameConditions(s.request,request));
    if(!sample)return emptyDecision(request,'no_data','历史模型没有完全匹配这些条件的样例。');
    return adaptLegacyFixture(await readLegacyFixture(sample.id,options.signal),request);
  }
}
class FixtureDecisionProvider implements DecisionProvider {
  readonly data_mode='fixtures' as const;
  listSamples(options:{signal?:AbortSignal}={}){return getDecisionSamples(options.signal);}
  private readonly legacy=new LegacyFixtureProvider();
  private readonly mock=new MockDecisionProvider();
  async decide(request: DecisionRequest,options: {signal?:AbortSignal}={}): Promise<DecisionResult>{
    const errors=validateRequest(request);if(errors.length)throw new Error(errors.join(' '));
    const samples=await getDecisionSamples(options.signal);
    return samples.some((s)=>sameConditions(s.request,request))?this.legacy.decide(request,options):this.mock.decide(request,options);
  }
}
export class HttpDecisionProvider implements DecisionProvider {
  readonly data_mode='api' as const;
  constructor(private readonly endpoint:string,private readonly adapter:(payload:unknown)=>DecisionResult=parseDecisionResult){}
  async decide(request:DecisionRequest,options:{signal?:AbortSignal}={}):Promise<DecisionResult>{
    const errors=validateRequest(request);if(errors.length)throw new Error(errors.join(' '));
    const controller=new AbortController();
    const abort=()=>controller.abort();
    options.signal?.addEventListener('abort',abort,{once:true});
    if(options.signal?.aborted)controller.abort();
    const timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(this.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:controller.signal});
      if(!response.ok)throw new Error('模型暂时无法返回结果，请重试。');
      const result=parseDecisionResult(this.adapter(await response.json()));
      if(!sameDecisionContext(result.request,request))throw new Error('模型返回的条件与当前输入不一致。');
      return result;
    }catch(error){
      if(options.signal?.aborted)throw new DOMException('Aborted','AbortError');
      if(controller.signal.aborted)throw new Error('模型响应超时，请重试。');
      throw error;
    }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
  }
}
/** The single switch for Final Model. No silent fallback from failed real API to mock. */
const provider:DecisionProvider=import.meta.env.VITE_DECISION_PROVIDER==='api'
  ? new HttpDecisionProvider(import.meta.env.VITE_DECISION_API_URL || '/api/decision')
  : new FixtureDecisionProvider();
const testProviders=new Map<MockState,DecisionProvider>();
export function getDecisionProvider(testState?:string|null):DecisionProvider{
  if(import.meta.env.DEV && MOCK_STATES.includes(testState as MockState)){
    const state=testState as MockState;
    if(!testProviders.has(state))testProviders.set(state,new MockDecisionProvider(state));
    return testProviders.get(state)!;
  }
  return provider;
}
