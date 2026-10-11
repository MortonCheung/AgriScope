import { useSearchParams } from 'react-router-dom';
import { ChoiceButtons } from '../../components/controls/ChoiceButtons';
import { DiscreteHorizonSlider } from '../../components/controls/DiscreteHorizonSlider';
import { useAppContext, type ContextHorizon } from '../../app/context/appContext';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { LongHorizonCapability, LongHorizonDecisionRequest, LongHorizonDecisionResult } from '../../domain/longHorizon/types';
import { getLongHorizonDecisionProvider } from '../../providers/longHorizon';
import { DualTargetView, FreshnessNote, STATUS_LABELS } from './LongHorizonPanel';
import { WorkbenchMain, WorkbenchRail } from '../../components/workbench/WorkbenchLayout';
import type { HttpLongHorizonProvider } from '../../providers/longHorizon';

const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const cny = (v: number | null) => v === null ? '待补实际投入' : `${number.format(v)} 元`;

/** Same structured entry as the short decision, with an independent harvest contract. */
export function LongHorizonPlanning({ cityId, provider = getLongHorizonDecisionProvider() }: {
  cityId: string; provider?: Pick<HttpLongHorizonProvider, 'capabilities' | 'decision'>;
}) {
  const [params,setParams]=useSearchParams();
  const [saved]=useState(()=>{try{return JSON.parse(sessionStorage.getItem(`agriscope:long-form:${cityId}`)||'{}');}catch{return {};}});
  const [submitted,setSubmitted]=useState(saved.submitted===true);
  const cache=useRef(new Map<string,LongHorizonDecisionResult>());
  const [cap, setCap] = useState<LongHorizonCapability | null>(null);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState('');
  const [area, setArea] = useState<string>(typeof saved.area==='string'?saved.area:'');
  const [budget, setBudget] = useState<string>(typeof saved.budget==='string'?saved.budget:'');
  const [risk, setRisk] = useState<'conservative' | 'balanced' | 'aggressive'>(['conservative','balanced','aggressive'].includes(saved.risk)?saved.risk:'balanced');
  const horizon=params.get('horizon') ?? '';
  const chooseHorizon=(days:number)=>{setDate('');const app=useAppContext.getState();app.setHorizon(days as ContextHorizon);setParams(previous=>{const next=new URLSearchParams(previous);next.set('horizon',String(days));if(cap?.asOf){next.set('as_of',cap.asOf);app.setAsOf(cap.asOf);}return next;});};
  const [date, setDate] = useState<string>(typeof saved.date==='string'?saved.date:'');
  const [crops, setCrops] = useState<string[]>(Array.isArray(saved.crops)?saved.crops.filter((v:unknown)=>typeof v==='string'):[]);
  const [actualCrop, setActualCrop] = useState(params.get('crop')??'');
  const [inputs, setInputs] = useState<Record<string, { cost: string; yield: string }>>(saved.inputs&&typeof saved.inputs==='object'?Object.fromEntries(Object.entries(saved.inputs).filter(([,v])=>v&&typeof v==='object'&&typeof (v as {cost:unknown}).cost==='string'&&typeof (v as {yield:unknown}).yield==='string')) as Record<string,{cost:string;yield:string}>:{});
  const [pending, setPending] = useState(false);
  const [storedResult, setResult] = useState<LongHorizonDecisionResult | null>(null);
  const [chosen, setChosen] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setCap(null); setError(''); setResult(null); setPending(false);
    if (cityId !== 'shenyang') return;
    provider.capabilities(cityId, { signal: controller.signal }).then(value => {
      if (controller.signal.aborted) return;
      setCap(value); setActualCrop(previous => value.crops.some(c=>c.id===previous)?previous:value.crops[0]?.id || '');
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '上市决策能力暂时不可用。'); });
    return () => { controller.abort(); active.current?.abort(); };
  }, [cityId, provider, retry]);
  const actual = inputs[actualCrop] ?? { cost: '', yield: '' };
  const allowedCrops=cap?.crops.filter(c=>!crops.length||crops.includes(c.id))??[];
  const nodes=(cap?.horizons??[]).filter(h=>[30,60,90,120,150,180].includes(h)&&allowedCrops.every(c=>c.horizons.some(n=>n.days===h))).sort((a,b)=>a-b);
  useEffect(()=>{if(!cap?.supported||!cap.asOf)return;const invalid=params.has('horizon')&&!nodes.includes(Number(params.get('horizon')));if(invalid||params.get('as_of')!==cap.asOf)setParams(previous=>{const next=new URLSearchParams(previous);if(invalid){next.delete('horizon');useAppContext.getState().setHorizon(null);}next.set('as_of',cap.asOf!);useAppContext.getState().setAsOf(cap.asOf!);return next;},{replace:true});},[cap,params,setParams,nodes.join(',')]);
  const chooseCrop=(crop:string)=>{setActualCrop(crop);useAppContext.getState().setCrop(crop);setParams(previous=>{const next=new URLSearchParams(previous);next.set('crop',crop);return next;});};
  useEffect(()=>{const crop=params.get('crop');if(crop&&cap?.crops.some(c=>c.id===crop)){setActualCrop(crop);setChosen(crop);}},[params,cap]);
  useEffect(()=>{try{sessionStorage.setItem(`agriscope:long-form:${cityId}`,JSON.stringify({area,budget,crops,inputs,submitted,date,risk}));}catch{/* Form remains usable without storage. */}},[cityId,area,budget,crops,inputs,submitted,date,risk]);
  function buildRequest(){
    const issues:string[]=[];
    if(!cap?.supported || !cap.asOf)return {issues:['上市决策快照暂时不可用。'],request:null};
    if(![Number(area),Number(budget)].every(v=>Number.isFinite(v)&&v>0))issues.push('请填写大于 0 的种植面积和预算。');
    if(!horizon&&!date)issues.push('请明确选择预计上市跨度或上市日。');
    const asOf=cap.asOf;
    const dateDays=date?Math.round((Date.parse(`${date}T00:00:00Z`)-Date.parse(`${asOf}T00:00:00Z`))/86400000):null;
    const days=horizon?Number(horizon):dateDays;
    if(days===null || !nodes.includes(days))issues.push('上市日期必须对应已登记的跨度，不会自动改成附近日期。');
    if(dateDays!==null&&days!==dateDays)issues.push('预计上市日与所选跨度不一致，请按自己的计划修改。');
    if(crops.some(c=>!cap.crops.some(v=>v.id===c)) || Object.keys(inputs).some(c=>!cap.crops.some(v=>v.id===c)))issues.push('实际投入与比较作物需要属于本城能力范围。');
    const actualInputs: LongHorizonDecisionRequest['user_context']['actual_inputs'] = {};
    for (const [crop, values] of Object.entries(inputs)) {
      if (!values.cost.trim() && !values.yield.trim()) continue;
      const cost = values.cost.trim() ? Number(values.cost) : null;
      const yieldKg = values.yield.trim() ? Number(values.yield) : null;
      if ([cost, yieldKg].some(v => v !== null && (!Number.isFinite(v) || v <= 0))) { issues.push('实际成本和亩产需要大于 0。'); }
      actualInputs[crop] = { cost_per_mu: cost, yield_kg_per_mu: yieldKg };
    }
    const request: LongHorizonDecisionRequest = { contract_version: '2', user_context: {
      city_id: cityId, area_mu: Number(area), budget_cny: Number(budget) * 10000,
      risk_preference: risk, crop_preferences: crops, actual_inputs: actualInputs,
      market_context: { as_of: asOf, expected_harvest_horizon_days: days ?? undefined, expected_harvest_date: date || null },
    }, input_source: { kind: 'structured' } };
    return {issues,request:issues.length?null:request};
  }
  const built=buildRequest();
  const requestKey=built.request?`${cap?.modelVersion}:${cap?.dataVersion}:${JSON.stringify(built.request)}`:'';
  const result=storedResult&&built.request&&JSON.stringify(storedResult.request)===JSON.stringify(built.request)?storedResult:null;
  useEffect(()=>{
    active.current?.abort();
    if(!submitted||!built.request){setPending(false);return;}
    const request=built.request;
    const controller=new AbortController();active.current=controller;
    const cached=cache.current.get(requestKey);
    setError('');setResult(cached??null);setPending(!cached);
    if(!cached)void provider.decision(request,{signal:controller.signal}).then(value=>{
      if(controller.signal.aborted||active.current!==controller)return;
      if(JSON.stringify(value.request)!==JSON.stringify(request))throw new Error('返回条件与当前上市计划不一致。');
      cache.current.set(requestKey,value);setResult(value);setChosen(params.get('crop')&&value.candidates.some(c=>c.crop===params.get('crop'))?params.get('crop')!:value.recommendation.crop??value.candidates[0]?.crop??'');
    }).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'上市决策暂时无法加载。');}).finally(()=>{if(!controller.signal.aborted)setPending(false);});
    return()=>controller.abort();
  // The serialized key contains every input and the registered model/data versions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[submitted,requestKey,provider,retry]);
  function submit(e:FormEvent){e.preventDefault();if(built.issues.length){setError(built.issues.join(' '));return;}setError('');setSubmitted(true);setRetry(value=>value+1);setParams(previous=>{const next=new URLSearchParams(previous);next.set('horizon',String(built.request!.user_context.market_context.expected_harvest_horizon_days));next.set('as_of',cap!.asOf!);return next;});}
  const slider=<DiscreteHorizonSlider label="预计上市跨度" nodes={nodes} value={nodes.includes(Number(horizon))?Number(horizon):null} onChange={chooseHorizon}/>;
  if(submitted&&pending)return <><WorkbenchMain><h1 className="workbench__title">上市窗口情景</h1>{slider}<p role="status" aria-busy="true">读取 {horizon} 天的本城情景…</p><button className="ag-button" onClick={()=>setSubmitted(false)}>修改上市条件</button></WorkbenchMain><WorkbenchRail><p className="ag-label">情景估算 · 更新中</p><p>{horizon} 天 · 数据基准 {cap?.asOf}</p></WorkbenchRail></>;
  if (cityId !== 'shenyang') return <section className="decision-input"><h1 className="ag-section-title">这个城市的上市决策待接入</h1><p className="decision-note">当前只有沈阳具备同口径长期市场数据。</p></section>;
  if (result) {
    const candidate = result.candidates.find(c => c.crop === chosen) ?? result.candidates[0];
    return <><WorkbenchMain label="上市窗口情景结果"><section className="long-horizon-result" aria-labelledby="long-result-title">
      <header className="decision-input__intro"><p className="ag-label">上市决策 · {result.horizon_days} 天 · {result.expected_harvest_date}</p><h1 id="long-result-title" className="workbench__title">上市窗口情景</h1>
        <p className="ag-lead">{result.ranking_basis === 'profit_scenario' ? '按实际投入比较净收益情景。' : '按上市价格相对当前价格的变化比较市场环境；这不是利润排序。'}</p></header>
      {result.status === 'NO_FEASIBLE_PLAN' && <p role="status" className="decision-note">当前条件下没有可排序的可行方案。</p>}
      {slider}<div className="decision-toolbar"><ChoiceButtons label="上市决策比较作物" value={candidate?.crop ?? ''} onChange={chooseCrop} options={result.candidates.map(c=>({value:c.crop,label:`${c.crop} · ${STATUS_LABELS[c.production_status]}`}))}/>
        <button type="button" className="ag-button" onClick={() => { setSubmitted(false);setResult(null); setError(''); }}>修改上市条件</button></div>
      {candidate && <>
        <DualTargetView targets={candidate.targets} asOf={result.market_as_of} freshness={candidate.freshness} llmStatus={result.llm_status}/>

      </>}
      <p className="decision-boundary">长期结果仅供情景比较，不作强推荐；上市跨度来自你的计划，不是系统推断的生育期。</p>
    </section></WorkbenchMain><WorkbenchRail>
      <h2 className="ag-title">{candidate?.crop ?? '当前窗口'}</h2>
      <dl className="decision-detail__facts"><div><dt>预计上市跨度</dt><dd>{result.horizon_days} 天</dd></div><div><dt>预计上市日期</dt><dd>{result.expected_harvest_date}</dd></div><div><dt>市场数据基准日</dt><dd>{result.market_as_of}</dd></div></dl>
      {candidate && <>        <section className="long-horizon-result__context" aria-labelledby="long-context-title">
        <h2 className="ag-title" id="long-context-title">投入与当前风险</h2>
        <dl className="decision-detail__facts"><div><dt>实际投入净收益情景</dt><dd>{cny(candidate.profit.base)}</dd></div>
          {candidate.profit.available && <div><dt>下行 — 上行情景</dt><dd>{cny(candidate.profit.low)} — {cny(candidate.profit.high)}</dd></div>}
          <div><dt>预算可行性</dt><dd>{candidate.budget_feasible === null ? '实际成本待补' : candidate.budget_feasible ? '在预算内' : '超过预算，不参与排序'}</dd></div>
          <div><dt>当前市场 HRI / 市场风险</dt><dd>{candidate.current_market_context.hri === null ? '—' : number.format(candidate.current_market_context.hri)} / {candidate.current_market_context.market_risk === null ? '—' : number.format(candidate.current_market_context.market_risk)}</dd></div>
          <div><dt>风险数据日期</dt><dd>{candidate.current_market_context.as_of ?? '暂不可用'}</dd></div></dl>
        <details className="decision-disclosure"><summary>方法与数据</summary><FreshnessNote freshness={result.freshness}/><p className="decision-note">气候暴露：{candidate.current_market_context.climate_exposure?.available ? '历史参考口径' : '缺少截止日可用来源，未参与比较。'}</p>
        {result.risk_preference_usage && <p className="decision-note">{result.risk_preference_usage.note}</p>}
        <p className="decision-note">风险描述当前市场环境，不是 {result.horizon_days} 天后的风险预报。成本与亩产均由你提供时才计算收益，价格范围仍是情景。</p>
        <ul className="decision-limitations">{[...new Set([...candidate.warnings, ...result.warnings])].map(w => <li key={w}>{w}</li>)}</ul>
        </details></section></>}

    </WorkbenchRail></>;
  }
  return <><WorkbenchMain label="上市窗口情景条件"><section className="decision-input" aria-labelledby="long-input-title">
    <h1 id="long-input-title" className="workbench__title">上市窗口情景</h1>
    <p className="decision-note">先按自己的计划确认上市时间，再比较价格情景与实际投入。</p>
    {error && <p className="decision-errors" role="alert">{error}</p>}
    {!cap ? <div className="ag-state" role="status">{error ? <button className="ag-button" onClick={() => setRetry(retry + 1)}>重新读取长期能力</button> : '读取上市决策范围'}</div>
      : !cap.supported ? <p role="status" className="decision-note">{cap.limitation ?? '上市决策暂时不可用。'}</p>
        : <form onSubmit={submit} noValidate className="decision-input__form">
          <div className="decision-input__fields"><label>种植面积 <span className="decision-input__unit">亩</span><input name="long-area" type="number" min="0" step="any" value={area} onChange={e => setArea(e.target.value)}/></label>
            <label>可用预算 <span className="decision-input__unit">万元</span><input name="long-budget" type="number" min="0" step="any" value={budget} onChange={e => setBudget(e.target.value)}/></label>
            {slider}
            <label>预计上市日（可选）<input name="expected-harvest-date" type="date" value={date} onChange={e => setDate(e.target.value)}/></label>
            <label>这次更看重<select value={risk} onChange={e => setRisk(e.target.value as typeof risk)}><option value="conservative">稳健一些</option><option value="balanced">兼顾收益与风险</option><option value="aggressive">收益优先</option></select></label></div>
          <p className="decision-note">日期与跨度以数据基准日计算。只支持已登记档位；日期不会自动吸附到附近档位。150 / 180 天为探索性结果。</p>
          <ChoiceButtons label="比较哪些作物（不限制时比较全部）" value={crops} options={cap.crops.map(c=>({value:c.id,label:c.label}))} onChange={crop=>{setCrops(crops.includes(crop)?crops.filter(v=>v!==crop):[...crops,crop]);chooseCrop(crop);}}/>
          <details className="decision-disclosure"><summary>实际成本与亩产</summary><div className="decision-input__fields"><ChoiceButtons label="实际投入对应作物" value={actualCrop} onChange={chooseCrop} options={cap.crops.map(c=>({value:c.id,label:c.label}))}/>
            <label>实际亩均成本 <span className="decision-input__unit">元/亩</span><input name="long-cost" type="number" step="any" value={actual.cost} onChange={e => setInputs({ ...inputs, [actualCrop]: { ...actual, cost: e.target.value } })}/></label>
            <label>实际亩产 <span className="decision-input__unit">kg/亩</span><input name="long-yield" type="number" step="any" value={actual.yield} onChange={e => setInputs({ ...inputs, [actualCrop]: { ...actual, yield: e.target.value } })}/></label></div>
            <p className="decision-note">每种作物可分别填写。未同时提供成本与亩产时，不输出利润。</p></details>
          <button className="ag-button ag-button--primary" type="submit" disabled={pending}>{pending ? '比较上市情景中' : '比较上市决策 →'}</button>
        </form>}
  </section></WorkbenchMain><WorkbenchRail>
    <p className="ag-label">沈阳 · 当前上市条件</p>
    <dl className="decision-detail__facts"><div><dt>上市跨度</dt><dd>{nodes.includes(Number(horizon)) ? `${horizon} 天` : '按自己的计划选择'}</dd></div><div><dt>预计上市日</dt><dd>{date || '未指定'}</dd></div><div><dt>市场数据基准日</dt><dd>{cap?.asOf ?? '确认中'}</dd></div><div><dt>面积 / 预算</dt><dd>{area || '未填写'} 亩 / {budget || '未填写'} 万元</dd></div></dl>
    <p className="decision-note">上市跨度来自你的计划；150 / 180 天仅作探索参考。</p>
  </WorkbenchRail></>;
}
