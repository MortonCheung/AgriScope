import { useEffect } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { TransitionLink, usePageNavigate } from '../../app/pageNavigation';
import { provinceUrl } from '../../app/context/provinceSelection';
import { WorkbenchLayout } from '../../components/workbench/WorkbenchLayout';
import { ROUTES, structuralParent } from '../../app/routes';
import { STUDY_CITY_IDS, getCity, isStudyCity } from '../../domain/geography/cities';
import { PlanningWorkbench } from './PlanningWorkbench';
import { WorkspaceLink } from '../../components/workbench/WorkspaceLanding';
import './decision.css';

/** One live workbench; historical module URLs keep their city/condition context. */
export function DecisionPage() {
  const { cityId = '' } = useParams();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const navigate = usePageNavigate();
  useEffect(() => {
    if (!params.has('view') && !params.has('plan') && !params.has('test_state')) return;
    setParams(previous => { const next = new URLSearchParams(previous); next.delete('view'); next.delete('plan'); next.delete('test_state'); return next; }, { replace: true });
  }, [params, setParams]);
  if (!isStudyCity(cityId)) return <main className="decision"><h1 className="ag-section-title">选择城市</h1><TransitionLink to={ROUTES.liaoning} className="ag-button">返回首页</TransitionLink></main>;
  return <WorkbenchLayout className="decision-workbench decision-workbench--live" railMode="persistent" resetKey={cityId} contentKey={cityId} sidebarLabel="城市" railLabel="实时结果" onEscape={() => navigate(structuralParent(location.pathname, location.search) ?? provinceUrl(cityId))}
    sidebar={close => <nav aria-label="决策城市"><ol className="workbench__menu">{STUDY_CITY_IDS.map(id => <li key={id}><WorkspaceLink to={`${ROUTES.decision(id)}?city=${id}`} aria-current={id === cityId ? 'page' : undefined} onClick={() => close()}>{getCity(id)?.shortName}</WorkspaceLink></li>)}</ol></nav>}
  ><PlanningWorkbench cityId={cityId}/></WorkbenchLayout>;
}
