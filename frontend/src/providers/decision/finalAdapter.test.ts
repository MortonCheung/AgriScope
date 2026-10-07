import { describe,expect,it } from 'vitest';
import { adaptFinalDecision,FINAL_STATUSES } from './finalAdapter';
import { finalEnvelope,finalRequest,finalCapability } from '../../test/finalDecisionFixture';
import { resolveProviderMode } from './providerPolicy';
import { parseCapability } from './index';
import { validateRequest,sameDecisionContext } from '../../domain/decision/validation';

describe('formal production boundary',()=>{
  it.each([undefined,'','api'])('defaults to API without fixtures (%s)',mode=>expect(resolveProviderMode(mode,false,true)).toBe('api'));
  it.each(['fixtures','mock'])('requires explicit production demo permission (%s)',mode=>{expect(resolveProviderMode(mode,false,true)).toBe('unavailable');expect(resolveProviderMode(mode,true,true)).toBe(mode);expect(resolveProviderMode(mode,false,false)).toBe(mode);});
  it('rejects an unknown provider',()=>expect(resolveProviderMode('typo',true,true)).toBe('unavailable'));
});
describe('Final Adapter',()=>{
  it.each(FINAL_STATUSES)('maps registered status %s without substituting legacy',status=>{
    const envelope=finalEnvelope(status);if(['INSUFFICIENT_MARKET_DATA','NO_FEASIBLE_PLAN','NO_FEASIBLE_WINDOW','MODEL_ERROR'].includes(status))envelope.batch.all=[];
    const result=adaptFinalDecision(envelope);expect(result.data_status).toBe('model');expect(result.model_status).toBe(status);expect(result.contract_version).toBe('1');
    if(status==='NO_FEASIBLE_WINDOW')expect(result.issues).toContain('no_feasible_window');
    if(status==='NO_CLEAR_WINNER'){expect(result.issues).toContain('no_clear_winner');expect(result.recommendation.candidate_id).toBeNull();}
    if(status==='NO_DIVERSIFICATION_BENEFIT')expect(result.issues).toContain('no_diversification_benefit');
    if(status==='MODEL_ERROR')expect(result.status).toBe('model_error');
  });
  it('preserves valid market outputs when batch cannot rank missing-profit inputs',()=>{
    const raw=finalEnvelope('USER_INPUT_REQUIRED');raw.batch.status='NO_FEASIBLE_PLAN';raw.batch.ranking=[];raw.batch.all[0].profit.available=false;
    const result=adaptFinalDecision(raw);expect(result.status).toBe('ok');expect(result.issues).toContain('user_input_required');expect(result.issues).not.toContain('no_feasible_plan');expect(result.candidates[0].price.base).toBe(3.944);expect(result.candidates[0].profit.base).toBeNull();expect(result.recommendation.candidate_id).toBeNull();
  });
  it('does not invent profit range, confidence grades, evidence or stress results',()=>{const c=adaptFinalDecision(finalEnvelope()).candidates[0];expect(c.profit.low).toBeNull();expect(c.profit.high).toBeNull();expect(c.confidence.grade).toBeNull();expect(c.confidence.level).toBe('reported');expect(c.confidence_components?.profit?.score).toBe(13.8);expect(c.evidence).toEqual([]);expect(c.stress_scenarios).toEqual([]);expect(c.profit_basis).toBe('reference');});
  it('elevates profit only when both model sources and actual request inputs agree',()=>{const request=finalRequest();request.user_context.actual_inputs={'西红柿':{cost_per_mu:1000,yield_kg_per_mu:500}};const raw=finalEnvelope('OK',request);raw.batch.all[0].profit.cost_source_class='user_input';expect(adaptFinalDecision(raw).candidates[0].profit_basis).toBe('reference');raw.batch.all[0].profit.yield_source_class='user_input';expect(adaptFinalDecision(raw).candidates[0].profit_basis).toBe('user_input');});
  it.each(['scenario_range_unreliable','no_range_available','unknown_range'])('does not draw unsupported ranges: %s',status=>{const raw=finalEnvelope();raw.batch.all[0].scenario_range.status=status;const c=adaptFinalDecision(raw).candidates[0];expect(c.price.low).toBeNull();expect(c.price.high).toBeNull();expect(c.price.base).toBe(3.944);expect(c.price.is_calibrated_interval).toBe(false);});
  it('marks long horizon scenario only',()=>{const request=finalRequest();request.user_context.market_context.horizon_days=90;const result=adaptFinalDecision(finalEnvelope('SCENARIO_ONLY',request));expect(result.issues).toContain('scenario_only');expect(result.candidates[0].market_context?.scenario_only).toBe(true);});
  it.each(['city','crop','horizon','area','status','as_of'])('rejects mismatched native %s',field=>{const raw=finalEnvelope();if(field==='city')raw.batch.all[0].city='大连';if(field==='crop')raw.batch.all[0].crop='黄瓜';if(field==='horizon')raw.batch.all[0].horizon_days=90;if(field==='area')raw.batch.all[0].area_mu=1;if(field==='status')raw.batch.all[0].status='unknown';if(field==='as_of')raw.market_as_of='2026-09-15';expect(()=>adaptFinalDecision(raw)).toThrow();});
  it('does not use a budget warning to resize or rerank the model plan',()=>{const raw=finalEnvelope();raw.request.user_context.budget_cny=100;const c=adaptFinalDecision(raw).candidates[0];expect(c.area_mu).toBe(60);expect(c.warnings).toContain('这份方案的投入超过可用预算。');});
});
describe('capabilities and date contract',()=>{
  it('keeps canonical crop IDs and per-horizon scenario capability',()=>{const cap=parseCapability(finalCapability(),'shenyang');expect(cap.crops[0].id).toBe('西红柿');expect(cap.crops[0].horizons[2].mode).toBe('scenario_only');});
  it('supports a natural unavailable city with no borrowed crops',()=>{const raw={...finalCapability('dalian'),tier:'INSUFFICIENT',supported:false,crops:[],market_as_of:null};expect(parseCapability(raw,'dalian').supported).toBe(false);});
  it('rejects another city capability and malformed horizons',()=>{expect(()=>parseCapability(finalCapability(),'dalian')).toThrow();const raw=finalCapability();raw.crops[0].horizons[0].days=4;expect(()=>parseCapability(raw,'shenyang')).toThrow();});
  it('separates optional climate date from market horizon without forcing agriculture windows',()=>{const r=finalRequest();expect(validateRequest(r)).toEqual([]);r.user_context.market_context.harvest_date='2027-04-01';expect(validateRequest(r)).toEqual([]);expect(r.user_context).not.toHaveProperty('planting_window');const changed=structuredClone(r);changed.user_context.market_context.horizon_days=90;expect(sameDecisionContext(r,changed)).toBe(false);});
  it.each(['2026-02-30','not-a-date'])('rejects invalid formal data date %s',value=>{const r=finalRequest();r.user_context.market_context.as_of=value;expect(validateRequest(r).length).toBeGreaterThan(0);});
});
