import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { readContextFromSearch, useAppContext } from './appContext';
import { selectedCityFromSearch } from './provinceSelection';
import { STUDY_CITY_IDS } from '../../domain/geography/cities';

/** URL only hydrates state. User events own URL writes; there is no reverse effect. */
export function useContextUrlSync(): void {
  const { pathname, search } = useLocation();
  useLayoutEffect(() => {
    const state = useAppContext.getState();
    const parsed = readContextFromSearch(search);
    const pathCity = /^\/cities\/([^/]+)/.exec(pathname)?.[1];
    if (pathname === '/' || pathname === '/liaoning') {
      state.setCity(pathname === '/' ? null : selectedCityFromSearch(search));
      return;
    }
    if (pathCity && (STUDY_CITY_IDS as readonly string[]).includes(pathCity)) state.setCity(pathCity);
    else if (parsed.cityId !== undefined) state.setCity(parsed.cityId);
    if (parsed.crop !== undefined) state.setCrop(parsed.crop);
    if (parsed.horizon !== undefined) state.setHorizon(parsed.horizon);
    if (parsed.asOf !== undefined) state.setAsOf(parsed.asOf);
  }, [pathname, search]);
}
