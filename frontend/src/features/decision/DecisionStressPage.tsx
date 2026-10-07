import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TransitionLink } from '../../app/pageNavigation';
import { ROUTES } from '../../app/routes';
import { getCity } from '../../domain/geography/cities';
import { FormalStressExperiment } from './FormalStressExperiment';
import { shownConfidence, evaluationLabel } from './presentation';
const LegacyStressExperiment=(!import.meta.env.PROD||import.meta.env.VITE_ENABLE_DEMO==='true'&&(import.meta.env.VITE_DECISION_PROVIDER==='fixtures'||import.meta.env.VITE_DECISION_PROVIDER==='mock'))?lazy(()=>import('./LegacyStressExperiment').then(m=>({default:m.LegacyStressExperiment}))):null;
import { getDecisionProvider } from '../../providers/decision';
import { useDecisionSession } from '../../services/useDecisionSession';
import { ConfidenceMark, formatNumber } from './DecisionVisuals';
import './decision.css';

export function DecisionStressPage(){
  const [params,setParams]=useSearchParams();
  const cityId=params.get('city')??'';const city=getCity(cityId);const testState=import.meta.env.DEV?params.get('test_state'):null;
  const provider=getDecisionProvider(testState);
  const session=useDecisionSession(cityId,provider,testState,true);
  const {state}=session;const result=state.result;
  const candidate=result?.candidates.find(c=>c.id===params.get('plan'))??result?.candidates[0];
  const decisionUrl=`${ROUTES.decision(cityId||'shenyang')}?${new URLSearchParams({view:'result',...(candidate?{plan:candidate.id}:{}),...(testState?{test_state:testState}:{})})}`;
  return <main className="decision decision-stress">
    <TransitionLink className="decision__crumb" to={decisionUrl}>← 返回种植选择</TransitionLink>
    {state.status==='loading'?<section className="decision-loading" role="status" aria-busy="true"><h1 className="ag-section-title">找回这份方案</h1><i className="ag-skeleton"/></section>
    :!candidate||!result||result.status!=='ok'?<section className="decision-loading" role={state.status==='error'?'alert':'status'}><h1 className="ag-section-title">{state.status==='error'?'方案暂时无法加载':'先选一份种植方案'}</h1><p className="decision-note">{state.error??result?.warnings[0]??'压力情景需要种植面积、预算与上市时间。'}</p>{state.request&&<button className="ag-button" onClick={()=>void session.run(state.request!)}>重试</button>}<TransitionLink to={`${ROUTES.decision(cityId||'shenyang')}?view=input`} className="ag-button">填写条件 →</TransitionLink></section>
    :<>
      <header className="decision-section-head"><p className="ag-label">{city?.shortName} · {candidate.crop} · {formatNumber(candidate.area_mu)} 亩</p><h1 className="ag-section-title">条件变差，还撑得住吗。</h1><p className="ag-lead">保持原方案，对照几种现实压力。</p><p className="decision-note">情景演示，不是价格、天气或减产预测。{evaluationLabel(candidate)}。</p><ConfidenceMark confidence={shownConfidence(result,candidate)}/></header>
      {result.data_status==='model'?<FormalStressExperiment key={candidate.id} candidate={candidate} request={result.request} provider={provider}/>:LegacyStressExperiment&&<Suspense fallback={<p role="status">情景加载中</p>}><LegacyStressExperiment key={candidate.id} candidate={candidate} sourceLabel={result.data_status}/></Suspense>}
      <div className="decision-stress__context"><label>换一个方案试试<select aria-label="压力情景方案" value={candidate.id} onChange={e=>setParams(p=>{p.set('plan',e.target.value);['stress','price','yield','cost','delay'].forEach(k=>p.delete(k));return p;})}>{result.candidates.map(c=><option key={c.id} value={c.id}>{c.crop} · {evaluationLabel(c)}</option>)}</select></label></div>
      <details className="decision-disclosure"><summary>假设与限制</summary><ul className="decision-limitations">{[...new Set([...candidate.warnings,...result.warnings,...result.assumptions])].map(w=><li key={w}>{w}</li>)}</ul></details>
      <p className="decision-boundary">{result.data_status==='legacy_model_fixture'?'旧模型历史样例':result.data_status==='mock'?'演示情景':'模型结果'} · 参考成本可能缺项，请核对完整投入。</p>
      <TransitionLink className="decision-text-button" to={ROUTES.scenario}>查看沈阳暴雨研究推演 →</TransitionLink>
    </>}
  </main>;
}
