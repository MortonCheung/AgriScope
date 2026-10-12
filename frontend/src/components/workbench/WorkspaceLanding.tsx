import type { ReactNode } from 'react';
import type { LinkProps } from 'react-router-dom';
import { TransitionLink } from '../../app/pageNavigation';
import { STUDY_CITY_IDS, getCity } from '../../domain/geography/cities';
import { AnimatedUnderline } from '../AnimatedUnderline';
import './workspace-landing.css';

export function WorkspaceLanding({ title, children, secondary, className = '' }: {
  title: string; children: ReactNode; secondary?: ReactNode; className?: string;
}) {
  return <section className={`workspace-landing ${className}`}>
    <h1 className="workspace-landing__title">{title}</h1>
    {children}
    {secondary && <div className="workspace-landing__secondary">{secondary}</div>}
  </section>;
}

export function WorkspaceLink({ children, className = '', ...props }: LinkProps) {
  return <TransitionLink {...props} className={`workspace-choice ${className}`}>
    {children}<AnimatedUnderline active={props['aria-current'] === 'page'}/>
  </TransitionLink>;
}

export function CityWorkspaceSelector({ buildHref, selectedCityId, available = () => true, close, className = '' }: {
  buildHref: (cityId: string) => string; selectedCityId?: string;
  available?: (cityId: string) => boolean; close?: () => void; className?: string;
}) {
  return <ul className={`workspace-city-selector ${className}`}>{STUDY_CITY_IDS.map(id => <li key={id}>
    {available(id) ? <WorkspaceLink to={buildHref(id)} aria-current={id === selectedCityId ? 'page' : undefined} onClick={close}>{getCity(id)!.shortName}</WorkspaceLink>
      : <button type="button" className="workspace-choice" disabled>{getCity(id)!.shortName}</button>}
  </li>)}</ul>;
}
