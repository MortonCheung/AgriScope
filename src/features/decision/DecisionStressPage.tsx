import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TransitionLink } from '../../app/pageNavigation';
import { ROUTES } from '../../app/routes';
import { getCity } from '../../domain/geography/cities';
import { formulaStress, stressPresets } from '../../domain/decision/calculations';
import type { DecisionCandidate, StressScenario } from '../../domain/decision/types';
import { getDecisionProvider } from '../../providers/decision';
import { useDecisionSession } from '../../services/useDecisionSession';
import { AnimatedUnderline } from '../../components/AnimatedUnderline';
import { ConfidenceMark, dateWindow, formatNumber, money, RangePlot } from './DecisionVisuals';
import './decision.css';

export function DecisionStressPage(){
  const [params,setParams]=useSearchParams();
  const cityId=params.get('city')??'';const city=getCity(cityId);const testState=params.get('test_state');
  const session=useDecisionSession(cityId,getDecisionProvider(testState),testState,true);
  const {state}=session;const result=state.result;
  const candidate=result?.candidates.find(c=>c.id===params.get('plan'))??result?.candidates[0];
  const decisionUrl=`${ROUTES.decision(cityId||'shenyang')}?${new URLSearchParams({view:'result',...(candidate?{plan:candidate.id}:{}),...(testState?{test_state:testState}:{})})}`;
  return <main className="decision decision-stress">
    <TransitionLink className="decision__crumb" to={decisionUrl}>← 返回种植选择</TransitionLink>
    {state.status==='loading'?<section className="decision-loading" role="status" aria-busy="true"><h1 className="ag-section-title">找回这份方案</h1><i className="ag-skeleton"/></section>
    :!candidate||!result||result.status!=='ok'?<section className="decision-loading" role={state.status==='error'?'alert':'status'}><h1 className="ag-section-title">{state.status==='error'?'方案暂时无法加载':'先选一份种植方案'}</h1><p className="decision-note">{state.error??result?.warnings[0]??'压力情景需要种植面积、预算与上市时间。'}</p>{state.request&&<button className="ag-button" onClick={()=>void session.run(state.request!)}>重试</button>}<TransitionLink to={`${ROUTES.decision(cityId||'shenyang')}?view=input`} className="ag-button">填写条件 →</TransitionLink></section>
    :<>
      <header className="decision-section-head"><p className="ag-label">{city?.shortName} · {candidate.crop} · {formatNumber(candidate.area_mu)} 亩</p><h1 className="ag-section-title">条件变差，还撑得住吗。</h1><p className="ag-lead">保持原方案，对照几种现实压力。</p><p className="decision-note">情景演示，不是价格、天气或减产预测。上市窗口：{dateWindow(candidate.harvest_window)}。</p><ConfidenceMark confidence={result.recommendation.confidence}/></header>
      <StressExperiment key={candidate.id} candidate={candidate} sourceLabel={result.data_status==='legacy_model_fixture'?'历史样例':'模型情景'}/>
      <div className="decision-stress__context"><label>换一个方案试试<select aria-label="压力情景方案" value={candidate.id} onChange={e=>setParams(p=>{p.set('plan',e.target.value);['stress','price','yield','cost','delay'].forEach(k=>p.delete(k));return p;})}>{result.candidates.map(c=><option key={c.id} value={c.id}>{c.crop} · {dateWindow(c.harvest_window)}</option>)}</select></label></div>
      <details className="decision-disclosure"><summary>假设与限制</summary><ul className="decision-limitations">{[...new Set([...candidate.warnings,...result.warnings,...result.assumptions])].map(w=><li key={w}>{w}</li>)}</ul></details>
      <p className="decision-boundary">{result.data_status==='legacy_model_fixture'?'旧模型历史样例':result.data_status==='mock'?'演示情景':'模型结果'} · 参考成本可能缺项，请核对完整投入。</p>
      <TransitionLink className="decision-text-button" to={ROUTES.scenario}>查看沈阳暴雨研究推演 →</TransitionLink>
    </>}
  </main>;
}
function StressExperiment({candidate,sourceLabel}:{candidate:DecisionCandidate;sourceLabel:string}){
  const presets=stressPresets(candidate);
  const [params,setParams]=useSearchParams();
  const selected=params.get('stress')??'normal';
  const [draft,setDraft]=useState({price:params.get('price')??'-10',yield:params.get('yield')??'0',cost:params.get('cost')??'0',delay:params.get('delay')??'0'});
  const [error,setError]=useState('');
  const queryChanges={price_pct:Number(params.get('price')),yield_pct:Number(params.get('yield')),cost_pct:Number(params.get('cost')),delay_days:Number(params.get('delay'))};
  const valid=(changes:StressScenario['changes'])=>Object.values(changes).every(Number.isFinite)&&changes.price_pct>=-100&&changes.price_pct<=0&&changes.yield_pct>=-100&&changes.yield_pct<=0&&changes.cost_pct>=0&&changes.cost_pct<=100&&Number.isInteger(changes.delay_days)&&changes.delay_days>=0&&changes.delay_days<=60;
  const makeScenario=(changes:StressScenario['changes'],label:string)=>{
    const saved=candidate.stress_scenarios.find(s=>Object.entries(changes).every(([k,v])=>s.changes[k as keyof typeof changes]===v));
    return saved??formulaStress(candidate,changes,label);
  };
  const validCustom=selected==='custom'&&['price','yield','cost','delay'].every(k=>params.has(k)&&params.get(k)?.trim())&&valid(queryChanges);
  const custom=validCustom?makeScenario(queryChanges,'自定义压力'):null;
  const scenario=custom??presets.find(s=>s.id===selected)??presets[0];
  const invalidLink=selected==='custom'&&!validCustom || selected!=='custom'&&!presets.some(s=>s.id===selected);
  const c=scenario.changes;
  const apply=(changes:StressScenario['changes'])=>{
    setParams(p=>{p.set('stress','custom');p.set('price',String(changes.price_pct));p.set('yield',String(changes.yield_pct));p.set('cost',String(changes.cost_pct));p.set('delay',String(changes.delay_days));return p;});setError('');
    setDraft({price:String(changes.price_pct),yield:String(changes.yield_pct),cost:String(changes.cost_pct),delay:String(changes.delay_days)});
  };
  function submit(e:FormEvent){
    e.preventDefault();
    if(Object.values(draft).some(v=>v.trim()==='')){setError('请填完整四项变化，未变化填 0。');return;}
    const changes={price_pct:Number(draft.price),yield_pct:Number(draft.yield),cost_pct:Number(draft.cost),delay_days:Number(draft.delay)};
    if(!valid(changes)){setError('价格与亩产变化需在 -100% 到 0%，成本在 0% 到 100%，延迟在 0 到 60 个整天。');return;}
    apply(changes);
  }
  const domainRanges=[...presets.map(s=>s.profit),scenario.profit];
  return <section className="decision-stress__experiment" aria-label="压力情景实验">
    <div className="decision-modes" aria-label="现实场景">{presets.map(s=><button key={s.id} aria-pressed={!custom&&scenario.id===s.id} onClick={()=>{setParams(p=>{p.set('stress',s.id);['price','yield','cost','delay'].forEach(k=>p.delete(k));return p;});setError('');}}>{s.label}{!custom&&scenario.id===s.id&&<AnimatedUnderline layoutId="stress-mode"/>}</button>)}</div>
    {invalidLink&&<p className="decision-note" role="status">链接中的压力条件无效，当前显示原方案。</p>}
    <div className="decision-stress__reading">
      <div>
        <div className="decision-stress__change" aria-live="polite"><p className="ag-label">{scenario.label} · {scenario.is_mock?'公式演示':sourceLabel}</p><p className="decision-note">价格 {formatNumber(c.price_pct,'%')} · 亩产 {formatNumber(c.yield_pct,'%')} · 成本 {formatNumber(c.cost_pct,'%')} · 上市延迟 {c.delay_days} 天</p><h2 className="decision-result__range">基准净收益 {money(scenario.profit.base)}</h2><p className="decision-note">相对原方案 {scenario.delta_cny===null?'待评估':`${scenario.delta_cny>0?'+':''}${money(scenario.delta_cny)}`}</p></div>
        <RangePlot title="原方案与压力情景净收益" domainRanges={domainRanges} rows={[{label:'原方案',range:candidate.profit,baseline:true},{label:'压力情景',range:scenario.profit}]}/>
        <p className="decision-note">{scenario.note}{!scenario.is_mock&&scenario.id!=='normal'&&scenario.profit.high===null?' 压力结果的上行情景待补充。':''}</p>
      </div>
      <aside className="decision-stress__reading-aside"><p className="ag-label">先读下行，再看基准</p><dl className="decision-detail__facts"><div><dt>下行情景</dt><dd>{money(scenario.profit.low)}</dd></div><div><dt>上行情景</dt><dd>{money(scenario.profit.high)}</dd></div><div><dt>基准投入回报率</dt><dd>{formatNumber(scenario.roi===null?null:scenario.roi*100,'%')}</dd></div></dl><p className="decision-note">{scenario.profit.low!==null&&scenario.profit.low<0?'这份下行情景已出现亏损。':scenario.profit.low===null?'下行收益缺少估算依据。':'下行收益高于零，仍需核对人工、地租与折旧等成本。'}</p></aside>
    </div>
    <details className="decision-disclosure"><summary>细调压力条件</summary>
      <div className="decision-actions"><button className="ag-button" onClick={()=>apply({price_pct:-10,yield_pct:0,cost_pct:0,delay_days:0})}>价格 -10%</button><button className="ag-button" onClick={()=>apply({price_pct:0,yield_pct:0,cost_pct:20,delay_days:0})}>成本 +20%</button><button className="ag-button" onClick={()=>apply({price_pct:0,yield_pct:0,cost_pct:0,delay_days:7})}>上市延迟 7 天</button></div>
      <form className="decision-stress__form" onSubmit={submit} noValidate>{[['price','价格变化','%'],['yield','亩产变化','%'],['cost','成本变化','%'],['delay','上市延迟','天']].map(([key,label,unit])=><label key={key}>{label}（{unit}）<input name={`stress-${key}`} type="number" step={key==='delay'?'1':'any'} value={draft[key as keyof typeof draft]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}{error&&<p className="decision-errors" role="alert">{error}</p>}<button className="ag-button ag-button--primary" type="submit">对照这组条件</button></form>
    </details>
  </section>;
}
