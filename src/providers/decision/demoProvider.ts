import type { DecisionProvider, DecisionRequest, DecisionResult } from '../../domain/decision/types';
import { validateRequest } from '../../domain/decision/validation';
import { adaptLegacyFixture } from './legacyAdapter';
import { getDecisionSamples, readLegacyFixture, sameConditions } from './fixtures';
import { emptyDecision, MockDecisionProvider, type MockState } from './MockDecisionProvider';
export class LegacyFixtureProvider implements DecisionProvider {
  readonly data_mode='fixtures' as const;
  listSamples(options:{signal?:AbortSignal}={}){return getDecisionSamples(options.signal);}
  async decide(request:DecisionRequest,options:{signal?:AbortSignal}={}):Promise<DecisionResult>{
    const errors=validateRequest(request);if(errors.length)throw new Error(errors.join(' '));
    if(request.contract_version!=='0')throw new Error('历史样例不支持正式市场评估请求。');
    const samples=await getDecisionSamples(options.signal);const sample=samples.find(s=>sameConditions(s.request,request));
    if(!sample)return emptyDecision(request,'no_data','历史模型没有完全匹配这些条件的样例。');
    return adaptLegacyFixture(await readLegacyFixture(sample.id,options.signal),request);
  }
}
class FixtureDecisionProvider implements DecisionProvider {
  readonly data_mode='fixtures' as const;
  listSamples(options:{signal?:AbortSignal}={}){return getDecisionSamples(options.signal);}
  private readonly legacy=new LegacyFixtureProvider();private readonly mock=new MockDecisionProvider();
  async decide(request:DecisionRequest,options:{signal?:AbortSignal}={}){
    const errors=validateRequest(request);if(errors.length)throw new Error(errors.join(' '));const samples=await getDecisionSamples(options.signal);
    return samples.some(s=>sameConditions(s.request,request))?this.legacy.decide(request,options):this.mock.decide(request,options);
  }
}
export function createDemoProvider(mode:'fixtures'|'mock',state?:MockState):DecisionProvider{return mode==='mock'?new MockDecisionProvider(state):new FixtureDecisionProvider();}
