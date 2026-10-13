import { SelectControl } from '../../components/controls/SelectControl';
import { useEffect, useState, type FormEvent } from 'react';
import type { DecisionCapability, DecisionProvider, FinalDecisionRequest, RiskPreference } from '../../domain/decision/types';
import { validateRequest } from '../../domain/decision/validation';
import { WorkbenchMain, WorkbenchRail } from '../../components/workbench/WorkbenchLayout';
import { getCity } from '../../domain/geography/cities';
import { ChoiceButtons } from '../../components/controls/ChoiceButtons';
import { DiscreteHorizonSlider } from '../../components/controls/DiscreteHorizonSlider';
import type { DecisionSelection } from '../../services/useDecisionSession';

export function FinalDecisionInput({cityId,initial,onSubmit,provider,expandInputs=false,selection={},onSelection}:{cityId:string;initial:FinalDecisionRequest|null;onSubmit:(request:FinalDecisionRequest)=>void;provider:DecisionProvider;expandInputs?:boolean;selection?:DecisionSelection;onSelection?:(selection:DecisionSelection)=>void}){
  const [cap,setCap]=useState<DecisionCapability|null>(null);const [capError,setCapError]=useState('');const [retry,setRetry]=useState(0);
  const [area,setArea]=useState(initial?.user_context.area_mu.toString()??'');const [budget,setBudget]=useState(initial?(initial.user_context.budget_cny/10000).toString():'');
  const [preference,setPreference]=useState<RiskPreference>(initial?.user_context.risk_preference??'balanced');
  const [asOf,setAsOf]=useState(selection.asOf??initial?.user_context.market_context.as_of??'');const [horizon,setHorizon]=useState<number|null>(selection.horizon??initial?.user_context.market_context.horizon_days??null);
  const [harvest,setHarvest]=useState(initial?.user_context.market_context.harvest_date??'');const [crops,setCrops]=useState(initial?.user_context.crop_preferences??[]);
  const [actualCrop,setActualCrop]=useState(selection.crop??Object.keys(initial?.user_context.actual_inputs??{})[0]??'');
  const [actual,setActual]=useState<Record<string,{cost:string;yield:string}>>(()=>Object.fromEntries(Object.entries(initial?.user_context.actual_inputs??{}).map(([crop,v])=>[crop,{cost:v.cost_per_mu?.toString()??'',yield:v.yield_kg_per_mu?.toString()??''}])));
  const [errors,setErrors]=useState<string[]>([]);
  useEffect(()=>{
    const controller=new AbortController();setCap(null);setCapError('');
    if(!provider.capabilities){setCapError('城市决策能力暂时无法确认。');return;}
    provider.capabilities(cityId,{signal:controller.signal}).then(value=>{if(controller.signal.aborted)return;setCap(value);setAsOf(previous=>previous||value.market_as_of||'');setActualCrop(previous=>value.crops.some(c=>c.id===previous)?previous:value.crops[0]?.id||'');}).catch(error=>{if(!controller.signal.aborted)setCapError(error instanceof Error?error.message:'城市决策能力暂时无法确认。');});
    return()=>controller.abort();
  },[cityId,provider,retry]);
  useEffect(()=>{ if(selection.horizon!==undefined)setHorizon(selection.horizon);if(selection.crop)setActualCrop(selection.crop);if(selection.asOf)setAsOf(selection.asOf); },[selection.horizon,selection.crop,selection.asOf]);
  const selected=cap?.crops.filter(c=>!crops.length||crops.includes(c.id))??[];
  const horizons=selected[0]?.horizons.filter(h=>[7,14,30].includes(h.days)&&selected.every(c=>c.horizons.some(v=>v.days===h.days)))??[];
  const mode=horizons.some(h=>h.days===horizon)?selected.some(c=>c.horizons.some(h=>h.days===horizon&&h.mode==='scenario_only'))?'scenario_only':'model':undefined;
  const current=actual[actualCrop]??{cost:'',yield:''};
  function submit(event:FormEvent){
    event.preventDefault();
    const request:FinalDecisionRequest={contract_version:'1',user_context:{city_id:cityId,area_mu:Number(area),budget_cny:Number(budget)*10000,risk_preference:preference,crop_preferences:crops,
      actual_inputs:Object.fromEntries(Object.entries(actual).filter(([,v])=>v.cost.trim()||v.yield.trim()).map(([crop,v])=>[crop,{cost_per_mu:v.cost.trim()?Number(v.cost):null,yield_kg_per_mu:v.yield.trim()?Number(v.yield):null}])),market_context:{as_of:asOf,horizon_days:horizon??0,harvest_date:harvest||null}},input_source:{kind:'structured'}};
    const issues=validateRequest(request);
    if(!cap?.supported||!mode)issues.push('当前城市、作物或评估跨度暂不支持。');
    if(cap?.market_as_of&&asOf>cap.market_as_of)issues.push('评估基准日不能晚于已接入市场数据。');
    if(crops.some(c=>!cap?.crops.some(s=>s.id===c)))issues.push('请使用当前支持的作物名称。');
    if(Object.keys(request.user_context.actual_inputs).some(c=>!cap?.crops.some(s=>s.id===c)))issues.push('实际投入需要对应支持的作物。');
    setErrors(issues);if(!issues.length)onSubmit(request);
  }
  return <><WorkbenchMain label="短期市场比较条件"><section className="decision-input" aria-labelledby="decision-input-title">
    <h1 id="decision-input-title" className="workbench__title">短期市场比较</h1>
    <p className="decision-note">比较市场情景，再核对你的实际投入。评估跨度不是作物生长周期。</p>
    {capError?<div className="ag-state" role="alert"><p>{capError}</p><button className="ag-button" onClick={()=>setRetry(retry+1)}>重新确认城市能力</button></div>:!cap?<div className="ag-state" role="status" aria-busy="true">确认这个城市的决策范围<i className="ag-skeleton"/></div>:!cap.supported?<div className="ag-state"><h2 className="ag-title">这个城市暂不支持种植决策</h2><p className="decision-note">{cap.limitation??'可继续查看已有研究与市场背景。'}</p></div>:<form className="decision-input__form" onSubmit={submit} noValidate>
      <div className="decision-input__fields"><label>种植面积 <span className="decision-input__unit">亩</span><input name="area" type="number" inputMode="decimal" min="0" step="any" value={area} onChange={e=>setArea(e.target.value)}/></label><label>可用预算 <span className="decision-input__unit">万元</span><input name="budget" type="number" inputMode="decimal" min="0" step="any" value={budget} onChange={e=>setBudget(e.target.value)}/></label>
        <DiscreteHorizonSlider label="市场评估跨度" nodes={horizons.map(h=>h.days).sort((a,b)=>a-b)} value={horizons.some(h=>h.days===horizon)?horizon:null} onChange={days=>{setHorizon(days);onSelection?.({horizon:days});}}/>
        <SelectControl label="这次更看重" value={preference} onChange={value=>setPreference(value as RiskPreference)} options={[{value:'conservative',label:'稳健一些'},{value:'balanced',label:'兼顾收益与风险'},{value:'aggressive',label:'收益优先'}]}/></div>
      {mode==='scenario_only'&&<p className="decision-note">这个跨度仅作情景比较。</p>}
        <ChoiceButtons label="比较哪些作物（不限制时比较全部）" value={crops} options={cap.crops.map(c=>({value:c.id,label:c.label}))} onChange={crop=>{setCrops(crops.includes(crop)?crops.filter(v=>v!==crop):[...crops,crop]);setActualCrop(crop);onSelection?.({crop});}}/>
      <details className="decision-disclosure" open={expandInputs}><summary>实际投入</summary><div className="decision-input__fields decision-input__fields--advanced"><ChoiceButtons label="实际投入对应作物" value={actualCrop} onChange={crop=>{setActualCrop(crop);onSelection?.({crop});}} options={cap.crops.map(c=>({value:c.id,label:c.label}))}/>
          <label>实际亩均成本 <span className="decision-input__unit">元/亩</span><input name="actual-cost" type="number" inputMode="decimal" step="any" value={current.cost} onChange={e=>setActual({...actual,[actualCrop]:{...current,cost:e.target.value}})}/></label><label>实际亩产 <span className="decision-input__unit">kg/亩</span><input name="actual-yield" type="number" inputMode="decimal" step="any" value={current.yield} onChange={e=>setActual({...actual,[actualCrop]:{...current,yield:e.target.value}})}/></label></div>
      </details>
      <details className="decision-disclosure"><summary>评估日期</summary><div className="decision-input__fields"><label>数据基准日<input name="as-of" type="date" max={cap.market_as_of??undefined} value={asOf} onChange={e=>{setAsOf(e.target.value);onSelection?.({asOf:e.target.value});}}/></label><label>计划上市日（可选）<input name="harvest-date" type="date" value={harvest} onChange={e=>setHarvest(e.target.value)}/></label></div><p className="decision-note">上市日只选择历史同期气候口径，不改变价格评估跨度。</p></details>
      {errors.length>0&&<ul className="decision-errors" role="alert">{errors.map(e=><li key={e}>{e}</li>)}</ul>}
      <button type="submit" className="ag-button ag-button--primary">比较种植选择 →</button>
    </form>}
  </section></WorkbenchMain><WorkbenchRail>
    <p className="ag-label">{getCity(cityId)?.shortName} · 当前比较条件</p>
    <dl className="decision-detail__facts">
      <div><dt>作物范围</dt><dd>{crops.length ? crops.join('、') : '全部支持作物'}</dd></div>
      <div><dt>市场评估跨度</dt><dd>{mode ? `${horizon} 天` : '按计划选择'}</dd></div>
      <div><dt>数据基准日</dt><dd>{asOf || '确认中'}</dd></div>
      <div><dt>面积</dt><dd>{area ? `${area} 亩` : '未填写'}</dd></div>
      <div><dt>预算</dt><dd>{budget ? `${budget} 万元` : '未填写'}</dd></div>
    </dl>
    <details className="decision-disclosure"><summary>方法与数据</summary><p className="decision-note">模型情景按本城作物、数据基准日与所选期限计算；评估跨度不是生长周期。实际成本与亩产齐备时才核算实际投入收益。</p><p className="decision-note">模型 {cap?.model_version ?? '确认中'} · 数据 {cap?.data_version ?? '确认中'}</p></details>
  </WorkbenchRail></>;
}
