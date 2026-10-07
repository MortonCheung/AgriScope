import { useEffect, useState, type FormEvent } from 'react';
import type { DecisionCapability, DecisionProvider, FinalDecisionRequest, RiskPreference } from '../../domain/decision/types';
import { validateRequest } from '../../domain/decision/validation';
import { getCity } from '../../domain/geography/cities';

export function FinalDecisionInput({cityId,initial,onSubmit,provider,expandInputs=false}:{cityId:string;initial:FinalDecisionRequest|null;onSubmit:(request:FinalDecisionRequest)=>void;provider:DecisionProvider;expandInputs?:boolean}){
  const [cap,setCap]=useState<DecisionCapability|null>(null);const [capError,setCapError]=useState('');const [retry,setRetry]=useState(0);
  const [area,setArea]=useState(initial?.user_context.area_mu.toString()??'');const [budget,setBudget]=useState(initial?(initial.user_context.budget_cny/10000).toString():'');
  const [preference,setPreference]=useState<RiskPreference>(initial?.user_context.risk_preference??'balanced');
  const [asOf,setAsOf]=useState(initial?.user_context.market_context.as_of??'');const [horizon,setHorizon]=useState(initial?.user_context.market_context.horizon_days??30);
  const [harvest,setHarvest]=useState(initial?.user_context.market_context.harvest_date??'');const [crops,setCrops]=useState(initial?.user_context.crop_preferences??[]);
  const [actualCrop,setActualCrop]=useState(Object.keys(initial?.user_context.actual_inputs??{})[0]??'');
  const [actual,setActual]=useState<Record<string,{cost:string;yield:string}>>(()=>Object.fromEntries(Object.entries(initial?.user_context.actual_inputs??{}).map(([crop,v])=>[crop,{cost:v.cost_per_mu?.toString()??'',yield:v.yield_kg_per_mu?.toString()??''}])));
  const [errors,setErrors]=useState<string[]>([]);
  useEffect(()=>{
    const controller=new AbortController();setCap(null);setCapError('');
    if(!provider.capabilities){setCapError('城市决策能力暂时无法确认。');return;}
    provider.capabilities(cityId,{signal:controller.signal}).then(value=>{if(controller.signal.aborted)return;setCap(value);setAsOf(previous=>previous||value.market_as_of||'');setActualCrop(previous=>previous||value.crops[0]?.id||'');}).catch(error=>{if(!controller.signal.aborted)setCapError(error instanceof Error?error.message:'城市决策能力暂时无法确认。');});
    return()=>controller.abort();
  },[cityId,provider,retry]);
  const selected=cap?.crops.filter(c=>!crops.length||crops.includes(c.id))??[];
  const horizons=selected[0]?.horizons.filter(h=>selected.every(c=>c.horizons.some(v=>v.days===h.days)))??[];
  const mode=horizons.some(h=>h.days===horizon)?selected.some(c=>c.horizons.some(h=>h.days===horizon&&h.mode==='scenario_only'))?'scenario_only':'model':undefined;
  const current=actual[actualCrop]??{cost:'',yield:''};
  function submit(event:FormEvent){
    event.preventDefault();
    const request:FinalDecisionRequest={contract_version:'1',user_context:{city_id:cityId,area_mu:Number(area),budget_cny:Number(budget)*10000,risk_preference:preference,crop_preferences:crops,
      actual_inputs:Object.fromEntries(Object.entries(actual).filter(([,v])=>v.cost.trim()||v.yield.trim()).map(([crop,v])=>[crop,{cost_per_mu:v.cost.trim()?Number(v.cost):null,yield_kg_per_mu:v.yield.trim()?Number(v.yield):null}])),market_context:{as_of:asOf,horizon_days:horizon,harvest_date:harvest||null}},input_source:{kind:'structured'}};
    const issues=validateRequest(request);
    if(!cap?.supported||!mode)issues.push('当前城市、作物或评估跨度暂不支持。');
    if(cap?.market_as_of&&asOf>cap.market_as_of)issues.push('评估基准日不能晚于已接入市场数据。');
    if(crops.some(c=>!cap?.crops.some(s=>s.id===c)))issues.push('请使用当前支持的作物名称。');
    if(Object.keys(request.user_context.actual_inputs).some(c=>!cap?.crops.some(s=>s.id===c)))issues.push('实际投入需要对应支持的作物。');
    setErrors(issues);if(!issues.length)onSubmit(request);
  }
  return <section className="decision-input" aria-labelledby="decision-input-title">
    <div className="decision-input__intro"><p className="ag-label">{getCity(cityId)?.shortName} · 种植选择</p><h1 id="decision-input-title" className="ag-hero">这季，怎么种。</h1><p className="ag-lead">比较市场情景，再核对你的实际投入。</p>{cap?.market_as_of&&<p className="decision-note">模型数据截至 {cap.market_as_of} · 市场评估跨度不是作物生长周期。</p>}</div>
    {capError?<div className="ag-state" role="alert"><p>{capError}</p><button className="ag-button" onClick={()=>setRetry(retry+1)}>重新确认城市能力</button></div>:!cap?<div className="ag-state" role="status" aria-busy="true">确认这个城市的决策范围<i className="ag-skeleton"/></div>:!cap.supported?<div className="ag-state"><h2 className="ag-title">这个城市暂不支持种植决策</h2><p className="decision-note">{cap.limitation??'可继续查看已有研究与市场背景。'}</p></div>:<form className="decision-input__form" onSubmit={submit} noValidate>
      <div className="decision-input__fields"><label>种植面积 <span className="decision-input__unit">亩</span><input name="area" type="number" inputMode="decimal" min="0" step="any" value={area} onChange={e=>setArea(e.target.value)}/></label><label>可用预算 <span className="decision-input__unit">万元</span><input name="budget" type="number" inputMode="decimal" min="0" step="any" value={budget} onChange={e=>setBudget(e.target.value)}/></label>
        <label>市场评估跨度<select name="horizon" value={horizon} onChange={e=>setHorizon(Number(e.target.value))}>{horizons.map(h=><option key={h.days} value={h.days}>{h.days} 天{h.mode==='scenario_only'?' · 仅情景':''}</option>)}</select></label>
        <label>这次更看重<select value={preference} onChange={e=>setPreference(e.target.value as RiskPreference)}><option value="conservative">稳健一些</option><option value="balanced">兼顾收益与风险</option><option value="aggressive">收益优先</option></select></label></div>
      {mode==='scenario_only'&&<p className="decision-note">这个跨度仅作情景比较。</p>}
      <details className="decision-disclosure" open={expandInputs}><summary>作物与实际投入</summary>
        <fieldset className="decision-input__crops"><legend>比较哪些作物（不限制时比较全部）</legend>{cap.crops.map(c=><label key={c.id}><input type="checkbox" checked={crops.includes(c.id)} onChange={e=>setCrops(e.target.checked?[...crops,c.id]:crops.filter(v=>v!==c.id))}/>{c.label}</label>)}</fieldset>
        <div className="decision-input__fields decision-input__fields--advanced"><label>实际投入对应作物<select aria-label="实际投入对应作物" value={actualCrop} onChange={e=>setActualCrop(e.target.value)}>{cap.crops.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
          <label>实际亩均成本 <span className="decision-input__unit">元/亩</span><input name="actual-cost" type="number" inputMode="decimal" step="any" value={current.cost} onChange={e=>setActual({...actual,[actualCrop]:{...current,cost:e.target.value}})}/></label><label>实际亩产 <span className="decision-input__unit">kg/亩</span><input name="actual-yield" type="number" inputMode="decimal" step="any" value={current.yield} onChange={e=>setActual({...actual,[actualCrop]:{...current,yield:e.target.value}})}/></label></div>
      </details>
      <details className="decision-disclosure"><summary>评估日期</summary><div className="decision-input__fields"><label>数据基准日<input name="as-of" type="date" max={cap.market_as_of??undefined} value={asOf} onChange={e=>setAsOf(e.target.value)}/></label><label>计划上市日（可选）<input name="harvest-date" type="date" value={harvest} onChange={e=>setHarvest(e.target.value)}/></label></div><p className="decision-note">上市日只选择历史同期气候口径，不改变价格评估跨度。</p></details>
      {errors.length>0&&<ul className="decision-errors" role="alert">{errors.map(e=><li key={e}>{e}</li>)}</ul>}
      <button type="submit" className="ag-button ag-button--primary">比较种植选择 →</button>
    </form>}
  </section>;
}
