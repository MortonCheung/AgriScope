// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { cancelDecision, readSavedDecision, useDecisionSession } from './useDecisionSession';
import { adaptLegacyFixture, normalizeLegacyRequest, type LegacyFixture } from '../providers/decision/legacyAdapter';
import raw from '../../public/decision/legacy-v2/baseline-100.json';
import type { DecisionProvider, DecisionResult } from '../domain/decision/types';

const fixture=raw as LegacyFixture;
const request=normalizeLegacyRequest(fixture.request);
const deferred=()=>{let resolve!:(r:DecisionResult)=>void;const promise=new Promise<DecisionResult>(r=>{resolve=r;});return {promise,resolve};};
let seq=0;
beforeEach(()=>sessionStorage.clear());
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('decision session request ownership',()=>{
  it('ignores late responses, even when a provider ignores abort',async()=>{
    const first=deferred(),second=deferred();
    const provider:DecisionProvider={decide:vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)};
    const key=`race-${++seq}`;const {result}=renderHook(()=>useDecisionSession('shenyang',provider,key));
    const changed=structuredClone(request);changed.user_context.area_mu=50;
    let a!:Promise<void>,b!:Promise<void>;
    act(()=>{a=result.current.run(request);});
    act(()=>{b=result.current.run(changed);});
    expect(result.current.state.status).toBe('loading');expect(result.current.state.result).toBeNull();
    await act(async()=>{second.resolve(adaptLegacyFixture(fixture,changed));await b;});
    expect(result.current.state.result?.request.user_context.area_mu).toBe(50);
    await act(async()=>{first.resolve(adaptLegacyFixture(fixture,request));await a;});
    expect(result.current.state.result?.request.user_context.area_mu).toBe(50);
    expect(readSavedDecision(`shenyang:${key}`)?.user_context.area_mu).toBe(50);
  });
  it('cancelled results never reappear',async()=>{
    const pending=deferred();const provider:DecisionProvider={decide:()=>pending.promise};const key=`cancel-${++seq}`;
    const {result}=renderHook(()=>useDecisionSession('shenyang',provider,key));let run!:Promise<void>;
    act(()=>{run=result.current.run(request);});act(()=>result.current.cancel());
    await act(async()=>{pending.resolve(adaptLegacyFixture(fixture));await run;});
    expect(result.current.state.status).toBe('idle');expect(result.current.state.result).toBeNull();
  });
  it('rejects mismatched conditions and permits retry',async()=>{
    const changed=structuredClone(request);changed.user_context.budget_cny=1;
    const provider:DecisionProvider={decide:vi.fn().mockResolvedValueOnce(adaptLegacyFixture(fixture,changed)).mockResolvedValueOnce(adaptLegacyFixture(fixture))};
    const key=`retry-${++seq}`;const {result}=renderHook(()=>useDecisionSession('shenyang',provider,key));
    await act(async()=>result.current.run(request));expect(result.current.state.status).toBe('error');expect(result.current.state.result).toBeNull();
    await act(async()=>result.current.run(request));expect(result.current.state.status).toBe('ready');
  });
  it('restores validated requests after a fresh session, never cached results',async()=>{
    const key=`restore-${++seq}`;sessionStorage.setItem(`agriscope:decision:v0:shenyang:${key}`,JSON.stringify(request));
    const provider:DecisionProvider={decide:vi.fn().mockResolvedValue(adaptLegacyFixture(fixture))};
    const {result}=renderHook(()=>useDecisionSession('shenyang',provider,key,true));
    await waitFor(()=>expect(result.current.state.status).toBe('ready'));
    expect(provider.decide).toHaveBeenCalledTimes(1);act(()=>cancelDecision(`shenyang:${key}`));
    sessionStorage.setItem('agriscope:decision:v0:invalid','{"contract_version":"0"}');expect(readSavedDecision('invalid')).toBeNull();
  });
});
