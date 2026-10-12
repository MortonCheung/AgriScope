import { useLocation } from 'react-router-dom';
import { getCity, STUDY_CITY_IDS } from '../../domain/geography/cities';
import { cityEntry, useRuntimeCatalog } from '../../domain/research/runtime/catalog';
import { ROUTES } from '../../app/routes';
import { cityContextUrl } from '../../app/context/provinceSelection';
import { TransitionLink } from '../../app/pageNavigation';
import './reports.css';

/** Both the report workspace and its directory use the same published entrances. */
export function ReportNavigation({ close, label = '报告范围', className = '' }: { close?: () => void; label?: string; className?: string }) {
  const state = useRuntimeCatalog();
  const location = useLocation();
  const catalog = state.status === 'ready' ? state.catalog : null;
  const available = (city: string, id: string) => Boolean(catalog && cityEntry(catalog, city)?.modules.some(module => module.module_id === id));
  const view = new URLSearchParams(location.search).get('view');
  const supplements = [
    { name: '辽宁综合报告', to: ROUTES.provinceReport, available: available('cross_city', 'A11'), active: location.pathname === ROUTES.provinceReport },
    { name: '六城比较', to: `${ROUTES.reports}?view=cross_city`, available: available('cross_city', 'A10'), active: view === 'cross_city' },
    { name: '综合研究', to: `${ROUTES.reports}?view=synthesis`, available: available('cross_city', 'A11'), active: view === 'synthesis' },
    { name: '方法与来源', to: `${ROUTES.about}#methods`, available: true, active: location.pathname === ROUTES.about },
  ];
  return <nav className={`report-navigation ${className}`} aria-label={label}>
    <ul className="report-navigation__cities">{STUDY_CITY_IDS.map(id => <li key={id}>
      {available(id, 'A09') ? <TransitionLink className="ag-button" to={cityContextUrl(ROUTES.cityReport(id), id)} aria-current={location.pathname === ROUTES.cityReport(id) ? 'page' : undefined} onClick={close}>{getCity(id)!.shortName}</TransitionLink>
        : <button type="button" className="ag-button" disabled>{getCity(id)!.shortName}</button>}
    </li>)}</ul>
    <ul className="report-navigation__supplement">{supplements.map(entry => <li key={entry.name}>
      {entry.available ? <TransitionLink className="ag-button" to={entry.to} aria-current={entry.active ? 'page' : undefined} onClick={close}>{entry.name}</TransitionLink>
        : <button type="button" className="ag-button" disabled>{entry.name}</button>}
    </li>)}</ul>
  </nav>;
}
