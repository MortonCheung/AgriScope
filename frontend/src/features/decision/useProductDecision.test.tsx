// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProductDecision } from './useProductDecision';
import { getProductDecisionProvider } from '../../providers/productDecision';
import type { ProductDecisionRequest, ProductDecisionResponse } from '../../domain/decision/productApi';
vi.mock('../../providers/productDecision',()=>({getProductDecisionProvider:vi.fn()}));
const request: ProductDecisionRequest={contract_version:'product-1',city_id:'tieling',crop:'黄瓜',area_mu:10,budget_cny:10000,target:'conservative',sale_date:null,yield_kg_per_mu:500,cost_per_mu:1000,sale_price_per_kg:4,sale_fraction:.8,price_is_user:true,as_of:null};
function Surface({price}:{price:number|null}){const data=useProductDecision(price===null?null:{...request,sale_price_per_kg:price});return <output>{data?.request.sale_price_per_kg??'immediate'}</output>;}
beforeEach(()=>vi.useFakeTimers());afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
describe('recommendation lifecycle',()=>{
 it('coalesces edits, aborts obsolete input, and ignores a late stale result',async()=>{
  const pending: Array<{resolve:(r:ProductDecisionResponse)=>void;request:ProductDecisionRequest;signal?:AbortSignal}>=[];
  const decide=vi.fn((r:ProductDecisionRequest,options?:{signal?:AbortSignal})=>new Promise<ProductDecisionResponse>(resolve=>pending.push({resolve,request:r,signal:options?.signal})));
  vi.mocked(getProductDecisionProvider).mockReturnValue({decide});
  const view=render(<Surface price={4}/>);view.rerender(<Surface price={5}/>);
  await act(async()=>{await vi.advanceTimersByTimeAsync(350);});expect(decide).toHaveBeenCalledOnce();
  view.rerender(<Surface price={6}/>);expect(pending[0].signal?.aborted).toBe(true);
  await act(async()=>{await vi.advanceTimersByTimeAsync(350);});
  await act(async()=>{pending[1].resolve({request:pending[1].request} as ProductDecisionResponse);});expect(view.container.textContent).toBe('6');
  await act(async()=>{pending[0].resolve({request:pending[0].request} as ProductDecisionResponse);});expect(view.container.textContent).toBe('6');
  view.rerender(<Surface price={null}/>);expect(view.container.textContent).toBe('immediate');
 });
});
