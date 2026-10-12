// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpProductDecisionProvider } from './index';
import { canonicalProductRequest, productContextHash, validateProductResponse } from './validation';
import type { ProductDecisionRequest, ProductDecisionResponse } from '../../domain/decision/productApi';
const request: ProductDecisionRequest = {contract_version:'product-1',city_id:'tieling',crop:'黄瓜',area_mu:10,budget_cny:10000,target:'conservative',sale_date:null,yield_kg_per_mu:500,cost_per_mu:1000,sale_price_per_kg:4,sale_fraction:.8,price_is_user:true,as_of:'2026-10-10'};
async function response(): Promise<ProductDecisionResponse> {
 return {contract_version:'product-1',request,context_hash:await productContextHash(request),candidates:[{id:'reserve',crop:'黄瓜',area_mu:8,price_per_kg:4,horizon_days:null,sales_window:null,revenue_cny:12800,cost_cny:8000,profit_cny:4800,break_even_price:2.5,risk:'低',reasons:['保留经营余量。']}],recommendation:{candidate_id:'reserve',reasons:['保留经营余量。']},origin:{source_city:null,target_city:'tieling',route:'formula',model_id:null,transfer_policy:null,llm_used:true,forecasts:[],data_version:'fixture'}};
}
afterEach(()=>vi.unstubAllGlobals());
describe('product contract validation and validated cache',()=>{
 it('uses the exact server binary64 identity including negative zero',()=>{
  expect(canonicalProductRequest({a:10,b:.9,c:-0})).toBe('{"a":{"$number":"4024000000000000"},"b":{"$number":"3feccccccccccccd"},"c":{"$number":"0000000000000000"}}');
 });
 it('accepts an actually selected feasible plan, and rejects wrong city, hash, amount or budget',async()=>{
  expect((await validateProductResponse(await response(),request)).recommendation.candidate_id).toBe('reserve');
  for(const mutate of [
   (r:ProductDecisionResponse)=>{r.request={...r.request,city_id:'dalian'};},
   (r:ProductDecisionResponse)=>{r.context_hash='0'.repeat(64);},
   (r:ProductDecisionResponse)=>{r.candidates[0].profit_cny=999999;},
   (r:ProductDecisionResponse)=>{r.candidates[0].area_mu=11;},
   (r:ProductDecisionResponse)=>{r.recommendation.candidate_id='unknown';},
   (r:ProductDecisionResponse)=>{r.candidates[0].price_per_kg=5;},
  ]) {const raw=await response();mutate(raw);await expect(validateProductResponse(raw,request)).rejects.toThrow();}
 });
 it('caches only validated current results; failures and aborted requests never populate it',async()=>{
  vi.stubGlobal('window',{setTimeout,clearTimeout});
  const raw=await response();const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>raw});vi.stubGlobal('fetch',fetcher);
  const provider=new HttpProductDecisionProvider();
  await provider.decide(request);await provider.decide(request);expect(fetcher).toHaveBeenCalledOnce();
  const bad={...request,area_mu:9};await expect(provider.decide(bad)).rejects.toThrow();expect(provider.peek(bad)).toBeNull();
  const controller=new AbortController();controller.abort();await expect(provider.decide(bad,{signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});
 });
});
