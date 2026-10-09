import { useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { TransitionLink } from '../../app/pageNavigation';
import { ROUTES } from '../../app/routes';
import { getCity } from '../../domain/geography/cities';
import { getDecisionProvider } from '../../providers/decision';
import { useDecisionSession } from '../../services/useDecisionSession';
import { DecisionInput } from './DecisionInput';
import { DecisionDetail, DecisionEvidence, DecisionSummary } from './DecisionResultView';
import { DecisionCompare } from './DecisionCompare';
import { AnimatedUnderline } from '../../components/AnimatedUnderline';
import { formatNumber } from './DecisionVisuals';
import { evaluationLabel } from './presentation';
import { LongHorizonPlanning } from '../longHorizon/LongHorizonPlanning';
import { DecisionCenter } from './DecisionCenter';
import type { DecisionResult, Strategy } from '../../domain/decision/types';
import './decision.css';
const strategyNames:Record<Strategy,string>={balanced:'综合',robust:'稳健',return:'收益优先',low_risk:'低风险',alternative:'替代'};

export function DecisionPage(){
  const {cityId=''}=useParams();const city=getCity(cityId);
  const [params,setParams]=useSearchParams();
  const testState=import.meta.env.DEV?params.get('test_state'):null;const provider=getDecisionProvider(testState);
  const rawView=params.get('view');
  const session=useDecisionSession(cityId,provider,testState,rawView!=='input'&&rawView!=='long-horizon'&&rawView!=='center');
  const {state}=session;
  const main=useRef<HTMLElement>(null);
  const view=rawView??'center';
  const edit=()=>setParams(p=>{p.set('view','input');return p;});
  const switchView=(next:string)=>setParams(p=>{p.set('view',next);return p;});
  const result=state.result;
  const candidate=result?.candidates.find(c=>c.id===params.get('plan'))??result?.candidates.find(c=>c.id===result.recommendation.candidate_id)??result?.candidates[0];
  const choose=(id:string)=>setParams(p=>{p.set('plan',id);p.set('view','result');return p;});
  useEffect(()=>{
    if(!state.request||state.status==='loading')return;
    const heading=main.current?.querySelector<HTMLElement>('h1');
    heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});
  },[state.status,view,candidate?.id]);
  if(!city)return <main className="decision"><h1 className="ag-section-title">城市入口不存在</h1><TransitionLink to={ROUTES.liaoning} className="ag-button">返回辽宁</TransitionLink></main>;
  return <main className="decision" ref={main}>
    <TransitionLink className="decision__crumb" to={ROUTES.city(cityId)}>← {city.shortName}研究</TransitionLink>
    <nav className="decision-modes" aria-label="决策周期"><button aria-pressed={view==='center'} onClick={()=>switchView('center')}>决策中心</button><button aria-pressed={view==='input'} onClick={()=>switchView('input')}>短期市场比较</button><button aria-pressed={view==='long-horizon'} onClick={()=>switchView('long-horizon')}>上市窗口决策</button></nav>
    {view==='center'?<DecisionCenter cityId={cityId} savedRequest={session.savedRequest} onAdjustConditions={()=>switchView('input')}/>
      :view==='long-horizon'?<LongHorizonPlanning cityId={cityId}/>:view==='input'?<DecisionInput key={cityId} cityId={cityId} provider={provider} expandInputs={result?.status==='user_input_required'||result?.issues.includes('user_input_required')} initial={session.savedRequest} onSubmit={request=>{setParams(p=>{p.set('view','result');p.delete('plan');return p;});void session.run(request);}}/>
      :state.status==='loading'?<section className="decision-loading" role="status" aria-label="方案比较中" aria-busy="true"><h1 className="ag-section-title">比较这季的选择</h1><div className="ag-state ag-state--loading" aria-hidden="true"><i className="ag-skeleton"/><i className="ag-skeleton"/><i className="ag-skeleton"/></div><button className="ag-button" onClick={()=>{session.cancel();edit();}}>返回修改条件</button></section>
      :state.status==='error'?<section className="ag-state" role="alert"><h1 className="ag-section-title">暂时没能完成比较</h1><p>{state.error}</p><div className="decision-actions"><button className="ag-button ag-button--primary" onClick={()=>{if(state.request)void session.run(state.request);}}>重试</button><button className="ag-button" onClick={edit}>修改条件</button></div></section>
      :result && candidate && result.status==='ok'?<>
        <div className="decision-toolbar"><p className="decision-toolbar__context">{city.shortName} · {formatNumber(result.request.user_context.area_mu)} 亩 · 预算 {formatNumber(result.request.user_context.budget_cny/10000)} 万元</p><label className="decision-toolbar__select">种植方向<select aria-label="种植方向" value={candidate.id} onChange={e=>choose(e.target.value)}>{result.candidates.map(c=><option key={c.id} value={c.id}>{c.crop} · {c.strategies.map(s=>strategyNames[s]).join(' / ')} · {evaluationLabel(c)}</option>)}</select></label><button className="decision-text-button" onClick={edit}>修改条件</button></div>
        <nav className="decision-modes" aria-label="方案阅读方式">{[['result','方案'],['detail','收益与风险'],['compare','比较'],['evidence','依据']].map(([id,label])=><button key={id} aria-pressed={view===id} onClick={()=>switchView(id)}>{label}<AnimatedUnderline active={view===id}/></button>)}</nav>
        {view==='detail'?<DecisionDetail candidate={candidate} result={result}/>:view==='compare'?<DecisionCompare result={result} initialId={candidate.id} onChoose={choose}/>:view==='evidence'?<DecisionEvidence candidate={candidate} result={result}/>:<DecisionSummary result={result} candidate={candidate} onDetail={()=>switchView('detail')} onCompare={()=>switchView('compare')} onEvidence={()=>switchView('evidence')} stressUrl={`${ROUTES.scenario}?${new URLSearchParams({mode:'decision',city:cityId,plan:candidate.id,...(testState?{test_state:testState}:{})})}`}/>}
        <p className="decision-boundary">{result.data_status==='legacy_model_fixture'?'旧模型历史样例':result.data_status==='mock'?'演示情景':'模型结果'} · {result.issues.includes('partial_result')?'部分数据待补充 · ':''}{result.issues.includes('proxy_only')?'含参考口径 · ':''}价格与收益情景用于比较，实际结果取决于完整投入与市场条件。</p>
      </>:result?<DecisionUnavailable result={result} onEdit={edit} onRetry={()=>{if(state.request)void session.run(state.request);}}/>:<DecisionInput cityId={cityId} provider={provider} initial={session.savedRequest} onSubmit={request=>{switchView('result');void session.run(request);}}/>}
  </main>;
}
function DecisionUnavailable({result,onEdit,onRetry}:{result:DecisionResult;onEdit:()=>void;onRetry:()=>void}){
  const title=result.status==='model_error'?'暂时没能完成比较':result.status==='user_input_required'?'补充实际投入，再比较':result.issues.includes('no_feasible_window')?'这个作物暂时没有合适的上市窗口':result.issues.includes('no_diversification_benefit')?'当前组合没有明确的分散收益':result.issues.includes('insufficient_market_data')?'这个城市的决策数据待接入':'这些条件下，暂时没有选择';
  return <section className="decision-loading" role={result.status==='model_error'?'alert':'status'}><p className="ag-label">{result.data_status==='mock'?'演示状态':'决策状态'}</p><h1 className="ag-section-title">{title}</h1>{result.warnings.map(w=><p className="decision-note" key={w}>{w}</p>)}<div className="decision-actions">{result.status==='model_error'&&<button className="ag-button ag-button--primary" onClick={onRetry}>重试</button>}<button className="ag-button" onClick={onEdit}>修改条件</button></div></section>;
}
