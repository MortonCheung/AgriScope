import raw100 from '../../../public/decision/legacy-v2/baseline-100.json';
import raw30 from '../../../public/decision/legacy-v2/steady-30.json';
import raw50 from '../../../public/decision/legacy-v2/balanced-50.json';
import raw80 from '../../../public/decision/legacy-v2/return-80.json';
import manifest from '../../../public/decision/legacy-v2/manifest.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adaptLegacyFixture, normalizeLegacyRequest, type LegacyFixture } from './legacyAdapter';
import { MockDecisionProvider, MOCK_STATES } from './MockDecisionProvider';
import { stressPresets } from '../../domain/decision/calculations';
import { HttpDecisionProvider, LegacyFixtureProvider } from './index';
import { formulaStress } from '../../domain/decision/calculations';
import { parseDecisionResult, validateRequest } from '../../domain/decision/validation';

const fixtureMap:Record<string,unknown>={'baseline-100':raw100,'steady-30':raw30,'balanced-50':raw50,'return-80':raw80};
const fixture=raw100 as LegacyFixture;
const request=normalizeLegacyRequest(fixture.request);
beforeEach(()=>vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
  const id=url.split('/').pop()?.replace('.json','');
  const data=id==='manifest'?manifest:fixtureMap[id??''];
  return data?{ok:true,json:async()=>structuredClone(data)}:{ok:false,status:404};
})));
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('Legacy fixture boundary',()=>{
  it('uses API stress values by changes even when scenario IDs differ from legacy IDs',()=>{
    const candidate=adaptLegacyFixture(fixture).candidates[0];
    candidate.stress_scenarios=[{id:'market-softening',label:'API market scenario',changes:{price_pct:-20,yield_pct:0,cost_pct:0,delay_days:0},profit:{...candidate.profit,low:1000,base:2000,high:3000},roi:0.42,delta_cny:-123,is_mock:false,note:'API stress output'}];
    const market=stressPresets(candidate).find(s=>s.id==='price_-20%')!;
    expect(market.label).toBe('市场转弱');expect(market.profit.base).toBe(2000);
    expect(market.roi).toBe(0.42);expect(market.delta_cny).toBe(-123);expect(market.is_mock).toBe(false);expect(market.note).toBe('API stress output');
  });
  it('keeps real profit, recommendation confidence and warnings together',()=>{
    const result=adaptLegacyFixture(fixture);
    expect(result.data_status).toBe('legacy_model_fixture');
    expect(result.candidates[0].price.base).toBe(fixture.output.recommended_plan.price_mid);
    expect(result.candidates[0].profit.base).toBe(fixture.output.recommended_plan.profit_baseline);
    expect(result.recommendation.confidence.score).toBe(37.4);
    expect(result.recommendation.confidence.level).toBe('low');
    expect(result.candidates[0].confidence.score).toBe(82.6);
    expect(result.issues).toContain('no_clear_winner');
    expect(result.warnings.join(' ')).toContain('利润存在高估风险');
    expect(result.candidates[0].price.is_calibrated_interval).toBe(false);
    expect(result.candidates.some(c=>c.price.base===null)).toBe(true);
  });
  it('all selected real snapshots adapt without changing raw primary values',()=>{
    for(const id of ['baseline-100','steady-30','balanced-50','return-80']){
      const raw=fixtureMap[id] as LegacyFixture;
      const result=adaptLegacyFixture(raw);
      expect(result.candidates[0].crop).toBe(raw.output.recommended_plan.crop);
      expect(result.candidates[0].profit.base).toBe(raw.output.recommended_plan.profit_baseline);
    }
  });
  it('legacy provider refuses to relabel unmatched inputs as real model results',async()=>{
    const changed=structuredClone(request);changed.user_context.area_mu=80;
    expect((await new LegacyFixtureProvider().decide(changed)).status).toBe('no_data');
    expect((await new LegacyFixtureProvider().decide(request)).data_status).toBe('legacy_model_fixture');
  });
  it('delay keeps real zero, with no claim that delay has no risk',()=>{
    const delay=adaptLegacyFixture(fixture).candidates[0].stress_scenarios.find(s=>s.changes.delay_days===7)!;
    expect(delay.delta_cny).toBe(0);
    expect(delay.note).toContain('不代表延迟没有风险');
  });
});
describe('Deterministic mock & contract guards',()=>{
  it('honors budget, crop, cost and yield; does not fabricate a recommendation',async()=>{
    const r=structuredClone(request);r.user_context.area_mu=80;r.user_context.budget_cny=400000;
    r.user_context.crop_preferences=['西红柿'];r.user_context.actual_inputs={'西红柿':{cost_per_mu:6000,yield_kg_per_mu:4000}};
    const p=new MockDecisionProvider();const a=await p.decide(r),b=await p.decide(r);
    expect(a).toEqual(b);expect(a.candidates).toHaveLength(1);
    const c=a.candidates[0];expect(c.area_mu*6000).toBeLessThanOrEqual(400000);
    expect(c.profit.base).toBe(c.area_mu*(c.price.base!*4000-6000));
    expect(c.profit.is_mock).toBe(true);expect(c.data_quality.mock_fields).toContain('profit');
    expect(a.recommendation.candidate_id).toBeNull();expect(a.recommendation.confidence.score).toBeNull();
  });
  it('does not silently shift dates or borrow Shenyang prices for another city',async()=>{
    const r=structuredClone(request);r.user_context.harvest_window={start:'2027-11-01',end:'2027-12-31'};
    expect((await new MockDecisionProvider().decide(r)).status).toBe('no_data');
    r.user_context.city_id='dalian';
    expect((await new MockDecisionProvider().decide(r)).issues).toContain('insufficient_market_data');
  });
  it('rejects invalid dates, non-finite inputs, duplicate IDs, wrong units and unordered intervals',()=>{
    const r=structuredClone(request);r.user_context.area_mu=NaN;r.user_context.planting_window.start='2027-02-30';
    expect(validateRequest(r).length).toBeGreaterThanOrEqual(2);
    const good=adaptLegacyFixture(fixture);
    for(const mutate of [
      (x:typeof good)=>{x.candidates.push(x.candidates[0]);},
      (x:typeof good)=>{x.candidates[0].price.base=NaN;},
      (x:typeof good)=>{x.candidates[0].price.low=999;},
      (x:typeof good)=>{x.candidates[0].price.unit='CNY';},
      (x:typeof good)=>{x.recommendation.candidate_id='missing';},
      (x:typeof good)=>{delete (x.candidates[0].stress_scenarios[0].changes as Partial<typeof x.candidates[0]['stress_scenarios'][0]['changes']>).cost_pct;},
    ]){const bad=structuredClone(good);mutate(bad);expect(()=>parseDecisionResult(bad)).toThrow();}
  });
  it('stress obeys operating arithmetic and missing values stay missing',()=>{
    const candidate=adaptLegacyFixture(fixture).candidates[0];
    const stress=formulaStress(candidate,{price_pct:-20,yield_pct:-20,cost_pct:20,delay_days:0},'综合压力');
    expect(stress.profit.base).toBeCloseTo(candidate.area_mu*(candidate.price.base!*.8*candidate.inputs.yield_kg_per_mu!*.8-candidate.inputs.cost_per_mu!*1.2),6);
    expect(stress.is_mock).toBe(true);
    expect(formulaStress(candidate,{price_pct:0,yield_pct:0,cost_pct:0,delay_days:7},'延迟').profit.base).toBeNull();
    expect(stressPresets(candidate).map(s=>s.label)).toEqual(['正常','市场转弱','生产受损','综合压力']);
  });
  it.each(MOCK_STATES.filter(s=>s!=='loading'))('supports the explicit %s UI state',async(state)=>{
    const result=await new MockDecisionProvider(state).decide(request);
    expect(()=>parseDecisionResult(result)).not.toThrow();expect(result.data_status).toBe('mock');
  });
  it('loading can be cancelled',async()=>{
    const controller=new AbortController();const pending=new MockDecisionProvider('loading').decide(request,{signal:controller.signal});
    controller.abort();await expect(pending).rejects.toMatchObject({name:'AbortError'});
  });
  it('HTTP provider checks the contract and rejects conditions from another request',async()=>{
    const raw=adaptLegacyFixture(fixture);raw.data_status='model';
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>raw})));
    expect((await new HttpDecisionProvider('/api/decision').decide(request)).data_status).toBe('model');
    const changed=structuredClone(request);changed.user_context.area_mu=50;
    await expect(new HttpDecisionProvider('/api/decision').decide(changed)).rejects.toThrow('不一致');
  });
  it('HTTP accepts equivalent JSON property ordering',async()=>{
    const raw=adaptLegacyFixture(fixture);raw.data_status='model';
    raw.request.user_context=Object.fromEntries(Object.entries(raw.request.user_context).reverse()) as typeof raw.request.user_context;
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>raw})));
    expect((await new HttpDecisionProvider('/api/decision').decide(request)).data_status).toBe('model');
  });
  it('HTTP failures do not fall back to mock',async()=>{
    const fetchMock=vi.fn(async()=>({ok:false}));vi.stubGlobal('fetch',fetchMock);
    await expect(new HttpDecisionProvider('/api/decision').decide(request)).rejects.toThrow('暂时无法返回');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('HTTP times out with an actionable error',async()=>{
    vi.useFakeTimers();
    vi.stubGlobal('fetch',vi.fn((_url:string,options:{signal:AbortSignal})=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}))));
    const check=expect(new HttpDecisionProvider('/api/decision').decide(request)).rejects.toThrow('响应超时');
    await vi.advanceTimersByTimeAsync(15001);await check;
  });
});
