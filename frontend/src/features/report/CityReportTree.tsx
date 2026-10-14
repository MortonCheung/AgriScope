import { useEffect, useId, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ROUTES } from '../../app/routes';
import { cityContextUrl } from '../../app/context/provinceSelection';
import { readContextFromSearch } from '../../app/context/appContext';
import { usePageNavigate } from '../../app/pageNavigation';
import { STUDY_CITY_IDS, getCity } from '../../domain/geography/cities';
import { canonicalPresentationId, presentedModules, presentedTopics } from '../../domain/research/presentation';
import type { V2Catalog } from '../../domain/research/v2/types';
import { ResearchTree } from '../research-v2/ResearchTree';
import { MOTION_DURATION, MOTION_EASE } from '../../design/motion';
import { SelectionGroup } from '../../components/controls/SelectionGroup';

/** Cities disclose their real research; only selecting a topic or point navigates. */
export function CityReportTree({ catalog, close }: { catalog: V2Catalog | null; close?: () => void }) {
  const location = useLocation();
  const navigate = usePageNavigate();
  const id = useId();
  const reducedMotion = Boolean(useReducedMotion());
  const selectedCity = /^\/reports\/([^/]+)\/?$/.exec(location.pathname)?.[1];
  const selection = new URLSearchParams(location.search).get('research') ?? catalog?.cities.find(city => city.city === selectedCity)?.presentation?.default_selection_id;
  const [opened, setOpened] = useState<string[]>(selectedCity ? [selectedCity] : []);
  useEffect(() => {
    if (selectedCity) setOpened(previous => previous.includes(selectedCity) ? previous : [...previous, selectedCity]);
  }, [selectedCity]);
  const select = (cityId: string, researchId: string) => {
    const base = ROUTES.cityReport(cityId);
    const params = new URLSearchParams(cityContextUrl(base, cityId).split('?')[1]);
    const context = readContextFromSearch(location.search);
    if (context.crop) params.set('crop', context.crop);
    if (context.asOf) params.set('as_of', context.asOf);
    if (context.horizon) params.set('horizon', String(context.horizon));
    params.set('research', canonicalPresentationId(researchId));
    void navigate(`${base}?${params}`);
    close?.();
  };
  return <SelectionGroup as="ul" className="report-navigation__cities city-report-tree" value={selectedCity}>
    {STUDY_CITY_IDS.map(cityId => {
      const modules = presentedModules(catalog, cityId);
      const topics = presentedTopics(catalog, cityId);
      const expanded = opened.includes(cityId);
      const panelId = `${id}-${cityId}`;
      return <li className="city-report-tree__city" key={cityId} data-current={cityId === selectedCity || undefined}>
        <button className="city-report-tree__toggle" type="button" data-selection-value={cityId} disabled={!modules.length} aria-expanded={expanded} aria-controls={panelId}
          onClick={() => setOpened(previous => previous.includes(cityId) ? previous.filter(city => city !== cityId) : [...previous, cityId])}>
          <span>{getCity(cityId)?.shortName}</span><svg className="city-report-tree__chevron" aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25"><path d="m4 6 4 4 4-4"/></svg>
        </button>
        <motion.div id={panelId} className="city-report-tree__panel" aria-hidden={!expanded} inert={!expanded}
          initial={false} animate={{ height: expanded ? 'auto' : 0, opacity: expanded ? 1 : 0, clipPath: expanded ? 'inset(0 0 0% 0)' : 'inset(0 0 100% 0)' }}
          transition={{ duration: reducedMotion ? 0 : MOTION_DURATION.normal, ease: MOTION_EASE.out }}>
          <SelectionGroup className="city-report-tree__content" value={cityId === selectedCity ? selection : undefined}>
          {topics.length > 0 && <ResearchTree cityId={cityId} topics={topics} variant="picker" animatedSelection externalSelectionSurface selectedId={cityId === selectedCity ? selection ?? undefined : undefined} onSelect={researchId => select(cityId, researchId)}/>}
          <ol className="module-workspace__list">{modules.filter(module => !topics.some(topic => topic.id === canonicalPresentationId(module.module_id))).map(module =>
            <li key={module.module_id}><button type="button" className="module-workspace__item" data-selection-value={canonicalPresentationId(module.module_id)} aria-current={cityId === selectedCity && canonicalPresentationId(module.module_id) === selection ? 'page' : undefined} data-selected={cityId === selectedCity && canonicalPresentationId(module.module_id) === selection || undefined} onClick={() => select(cityId, module.module_id)}>{module.title}</button></li>)}</ol>
          </SelectionGroup>
        </motion.div>
      </li>;
    })}
  </SelectionGroup>;
}
