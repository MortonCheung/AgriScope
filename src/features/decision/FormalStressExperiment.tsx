import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DecisionCandidate, DecisionProvider, DecisionRequest, StressScenario } from '../../domain/decision/types';
import { AnimatedUnderline } from '../../components/AnimatedUnderline';
import { formatNumber, money, RangePlot } from './DecisionVisuals';

const definitions=[
  {id:'normal',label:'正常',changes:{price_pct:0,yield_pct:0,cost_pct:0,delay_days:0}},
  {id:'price_-20%',label:'市场转弱',changes:{price_pct:-20,yield_pct:0,cost_pct:0,delay_days:0}},
  {id:'yield_-20%',label:'生产受损',changes:{price_pct:0,yield_pct:-20,cost_pct:0,delay_days:0}},
  {id:'combined',label:'综合压力',changes:{price_pct:-20,yield_pct:-15,cost_pct:20,delay_days:0}},
];
function valid(c:StressScenario['changes']){return Object.values(c).every(Number.isFinite)&&c.price_pct>=-100&&c.price_pct<=0&&c.yield_pct>=-100&&c.yield_pct<=0&&c.cost_pct>=0&&c.cost_pct<=100&&Number.isInteger(c.delay_days)&&c.delay_days>=0&&c.delay_days<=60;}
export function FormalStressExperiment({candidate,request,provider}:{candidate:DecisionCandidate;request:DecisionRequest;provider:DecisionProvider}){
  const [params,setParams]=useSearchParams();const selected=params.get('stress')??'normal';
  const custom={price_pct:Number(params.get('price')),yield_pct:Number(params.get('yield')),cost_pct:Number(params.get('cost')),delay_days:Number(params.get('delay'))};
  const customValid=selected==='custom'&&['price','yield','cost','delay'].every(k=>params.has(k)&&params.get(k)?.trim())&&valid(custom);
  const definition=customValid?{id:'custom',label:'自定义压力',changes:custom}:definitions.find(d=>d.id===selected)??definitions[0];
  const invalidLink=selected==='custom'&&!customValid||selected!=='custom'&&!definitions.some(d=>d.id===selected);
  const [draft,setDraft]=useState({price:params.get('price')??'-10',yield:params.get('yield')??'0',cost:params.get('cost')??'0',delay:params.get('delay')??'0'});
  const [inputError,setInputError]=useState('');const [retry,setRetry]=useState(0);
  const key=JSON.stringify(definition.changes);
  const [answer,setAnswer]=useState<{key:string;scenario:StressScenario}|null>(null);const [error,setError]=useState('');
  const [known,setKnown]=useState<StressScenario[]>([]);
  useEffect(()=>{
    setAnswer(null);setError('');if(definition.id==='normal')return;
    const controller=new AbortController();
    if(!provider.stress){setError('正式模型压力接口尚未接入。');return;}
    provider.stress(request,candidate,definition.changes,{signal:controller.signal}).then(s=>{
      if(controller.signal.aborted)return;
      setAnswer({key,scenario:{...s,id:definition.id,label:definition.label}});
      setKnown(previous=>[...previous.filter(v=>JSON.stringify(v.changes)!==key),s]);
    }).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'压力结果暂时不可用。');});
    return()=>controller.abort();
    // key captures the full immutable parameter set; abort owns late responses.
  },[candidate,request,provider,key,retry,definition.id,definition.label]);
  const neutral:StressScenario={...definitions[0],profit:candidate.profit,roi:candidate.roi.base,delta_cny:candidate.profit.base===null?null:0,is_mock:false,note:'原方案基准。'};
  const loading=definition.id!=='normal'&&!error&&answer?.key!==key;
  const scenario=definition.id==='normal'?neutral:answer?.key===key?answer.scenario:{...definition,profit:{...candidate.profit,low:null,base:null,high:null},roi:null,delta_cny:null,is_mock:false,note:''};
  const changes=scenario.changes;
  const apply=(c:StressScenario['changes'])=>{setParams(p=>{p.set('stress','custom');for(const [k,v] of [['price',c.price_pct],['yield',c.yield_pct],['cost',c.cost_pct],['delay',c.delay_days]] as const)p.set(k,String(v));return p;});setDraft({price:String(c.price_pct),yield:String(c.yield_pct),cost:String(c.cost_pct),delay:String(c.delay_days)});setInputError('');};
  function submit(e:FormEvent){e.preventDefault();const c={price_pct:Number(draft.price),yield_pct:Number(draft.yield),cost_pct:Number(draft.cost),delay_days:Number(draft.delay)};if(Object.values(draft).some(v=>!v.trim())||!valid(c)){setInputError('请填完整四项变化：价格与亩产 -100% 到 0%，成本 0% 到 100%，延迟 0 到 60 个整天。');return;}apply(c);}
  return <section className="decision-stress__experiment" aria-label="压力情景实验">
    <div className="decision-modes" aria-label="现实场景">{definitions.map(d=><button key={d.id} aria-pressed={definition.id===d.id} onClick={()=>{setParams(p=>{p.set('stress',d.id);['price','yield','cost','delay'].forEach(k=>p.delete(k));return p;});setInputError('');}}>{d.label}{definition.id===d.id&&<AnimatedUnderline layoutId="stress-mode"/>}</button>)}</div>
    {invalidLink&&<p className="decision-note" role="status">链接中的压力条件无效，当前显示原方案。</p>}
    <div className="decision-stress__reading"><div>
      <div className="decision-stress__change" aria-live="polite" aria-busy={loading}><p className="ag-label">{scenario.label} · 正式模型</p><p className="decision-note">价格 {formatNumber(changes.price_pct,'%')} · 亩产 {formatNumber(changes.yield_pct,'%')} · 成本 {formatNumber(changes.cost_pct,'%')} · 上市延迟 {changes.delay_days} 天</p><h2 className="decision-result__range">{loading?'计算压力情景':`基准净收益 ${money(scenario.profit.base)}`}</h2><p className="decision-note">相对原方案 {scenario.delta_cny===null?'待评估':`${scenario.delta_cny>0?'+':''}${money(scenario.delta_cny)}`}</p></div>
      {error&&<p className="decision-note" role="alert">{error} <button className="decision-text-button" onClick={()=>setRetry(retry+1)}>重试</button></p>}
      <RangePlot title="原方案与压力情景净收益" domainRanges={[candidate.profit,...known.map(s=>s.profit),scenario.profit]} rows={[{label:'原方案',range:candidate.profit,baseline:true},{label:'压力情景',range:scenario.profit}]}/>
      {scenario.note&&<p className="decision-note">{scenario.note}</p>}
    </div><aside className="decision-stress__reading-aside"><p className="ag-label">模型返回口径</p><dl className="decision-detail__facts"><div><dt>下行情景</dt><dd>{money(scenario.profit.low)}</dd></div><div><dt>上行情景</dt><dd>{money(scenario.profit.high)}</dd></div><div><dt>基准投入回报率</dt><dd>{formatNumber(scenario.roi===null?null:scenario.roi*100,'%')}</dd></div></dl><p className="decision-note">— 表示模型没有提供这项估算。</p></aside></div>
    <details className="decision-disclosure"><summary>细调压力条件</summary><div className="decision-actions"><button className="ag-button" onClick={()=>apply({price_pct:-10,yield_pct:0,cost_pct:0,delay_days:0})}>价格 -10%</button><button className="ag-button" onClick={()=>apply({price_pct:0,yield_pct:0,cost_pct:20,delay_days:0})}>成本 +20%</button><button className="ag-button" onClick={()=>apply({price_pct:0,yield_pct:0,cost_pct:0,delay_days:7})}>上市延迟 7 天</button></div>
      <form className="decision-stress__form" onSubmit={submit} noValidate>{[['price','价格变化','%'],['yield','亩产变化','%'],['cost','成本变化','%'],['delay','上市延迟','天']].map(([key,label,unit])=><label key={key}>{label}（{unit}）<input name={`stress-${key}`} type="number" step={key==='delay'?'1':'any'} value={draft[key as keyof typeof draft]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}{inputError&&<p className="decision-errors" role="alert">{inputError}</p>}<button className="ag-button ag-button--primary" type="submit">对照这组条件</button></form>
    </details>
  </section>;
}
