import { useEffect } from 'react';
import { create } from 'zustand';
import type { DecisionProvider, DecisionRequest, DecisionResult } from '../domain/decision/types';
import { parseDecisionResult, sameDecisionContext, validateRequest } from '../domain/decision/validation';

export interface DecisionSession {
  status:'idle'|'loading'|'ready'|'error';
  request:DecisionRequest|null;
  result:DecisionResult|null;
  error:string|null;
  requestKey?: string;
}
const EMPTY:DecisionSession={status:'idle',request:null,result:null,error:null};
const sessions=create<{items:Record<string,DecisionSession>;set:(key:string,session:DecisionSession)=>void}>((set)=>({
  items:{},set:(key,session)=>set((s)=>({items:{...s.items,[key]:session}})),
}));
const controllers=new Map<string,AbortController>();
const snapshots=new Map<string,DecisionResult>();
export const decisionRequestKey=(scope:string,request:DecisionRequest)=>`${scope}:${JSON.stringify(request)}`;
const storageKey=(key:string)=>`agriscope:decision:v0:${key}`;
export function readSavedDecision(key:string):DecisionRequest|null{
  try{const text=sessionStorage.getItem(storageKey(key));if(!text)return null;const request=JSON.parse(text);return validateRequest(request).length?null:request;}
  catch{return null;}
}
export async function runDecision(key:string,request:DecisionRequest,provider:DecisionProvider,version=''):Promise<void>{
  controllers.get(key)?.abort();
  const controller=new AbortController();controllers.set(key,controller);
  const requestKey=decisionRequestKey(`${key}:${version}`,request);
  const cached=snapshots.get(requestKey);
  sessions.getState().set(key,{status:cached?'ready':'loading',request,result:cached??null,error:null,requestKey});
  try{sessionStorage.setItem(storageKey(key),JSON.stringify(request));}catch{/* Storage can be unavailable. */}
  if(cached){controllers.delete(key);return;}
  try{
    const result=parseDecisionResult(await provider.decide(request,{signal:controller.signal}));
    if(controllers.get(key)!==controller || controller.signal.aborted)return;
    if(!sameDecisionContext(request,result.request))throw new Error('返回方案与当前种植条件不一致，请重试。');
    snapshots.set(requestKey,result);
    if(snapshots.size>64)snapshots.delete(snapshots.keys().next().value!);
    sessions.getState().set(key,{status:'ready',request,result,error:null,requestKey});
  }catch(error){
    if(controllers.get(key)!==controller || controller.signal.aborted)return;
    sessions.getState().set(key,{status:'error',request,result:null,error:error instanceof Error?error.message:'决策结果暂时无法加载。',requestKey});
  }finally{if(controllers.get(key)===controller)controllers.delete(key);}
}
export function cancelDecision(key:string){
  controllers.get(key)?.abort();controllers.delete(key);
  const previous=sessions.getState().items[key]??EMPTY;
  sessions.getState().set(key,{...previous,status:'idle',result:null,error:null});
}
export interface DecisionSelection { crop?: string; horizon?: number; asOf?: string }
function alignSelection(request:DecisionRequest,selection:DecisionSelection):DecisionRequest{
  if(request.contract_version!=='1')return request;
  const context=request.user_context;
  return {...request,user_context:{...context,
    crop_preferences:selection.crop&&context.crop_preferences.length&&!context.crop_preferences.includes(selection.crop)?[selection.crop]:context.crop_preferences,
    market_context:{...context.market_context,...(selection.horizon===undefined?{}:{horizon_days:selection.horizon}),...(selection.asOf?{as_of:selection.asOf}:{})},
  }};
}
export function useDecisionSession(cityId:string,provider:DecisionProvider,testState:string|null=null,restore=false,selection:DecisionSelection={},version=''){
  const key=`${cityId}:${testState??'default'}${provider.data_mode==='api'?':api:v1':''}`;
  const stored=sessions((s)=>s.items[key]??EMPTY);
  const saved=stored.request??readSavedDecision(key);
  const desired=saved?alignSelection(saved,selection):null;
  const matches=!desired||!stored.request||sameDecisionContext(desired,stored.request);
  const state=matches?stored:{status:'loading' as const,request:desired,result:null,error:null};
  const desiredKey=desired?decisionRequestKey(`${key}:${version}`,desired):'';
  useEffect(()=>{
    if(!restore||!desired||desired.user_context.city_id!==cityId||validateRequest(desired).length)return;
    if(!matches||stored.status==='idle'||(stored.requestKey&&stored.requestKey!==desiredKey))void runDecision(key,desired,provider,version);
  },[cityId,key,provider,restore,desiredKey,matches,stored.status,stored.request,stored.requestKey,version]);
  useEffect(()=>()=>cancelDecision(key),[key,provider]);
  return {state,key,savedRequest:desired,run:(request:DecisionRequest)=>runDecision(key,request,provider,version),cancel:()=>cancelDecision(key)};
}
