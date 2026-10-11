import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { TransitionLink, usePageNavigate } from '../../app/pageNavigation';
import { provinceUrl } from '../../app/context/provinceSelection';
import { WorkbenchLayout, WorkbenchMain, WorkbenchRail } from '../../components/workbench/WorkbenchLayout';
import { PlanningWorkbench } from './PlanningWorkbench';
import { ROUTES, structuralParent } from '../../app/routes';
import { getCity } from '../../domain/geography/cities';
import { getDecisionProvider } from '../../providers/decision';
import { useDecisionSession, type DecisionSelection } from '../../services/useDecisionSession';
import { DecisionInput } from './DecisionInput';
import { DecisionDetail, DecisionResultRail, DecisionSummary } from './DecisionResultView';
import { DecisionCompare } from './DecisionCompare';
import { formatNumber } from './DecisionVisuals';
import { evaluationLabel } from './presentation';
import { LongHorizonPlanning } from '../longHorizon/LongHorizonPlanning';
import { DecisionCenter } from './DecisionCenter';
import { useMarketObservation } from './useMarketObservation';
import type { DecisionCapability, DecisionResult, Strategy } from '../../domain/decision/types';
import { ChoiceButtons } from '../../components/controls/ChoiceButtons';
import { DiscreteHorizonSlider } from '../../components/controls/DiscreteHorizonSlider';
import { useAppContext } from '../../app/context/appContext';
import './decision.css';

const strategyNames: Record<Strategy, string> = { balanced: '综合', robust: '稳健', return: '收益优先', low_risk: '低风险', alternative: '替代' };
const SHORT_VIEWS = ['input', 'result', 'detail', 'compare', 'evidence'];
const MODULES = [{ id: 'planning', label: '经营计划' }, { id: 'center', label: '市场观察' }, { id: 'input', label: '短期市场比较' }, { id: 'long-horizon', label: '上市窗口情景' }] as const;

export function DecisionPage() {
  const { cityId = '' } = useParams();
  const city = getCity(cityId);
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const testState = import.meta.env.DEV ? params.get('test_state') : null;
  const provider = getDecisionProvider(testState);
  const rawView = params.get('view') ?? 'planning';
  const view = ['planning', 'center', 'long-horizon', ...SHORT_VIEWS].includes(rawView) ? rawView : 'planning';
  const module = SHORT_VIEWS.includes(view) ? 'input' : view;
  const navigate = usePageNavigate();
  const [capAttempt, setCapAttempt] = useState(0);
  const [capState, setCapState] = useState<{ cityId: string; data?: DecisionCapability; error?: string }>({ cityId });
  const market = useMarketObservation(cityId, module === 'center' ? params.get('crop') || undefined : undefined);
  useEffect(() => {
    const controller = new AbortController();
    setCapState({ cityId });
    if (provider.capabilities) void provider.capabilities(cityId, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setCapState({ cityId, data });
    }, error => {
      if (!controller.signal.aborted) setCapState({ cityId, error: error instanceof Error ? error.message : '市场能力暂时无法读取' });
    });
    return () => controller.abort();
  }, [capAttempt, cityId, provider]);
  const cap = capState.cityId === cityId ? capState.data : undefined;
  const capError = capState.cityId === cityId ? capState.error : undefined;
  const explicitDemo = provider.data_mode === 'fixtures' || provider.data_mode === 'mock';
  const priceSupported = (cap?.features?.short_term_price.supported ?? cap?.supported) === true || explicitDemo;
  const longSupported = cityId === 'shenyang' && (cap?.features?.long_horizon_scenario.supported ?? false);
  const marketAvailable = market.status === 'ready' ? market.data?.available : undefined;
  const shortHorizon = Number(params.get('horizon'));
  const selection: DecisionSelection = { crop: params.get('crop') || undefined, horizon: [7,14,30].includes(shortHorizon) ? shortHorizon : undefined, asOf: params.get('as_of') || undefined };
  const session = useDecisionSession(cityId, provider, testState, priceSupported && ['result', 'detail', 'compare', 'evidence'].includes(view), selection, cap ? `${cap.model_version}:${cap.data_version}:${cap.code_fingerprint}` : '');
  const { state } = session;
  const main = useRef<HTMLElement>(null);
  const switchView = (next: string, replace = false) => { if (!SHORT_VIEWS.includes(next)) session.cancel(); setParams(previous => { const nextParams = new URLSearchParams(previous); nextParams.set('view', next); if (next === 'planning') nextParams.delete('plan'); if (next === 'input' && ![7,14,30].includes(Number(nextParams.get('horizon')))) {nextParams.delete('horizon');useAppContext.getState().setHorizon(null);} return nextParams; }, { replace }); };
  const updateSelection = (value: DecisionSelection) => { const context = useAppContext.getState(); context.setCity(cityId); if(value.crop) context.setCrop(value.crop);if(value.horizon !== undefined)context.setHorizon(value.horizon as 7|14|30);if(value.asOf)context.setAsOf(value.asOf);setParams(previous => {const next=new URLSearchParams(previous);next.set('city',cityId);if(value.crop){next.set('crop',value.crop);next.delete('plan');}if(value.horizon !== undefined)next.set('horizon',String(value.horizon));if(value.asOf)next.set('as_of',value.asOf);return next;}); };
  useEffect(() => { if(module==='center' && market.data?.available && market.data.selectedCrop && params.get('crop')!==market.data.selectedCrop)updateSelection({crop:market.data.selectedCrop}); }, [module,market.data,params]);
  useEffect(()=>{if(module==='input'&&cap?.supported&&params.get('crop')&&!cap.crops.some(c=>c.id===params.get('crop')))setParams(previous=>{const next=new URLSearchParams(previous);next.delete('crop');useAppContext.getState().setCrop(null);return next;},{replace:true});},[module,cap,params,setParams]);
  useEffect(() => { if(module==='input' && params.has('horizon') && ![7,14,30].includes(Number(params.get('horizon'))))setParams(previous=>{const next=new URLSearchParams(previous);next.delete('horizon');useAppContext.getState().setHorizon(null);return next;},{replace:true}); }, [module,params,setParams]);
  const edit = () => switchView('input');
  const unsupportedModel = (Boolean(cap) || Boolean(capError)) && !explicitDemo && ((module === 'input' && !priceSupported) || (module === 'long-horizon' && !longSupported));
  useEffect(() => {
    if (unsupportedModel || (module === 'center' && marketAvailable === false)) {
      setParams(previous => { const next = new URLSearchParams(previous); next.set('view', 'planning'); next.delete('plan'); return next; }, { replace: true });
    }
  }, [marketAvailable, module, setParams, unsupportedModel]);
  const result = state.result;
  const candidate = result?.candidates.find(item => item.id === params.get('plan') && (!selection.crop || item.crop === selection.crop)) ?? result?.candidates.find(item => item.crop === selection.crop) ?? result?.candidates.find(item => item.id === result.recommendation.candidate_id) ?? result?.candidates[0];
  const choose = (id: string) => { const crop=result?.candidates.find(item=>item.id===id)?.crop;if(crop)useAppContext.getState().setCrop(crop);setParams(previous => { const next = new URLSearchParams(previous); next.set('plan', id);if(crop)next.set('crop',crop);next.set('view', 'result'); return next; }); };
  const resultControls = state.request?.contract_version === '1' ? <div className="decision-current-controls"><ChoiceButtons label="种植方向" value={candidate?.id ?? ''} options={(result?.candidates ?? []).map(item=>({value:item.id,label:`${item.crop} · ${item.strategies.map(strategy => strategyNames[strategy]).join(' / ')}`}))} onChange={choose}/><DiscreteHorizonSlider label="市场评估跨度" nodes={(cap?.features?.short_term_price.horizons ?? [7,14,30]).filter(days=>[7,14,30].includes(days)).sort((a,b)=>a-b)} value={state.request.user_context.market_context.horizon_days} onChange={horizon=>updateSelection({horizon})}/></div> : null;
  useEffect(() => {
    if (!state.request || state.status === 'loading') return;
    const heading = main.current?.querySelector<HTMLElement>('h1');
    heading?.setAttribute('tabindex', '-1'); heading?.focus({ preventScroll: true });
  }, [candidate?.id, state.request, state.status, view]);
  if (!city) return <main className="decision"><h1 className="ag-section-title">城市入口不存在</h1><TransitionLink to={ROUTES.liaoning} className="ag-button">返回辽宁</TransitionLink></main>;

  const shortSubmit = (request: Parameters<typeof session.run>[0]) => { setParams(previous => { const next = new URLSearchParams(previous); next.set('view', 'result'); next.delete('plan');if(request.contract_version==='1'){const context=request.user_context.market_context;next.set('horizon',String(context.horizon_days));next.set('as_of',context.as_of);const requestedCrop=next.get('crop');if(!requestedCrop || !cap?.crops.some(c=>c.id===requestedCrop) || (request.user_context.crop_preferences.length && !request.user_context.crop_preferences.includes(requestedCrop)))next.set('crop',request.user_context.crop_preferences[0]??cap?.crops[0]?.id??'');const app=useAppContext.getState();app.setHorizon(context.horizon_days as 7|14|30);app.setAsOf(context.as_of);} return next; }); void session.run(request); };
  const activeModule = unsupportedModel || (module === 'center' && marketAvailable === false) ? 'planning' : module;
  let content;
  if (activeModule === 'planning') content = <PlanningWorkbench cityId={cityId} />;
  else if (activeModule === 'center') content = <DecisionCenter cityId={cityId} observation={market} onCrop={crop => updateSelection({crop})} onPlanning={() => switchView('planning')} />;
  else if (!cap && !explicitDemo) content = <><WorkbenchMain><h1 className="workbench__title">确认模型能力</h1><p role="status">{capError ?? '读取本城模型能力…'}</p><button type="button" className="ag-button" onClick={() => setCapAttempt(value => value + 1)}>重试能力读取</button></WorkbenchMain><WorkbenchRail><p className="decision-note">经营计划可独立完成公式核算。</p></WorkbenchRail></>;
  else if (activeModule === 'long-horizon') content = <LongHorizonPlanning key={cityId} cityId={cityId} />;
  else if (view === 'input' || (!result && state.status === 'idle')) content = <DecisionInput key={cityId} cityId={cityId} provider={provider} expandInputs={result?.status === 'user_input_required' || result?.issues.includes('user_input_required')} initial={session.savedRequest} selection={selection} onSelection={updateSelection} onSubmit={shortSubmit} />;
  else if (state.status === 'loading') content = <><WorkbenchMain>{resultControls}<section className="decision-loading" role="status" aria-label="方案比较中" aria-busy="true"><h1 className="workbench__title">比较当前条件</h1><div className="ag-state ag-state--loading" aria-hidden="true"><i className="ag-skeleton" /><i className="ag-skeleton" /></div><button className="ag-button" onClick={() => { session.cancel(); edit(); }}>返回修改条件</button></section></WorkbenchMain><WorkbenchRail><p className="ag-label">模型情景 · 更新中</p><p className="decision-note">{selection.crop ?? state.request?.user_context.crop_preferences.join('、')} · {selection.horizon ?? (state.request?.contract_version==='1'?state.request.user_context.market_context.horizon_days:'—')} 天；等待本城模型结果。</p></WorkbenchRail></>;
  else if (state.status === 'error') content = <><WorkbenchMain><section role="alert"><h1 className="workbench__title">暂时没能完成比较</h1><p>{state.error}</p><div className="decision-actions"><button className="ag-button" onClick={() => { if (state.request) void session.run(state.request); }}>重试</button><button className="ag-button" onClick={edit}>修改条件</button></div></section></WorkbenchMain><WorkbenchRail><p className="decision-note">连接恢复后显示模型真实结果。</p></WorkbenchRail></>;
  else if (result && candidate && result.status === 'ok') content = <>
    <WorkbenchMain label="短期比较结果">
      <div className="decision-toolbar"><p className="decision-toolbar__context">{formatNumber(result.request.user_context.area_mu)} 亩 · 预算 {formatNumber(result.request.user_context.budget_cny / 10000)} 万元</p><button className="decision-text-button" onClick={edit}>修改条件</button></div>
      {resultControls}
      <nav className="decision-modes" aria-label="方案阅读方式">{[['result', '方案'], ['detail', '收益与风险'], ['compare', '比较']].map(([id, label]) => <button key={id} aria-pressed={view === id} onClick={() => switchView(id)}>{label}</button>)}</nav>
      {view === 'detail' ? <DecisionDetail candidate={candidate} result={result} /> : view === 'compare' ? <DecisionCompare result={result} initialId={candidate.id} onChoose={choose} /> : <DecisionSummary result={result} candidate={candidate} onDetail={() => switchView('detail')} onCompare={() => switchView('compare')} onEvidence={() => switchView('evidence')} stressUrl={`${ROUTES.scenario}?${new URLSearchParams({ mode: 'decision', city: cityId, plan: candidate.id, ...(testState ? { test_state: testState } : {}) })}`} />}
    </WorkbenchMain>
    <WorkbenchRail><p className="ag-label">{city.shortName} · {result.data_status === 'legacy_model_fixture' ? '旧模型历史样例' : result.data_status === 'mock' ? '演示情景' : '模型情景' }</p><DecisionResultRail result={result} candidate={candidate} /></WorkbenchRail>
  </>;
  else if (result) content = <><WorkbenchMain><DecisionUnavailable result={result} onEdit={edit} onRetry={() => { if (state.request) void session.run(state.request); }} /></WorkbenchMain><WorkbenchRail><p className="decision-note">没有可展示的有效模型方案。</p></WorkbenchRail></>;
  else content = <DecisionInput key={cityId} cityId={cityId} provider={provider} initial={session.savedRequest} selection={selection} onSelection={updateSelection} onSubmit={shortSubmit} />;

  return <WorkbenchLayout className="decision-workbench" resetKey={cityId} sidebarLabel="决策模块" railLabel="当前结果" mainRef={main} onEscape={() => navigate(structuralParent(location.pathname, location.search) ?? provinceUrl(cityId))}
    sidebar={close => <ol className="workbench__menu" aria-label="决策工具">{MODULES.map(item => {
      const reason = item.id === 'center' ? marketAvailable === false ? '尚未发布本城同口径观测' : market.status === 'loading' ? '读取观测范围中' : undefined : item.id === 'input' ? !priceSupported ? cap ? '本城尚未发布短期模型' : capError ? '模型能力暂时无法确认' : '读取模型范围中' : undefined : item.id === 'long-horizon' ? !longSupported ? cap || cityId !== 'shenyang' ? '本城尚未发布长期情景' : capError ? '模型能力暂时无法确认' : '读取模型范围中' : undefined : undefined;
      return <li key={item.id}><button type="button" aria-pressed={activeModule === item.id} disabled={Boolean(reason)} aria-describedby={reason ? `decision-module-${item.id}-reason` : undefined} onClick={() => { switchView(item.id); close(); }}>{item.label}</button>{reason && <small id={`decision-module-${item.id}-reason`}>{reason}</small>}</li>;
    })}</ol>}
  >{content}</WorkbenchLayout>;
}

function DecisionUnavailable({ result, onEdit, onRetry }: { result: DecisionResult; onEdit: () => void; onRetry: () => void }) {
  const title = result.status === 'model_error' ? '暂时没能完成比较' : result.status === 'user_input_required' ? '补充实际投入，再比较' : result.issues.includes('no_feasible_window') ? '这个作物暂时没有合适的上市窗口' : result.issues.includes('no_diversification_benefit') ? '当前组合没有明确的分散收益' : result.issues.includes('insufficient_market_data') ? '这个城市的决策数据待接入' : '这些条件下，暂时没有选择';
  return <section className="decision-loading" role={result.status === 'model_error' ? 'alert' : 'status'}><h1 className="workbench__title">{title}</h1>{result.warnings.map(warning => <p className="decision-note" key={warning}>{warning}</p>)}<div className="decision-actions">{result.status === 'model_error' && <button className="ag-button" onClick={onRetry}>重试</button>}<button className="ag-button" onClick={onEdit}>修改条件</button></div></section>;
}
