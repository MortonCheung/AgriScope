import type { Location } from 'react-router-dom';
import { STUDY_CITY_IDS } from '../../domain/geography/cities';
import { ROUTES, canonicalResearchId, parseCityPath, parseResearchPath } from '../routes';
import { readContextFromSearch, useAppContext, writeContextToSearch, type AppContextState } from './appContext';
import { provinceUrl, selectedCityFromSearch } from './provinceSelection';

type NavigationLocation = Pick<Location, 'pathname' | 'search'>;
type ContextValues = Pick<AppContextState, 'cityId' | 'crop' | 'horizon' | 'asOf'>;
export type PrimaryNavigation = 'home' | 'decision' | 'reports' | 'about';
const REPORT_MEMORY_KEY = 'agriscope.report-locations.v4-final';
const knownCity = (value: string | null | undefined): value is string => Boolean(value && (STUDY_CITY_IDS as readonly string[]).includes(value));

/** Path and explicit map selection take precedence over a previous page's context. */
export function navigationContext(location: NavigationLocation, context: ContextValues = useAppContext.getState()): ContextValues {
  const parsed = readContextFromSearch(location.search);
  const pathCity = /^\/(?:cities|reports)\/([^/]+)(?:\/|$)/.exec(location.pathname)?.[1];
  const cityId = location.pathname === '/' ? null
    : location.pathname === ROUTES.liaoning ? selectedCityFromSearch(location.search)
      : pathCity && pathCity !== 'liaoning' ? knownCity(pathCity) ? pathCity : null
        : parsed.cityId ?? context.cityId;
  return { cityId, crop: parsed.crop ?? context.crop, horizon: parsed.horizon ?? context.horizon, asOf: parsed.asOf ?? context.asOf };
}

function validReportLocation(cityId: string, value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 500 || !value.startsWith('/')) return false;
  const [pathname] = value.split(/[?#]/, 1);
  if (parseCityPath(pathname) === cityId) return true;
  const research = parseResearchPath(pathname);
  return research?.cityId === cityId && /^A[1-9](?:\.\d{1,2})?$/.test(canonicalResearchId(research.researchId));
}

function reportLocations(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(REPORT_MEMORY_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([city, value]) => knownCity(city) && validReportLocation(city, value))) as Record<string, string>;
  } catch { return {}; }
}

/** Only research positioning is remembered; decision view/plan never leaks into reports. */
export function rememberReportLocation(location: NavigationLocation): void {
  const research = parseResearchPath(location.pathname);
  const cityId = research?.cityId ?? parseCityPath(location.pathname);
  if (!knownCity(cityId)) return;
  const pathname = research ? ROUTES.research(cityId, canonicalResearchId(research.researchId)) : ROUTES.city(cityId);
  const search = new URLSearchParams(location.search);
  const positioning = new URLSearchParams();
  const selected = search.get('research');
  if (!research && selected && /^A[1-9](?:\.\d{1,2})?$/.test(canonicalResearchId(selected))) positioning.set('research', canonicalResearchId(selected));
  if (search.get('mode') === 'article') positioning.set('mode', 'article');
  const value = `${pathname}${positioning.size ? `?${positioning}` : ''}`;
  if (!validReportLocation(cityId, value)) return;
  try { window.sessionStorage.setItem(REPORT_MEMORY_KEY, JSON.stringify({ ...reportLocations(), [cityId]: value })); } catch { /* In-memory context still works when storage is unavailable. */ }
}

export function primaryNavigationTarget(kind: PrimaryNavigation, location: NavigationLocation, context: ContextValues = useAppContext.getState()): string {
  const current = navigationContext(location, context);
  if (kind === 'home') return provinceUrl(current.cityId);
  if (kind === 'about') return ROUTES.about;
  if (kind === 'reports') return current.cityId ? `${ROUTES.researchCenter}?${writeContextToSearch('', current)}` : ROUTES.researchCenter;
  if (!current.cityId) return kind === 'decision' ? ROUTES.decisionCenter : ROUTES.researchCenter;
  if (kind === 'decision') return `${ROUTES.decision(current.cityId)}?${writeContextToSearch('', current)}`;
  return ROUTES.decisionCenter;
}
