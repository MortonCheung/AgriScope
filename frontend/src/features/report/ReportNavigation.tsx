import { useLocation } from 'react-router-dom';
import { useRuntimeCatalog } from '../../domain/research/runtime/catalog';
import { ROUTES } from '../../app/routes';
import { WorkspaceLink } from '../../components/workbench/WorkspaceLanding';
import { CityReportTree } from './CityReportTree';
import { presentedModules } from '../../domain/research/presentation';
import './reports.css';

/** Both the report workspace and its directory use the same published entrances. */
export function ReportNavigation({ close, label = '报告范围', className = '' }: { close?: () => void; label?: string; className?: string }) {
  const state = useRuntimeCatalog();
  const location = useLocation();
  const catalog = state.status === 'ready' ? state.catalog : null;
  const available = (city: string, id: string) => presentedModules(catalog, city).some(module => module.module_id === id);
  const view = new URLSearchParams(location.search).get('view');
  const supplements = [
    { name: '综合报告', to: ROUTES.provinceReport, available: available('cross_city', 'A11'), active: location.pathname === ROUTES.provinceReport },
    { name: '六城比较', to: `${ROUTES.reports}?view=cross_city`, available: available('cross_city', 'A10'), active: view === 'cross_city' },
    { name: '综合研究', to: `${ROUTES.reports}?view=synthesis`, available: available('cross_city', 'A11'), active: view === 'synthesis' },
    { name: '方法与来源', to: `${ROUTES.about}#methods`, available: true, active: location.pathname === ROUTES.about },
  ];
  return <nav className={`report-navigation ${className}`} aria-label={label}>
    <CityReportTree catalog={catalog} close={close}/>
    <ul className="report-navigation__supplement">{supplements.map(entry => <li key={entry.name}>
      {entry.available ? <WorkspaceLink to={entry.to} aria-current={entry.active ? 'page' : undefined} onClick={close}>{entry.name}</WorkspaceLink>
        : <button type="button" className="workspace-choice" disabled>{entry.name}</button>}
    </li>)}</ul>

  </nav>;
}
