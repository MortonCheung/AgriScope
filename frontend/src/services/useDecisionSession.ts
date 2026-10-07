import { useEffect } from 'react';
import { create } from 'zustand';
import type { DecisionProvider, DecisionRequest, DecisionResult } from '../domain/decision/types';
import { parseDecisionResult, sameDecisionContext, validateRequest } from '../domain/decision/validation';

export interface DecisionSession {
  status:'idle'|'loading'|'ready'|'error';
  request:DecisionRequest|null;
  result:DecisionResult|null;
  error:string|null;
}
const EMPTY:DecisionSession={status:'idle',request:null,result:null,error:null};
const sessions=create<{items:Record<string,DecisionSession>;set:(key:string,session:DecisionSession)=>void}>((set)=>({
  items:{},set:(key,session)=>set((s)=>({items:{...s.items,[key]:session}})),
}));
const controllers=new Map<string,AbortController>();
const storageKey=(key:string)=>`agriscope:decision:v0:${key}`;
export function readSavedDecision(key:string):DecisionRequest|null{
  try{const text=sessionStorage.getItem(storageKey(key));if(!text)return null;const request=JSON.parse(text);return validateRequest(request).length?null:request;}
  catch{return null;}
}
export async function runDecision(key:string,request:DecisionRequest,provider:DecisionProvider):Promise<void>{
  controllers.get(key)?.abort();
  const controller=new AbortController();controllers.set(key,controller);
  sessions.getState().set(key,{status:'loading',request,result:null,error:null});
  try{sessionStorage.setItem(storageKey(key),JSON.stringify(request));}catch{/* Storage can be unavailable. */}
  try{
    const result=parseDecisionResult(await provider.decide(request,{signal:controller.signal}));
    if(controllers.get(key)!==controller || controller.signal.aborted)return;
    if(!sameDecisionContext(request,result.request))throw new Error('返回方案与当前种植条件不一致，请重试。');
    sessions.getState().set(key,{status:'ready',request,result,error:null});
  }catch(error){
    if(controllers.get(key)!==controller || controller.signal.aborted)return;
    sessions.getState().set(key,{status:'error',request,result:null,error:error instanceof Error?error.message:'决策结果暂时无法加载。'});
  }finally{if(controllers.get(key)===controller)controllers.delete(key);}
}
export function cancelDecision(key:string){
  controllers.get(key)?.abort();controllers.delete(key);
  const previous=sessions.getState().items[key]??EMPTY;
  sessions.getState().set(key,{...previous,status:'idle',result:null,error:null});
}
export function useDecisionSession(cityId:string,provider:DecisionProvider,testState:string|null=null,restore=false){
  const key=`${cityId}:${testState??'default'}${provider.data_mode==='api'?':api:v1':''}`;
  const state=sessions((s)=>s.items[key]??EMPTY);
  useEffect(()=>{
    if(!restore || state.status!=='idle' || state.request)return;
    const saved=readSavedDecision(key);
    if(saved && saved.user_context.city_id===cityId)void runDecision(key,saved,provider);
  },[cityId,key,provider,restore,state.request,state.status]);
  return {state,key,savedRequest:state.request??readSavedDecision(key),run:(request:DecisionRequest)=>runDecision(key,request,provider),cancel:()=>cancelDecision(key)};
}
