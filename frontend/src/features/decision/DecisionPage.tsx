import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { TransitionLink, usePageNavigate } from '../../app/pageNavigation';
import { provinceUrl } from '../../app/context/provinceSelection';
import { WorkbenchLayout, WorkbenchMain, WorkbenchRail } from '../../components/workbench/WorkbenchLayout';
import { PlanningWorkbench } from './PlanningWorkbench';
import { ROUTES, structuralParent } from '../../app/routes';
import { getCity } from '../../domain/geography/cities';
import { getDecisionProvider } from '../../providers/decision';
import { useDecisionSession } from '../../services/useDecisionSession';
import { DecisionInput } from './DecisionInput';
import { DecisionDetail, DecisionEvidence, DecisionResultRail, DecisionSummary } from './DecisionResultView';
import { DecisionCompare } from './DecisionCompare';
import { formatNumber } from './DecisionVisuals';
import { evaluationLabel } from './presentation';
import { LongHorizonPlanning } from '../longHorizon/LongHorizonPlanning';
import { DecisionCenter } from './DecisionCenter';
import { useMarketObservation } from './useMarketObservation';
import type { DecisionCapability, DecisionResult, Strategy } from '../../domain/decision/types';
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
  const [marketCrop, setMarketCrop] = useState<{ cityId: string; crop?: string }>({ cityId });
  const market = useMarketObservation(cityId, marketCrop.cityId === cityId ? marketCrop.crop : undefined);
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
  const session = useDecisionSession(cityId, provider, testState, priceSupported && ['result', 'detail', 'compare', 'evidence'].includes(view));
  const { state } = session;
  const main = useRef<HTMLElement>(null);
  const switchView = (next: string, replace = false) => setParams(previous => { const nextParams = new URLSearchParams(previous); nextParams.set('view', next); if (next === 'planning') nextParams.delete('plan'); return nextParams; }, { replace });
  const edit = () => switchView('input');
  const unsupportedModel = (Boolean(cap) || Boolean(capError)) && !explicitDemo && ((module === 'input' && !priceSupported) || (module === 'long-horizon' && !longSupported));
  useEffect(() => {
    if (unsupportedModel || (module === 'center' && marketAvailable === false)) {
      setParams(previous => { const next = new URLSearchParams(previous); next.set('view', 'planning'); next.delete('plan'); return next; }, { replace: true });
    }
  }, [marketAvailable, module, setParams, unsupportedModel]);
  const result = state.result;
  const candidate = result?.candidates.find(item => item.id === params.get('plan')) ?? result?.candidates.find(item => item.id === result.recommendation.candidate_id) ?? result?.candidates[0];
  const choose = (id: string) => setParams(previous => { const next = new URLSearchParams(previous); next.set('plan', id); next.set('view', 'result'); return next; });
  useEffect(() => {
    if (!state.request || state.status === 'loading') return;
    const heading = main.current?.querySelector<HTMLElement>('h1');
    heading?.setAttribute('tabindex', '-1'); heading?.focus({ preventScroll: true });
  }, [candidate?.id, state.request, state.status, view]);
  if (!city) return <main className="decision"><h1 className="ag-section-title">城市入口不存在</h1><TransitionLink to={ROUTES.liaoning} className="ag-button">返回辽宁</TransitionLink></main>;

  const shortSubmit = (request: Parameters<typeof session.run>[0]) => { setParams(previous => { const next = new URLSearchParams(previous); next.set('view', 'result'); next.delete('plan'); return next; }); void session.run(request); };
  const activeModule = unsupportedModel || (module === 'center' && marketAvailable === false) ? 'planning' : module;
  let content;
  if (activeModule === 'planning') content = <PlanningWorkbench cityId={cityId} />;
  else if (activeModule === 'center') content = <DecisionCenter cityId={cityId} observation={market} onCrop={crop => setMarketCrop({ cityId, crop })} onPlanning={() => switchView('planning')} />;
  else if (!cap && !explicitDemo) content = <><WorkbenchMain><h1 className="workbench__title">确认模型能力</h1><p role="status">{capError ?? '读取本城模型能力…'}</p><button type="button" className="ag-button" onClick={() => setCapAttempt(value => value + 1)}>重试能力读取</button></WorkbenchMain><WorkbenchRail><p className="decision-note">经营计划可独立完成公式核算。</p></WorkbenchRail></>;
  else if (activeModule === 'long-horizon') content = <LongHorizonPlanning key={cityId} cityId={cityId} />;
  else if (view === 'input' || (!result && state.status === 'idle')) content = <DecisionInput key={cityId} cityId={cityId} provider={provider} expandInputs={result?.status === 'user_input_required' || result?.issues.includes('user_input_required')} initial={session.savedRequest} onSubmit={shortSubmit} />;
  else if (state.status === 'loading') content = <><WorkbenchMain><section className="decision-loading" role="status" aria-label="方案比较中" aria-busy="true"><h1 className="workbench__title">比较当前条件</h1><div className="ag-state ag-state--loading" aria-hidden="true"><i className="ag-skeleton" /><i className="ag-skeleton" /></div><button className="ag-button" onClick={() => { session.cancel(); edit(); }}>返回修改条件</button></section></WorkbenchMain><WorkbenchRail><p className="decision-note">等待本城模型结果。</p></WorkbenchRail></>;
  else if (state.status === 'error') content = <><WorkbenchMain><section role="alert"><h1 className="workbench__title">暂时没能完成比较</h1><p>{state.error}</p><div className="decision-actions"><button className="ag-button" onClick={() => { if (state.request) void session.run(state.request); }}>重试</button><button className="ag-button" onClick={edit}>修改条件</button></div></section></WorkbenchMain><WorkbenchRail><p className="decision-note">连接恢复后显示模型真实结果。</p></WorkbenchRail></>;
  else if (result && candidate && result.status === 'ok') content = <>
    <WorkbenchMain label="短期比较结果">
      <div className="decision-toolbar"><p className="decision-toolbar__context">{formatNumber(result.request.user_context.area_mu)} 亩 · 预算 {formatNumber(result.request.user_context.budget_cny / 10000)} 万元</p><label className="decision-toolbar__select">种植方向<select aria-label="种植方向" value={candidate.id} onChange={event => choose(event.target.value)}>{result.candidates.map(item => <option key={item.id} value={item.id}>{item.crop} · {item.strategies.map(strategy => strategyNames[strategy]).join(' / ')} · {evaluationLabel(item)}</option>)}</select></label><button className="decision-text-button" onClick={edit}>修改条件</button></div>
      <nav className="decision-modes" aria-label="方案阅读方式">{[['result', '方案'], ['detail', '收益与风险'], ['compare', '比较'], ['evidence', '依据']].map(([id, label]) => <button key={id} aria-pressed={view === id} onClick={() => switchView(id)}>{label}</button>)}</nav>
      {view === 'detail' ? <DecisionDetail candidate={candidate} result={result} /> : view === 'compare' ? <DecisionCompare result={result} initialId={candidate.id} onChoose={choose} /> : view === 'evidence' ? <DecisionEvidence candidate={candidate} result={result} /> : <DecisionSummary result={result} candidate={candidate} onDetail={() => switchView('detail')} onCompare={() => switchView('compare')} onEvidence={() => switchView('evidence')} stressUrl={`${ROUTES.scenario}?${new URLSearchParams({ mode: 'decision', city: cityId, plan: candidate.id, ...(testState ? { test_state: testState } : {}) })}`} />}
    </WorkbenchMain>
    <WorkbenchRail><p className="ag-label">{city.shortName} · {result.data_status === 'legacy_model_fixture' ? '旧模型历史样例' : result.data_status === 'mock' ? '演示情景' : '模型情景'}</p><DecisionResultRail result={result} candidate={candidate} /></WorkbenchRail>
  </>;
  else if (result) content = <><WorkbenchMain><DecisionUnavailable result={result} onEdit={edit} onRetry={() => { if (state.request) void session.run(state.request); }} /></WorkbenchMain><WorkbenchRail><p className="decision-note">没有可展示的有效模型方案。</p></WorkbenchRail></>;
  else content = <DecisionInput key={cityId} cityId={cityId} provider={provider} initial={session.savedRequest} onSubmit={shortSubmit} />;

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
