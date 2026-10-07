import { useEffect, useState, type FormEvent } from 'react';
import { getCity } from '../../domain/geography/cities';
import type { DecisionProvider, DecisionRequest, RiskPreference } from '../../domain/decision/types';
import { validateRequest } from '../../domain/decision/validation';
type DecisionSample={id:string;label:string;request:DecisionRequest};

const preferenceLabels:Record<RiskPreference,string>={conservative:'稳健一些',balanced:'兼顾收益与风险',aggressive:'收益优先'};
function blankRequest(cityId:string):DecisionRequest{
  return {contract_version:'0',user_context:{city_id:cityId,area_mu:0,budget_cny:0,risk_preference:'balanced',planting_window:{start:'',end:''},harvest_window:{start:'',end:''},crop_preferences:[],actual_inputs:{}},input_source:{kind:'structured'}};
}
export function DecisionInput({cityId,initial,onSubmit,provider,expandInputs=false}:{cityId:string;initial:DecisionRequest|null;onSubmit:(request:DecisionRequest)=>void;provider:DecisionProvider;expandInputs?:boolean}){
  const [request,setRequest]=useState<DecisionRequest>(()=>structuredClone(initial??blankRequest(cityId)));
  const [samples,setSamples]=useState<DecisionSample[]>([]);
  const [sampleError,setSampleError]=useState(false);
  const [errors,setErrors]=useState<string[]>([]);
  const [actualCrop,setActualCrop]=useState(()=>Object.keys(initial?.user_context.actual_inputs??{})[0]??'');
  const [cost,setCost]=useState(()=>initial?.user_context.actual_inputs[actualCrop]?.cost_per_mu?.toString()??'');
  const [yieldValue,setYield]=useState(()=>initial?.user_context.actual_inputs[actualCrop]?.yield_kg_per_mu?.toString()??'');
  const [crops,setCrops]=useState(()=>initial?.user_context.crop_preferences.join('、')??'');
  const [harvestStart,setHarvestStart]=useState(()=>initial && initial.user_context.harvest_window.start!==initial.user_context.planting_window.start?initial.user_context.harvest_window.start:'');
  const c=request.user_context;
  useEffect(()=>{
    const controller=new AbortController();
    provider.listSamples?.({signal:controller.signal}).then(setSamples).catch(()=>{if(!controller.signal.aborted)setSampleError(true);});
    return()=>controller.abort();
  },[provider]);
  const update=(patch:Partial<DecisionRequest['user_context']>)=>setRequest({...request,user_context:{...c,...patch}});
  function build(){
    return {...request,input_source:{kind:'structured' as const},user_context:{...c,
      planting_window:{start:c.planting_window.start,end:c.harvest_window.end},
      harvest_window:{start:harvestStart||c.planting_window.start,end:c.harvest_window.end},
      crop_preferences:crops.split(/[、,，\s]+/).map(s=>s.trim()).filter(Boolean),
      actual_inputs:actualCrop.trim()?{[actualCrop.trim()]:{cost_per_mu:cost.trim()?Number(cost):null,yield_kg_per_mu:yieldValue.trim()?Number(yieldValue):null}}:{},
    }};
  }
  function submit(event:FormEvent){
    event.preventDefault();const prepared=build();const issues=validateRequest(prepared);
    if((cost.trim()||yieldValue.trim())&&!actualCrop.trim())issues.push('实际成本或亩产需要指定对应作物。');
    setErrors(issues);if(!issues.length)onSubmit(prepared);
  }
  function useSample(sample:DecisionSample){
    const prepared=structuredClone(sample.request);prepared.user_context.city_id=cityId;
    setRequest(prepared);setCrops('');setActualCrop('');setCost('');setYield('');setHarvestStart('');setErrors([]);
    onSubmit(prepared);
  }
  return <section className="decision-input" aria-labelledby="decision-input-title">
    <div className="decision-input__intro">
      <p className="ag-label">{getCity(cityId)?.shortName} · 种植选择</p>
      <h1 id="decision-input-title" className="ag-hero">这季，怎么种。</h1>
      <p className="ag-lead">从你的土地、预算和上市时间开始。</p>
      <p className="decision-note">{provider.data_mode==='api'?'按实际条件提交，返回方案供你比较。':'历史样例与演示情景 · 最终模型待接入'}</p>
    </div>
    <form className="decision-input__form" onSubmit={submit} noValidate>
      <div className="decision-input__fields">
        <label>种植面积 <span className="decision-input__unit">亩</span><input name="area" type="number" inputMode="decimal" min="0" step="any" value={c.area_mu||''} onChange={e=>update({area_mu:e.target.value===''?0:Number(e.target.value)})} aria-describedby={errors.length?'decision-input-errors':undefined}/></label>
        <label>可用预算 <span className="decision-input__unit">万元</span><input name="budget" type="number" inputMode="decimal" min="0" step="any" value={c.budget_cny?c.budget_cny/10000:''} onChange={e=>update({budget_cny:e.target.value===''?0:Number(e.target.value)*10000})}/></label>
        <label>最早种植<input name="planting" type="date" value={c.planting_window.start} onChange={e=>update({planting_window:{...c.planting_window,start:e.target.value}})}/></label>
        <label>最晚上市<input name="harvest" type="date" value={c.harvest_window.end} onChange={e=>update({harvest_window:{...c.harvest_window,end:e.target.value}})}/></label>
      </div>
      <label className="decision-input__preference">这次更看重<select value={c.risk_preference} onChange={e=>update({risk_preference:e.target.value as RiskPreference})}>{Object.entries(preferenceLabels).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
      <details className="decision-disclosure" open={expandInputs}>
        <summary>补充条件</summary>
        <div className="decision-input__fields decision-input__fields--advanced">
          <label>偏好作物<input name="crops" value={crops} placeholder="西红柿、黄瓜" onChange={e=>setCrops(e.target.value)}/></label>
          <label>上市不早于<input type="date" value={harvestStart} onChange={e=>setHarvestStart(e.target.value)}/></label>
          <label>实际投入对应作物<input value={actualCrop} placeholder="填写作物名称" onChange={e=>setActualCrop(e.target.value)}/></label>
          <label>实际亩均成本 <span className="decision-input__unit">元/亩</span><input type="number" inputMode="decimal" step="any" value={cost} onChange={e=>setCost(e.target.value)}/></label>
          <label>实际亩产 <span className="decision-input__unit">kg/亩</span><input type="number" inputMode="decimal" step="any" value={yieldValue} onChange={e=>setYield(e.target.value)}/></label>
        </div>
      </details>
      {errors.length>0&&<ul id="decision-input-errors" className="decision-errors" role="alert">{errors.map(e=><li key={e}>{e}</li>)}</ul>}
      <button type="submit" className="ag-button ag-button--primary">比较种植选择 →</button>
    </form>
    {provider.listSamples&&<details className="decision-disclosure decision-input__samples">
      <summary>用历史样例试一下</summary>
      <div className="decision-input__sample-options">{samples.map(s=><button key={s.id} type="button" className="ag-button" onClick={()=>useSample(s)}>{s.label}</button>)}</div>
      {sampleError&&<p className="decision-note">历史样例暂时无法加载，可填写自己的条件。</p>}
    </details>}
  </section>;
}
