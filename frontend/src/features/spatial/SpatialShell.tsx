import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { Outlet, useLocation, NavigationType } from 'react-router-dom';
import { isStudyCity } from '../../domain/geography/cities';
import { LiaoningCanvas } from '../liaoning/LiaoningCanvas';
import { useSpatialStageStore, type SpatialStageMode } from './spatialStageStore';
import { usePageNavigate } from '../../app/pageNavigation';
import { RouteTransition } from '../../app/RouteTransition';
import { useAppHistory } from '../../app/appHistory';
import { ROUTES, structuralParent } from '../../app/routes';
import { provinceUrl, selectedCityFromSearch } from '../../app/context/provinceSelection';
import { PAPER_NAVIGATION_EVENT, type PaperNavigationDetail } from '../../app/paperNavigation';
import './spatial-shell.css';

function stageModeForPath(pathname: string, search = ''): SpatialStageMode {
  if (pathname === ROUTES.root) return 'opening';
  if (pathname === ROUTES.liaoning) return 'province';
  if (focusCityForPath(pathname, search)) return 'city';
  return 'none';
}

function focusCityForPath(pathname: string, search = ''): string | null {
  const city = /^\/(?:cities|reports)\/([^/]+)(?:\/|$)/.exec(pathname)?.[1];
  if (city) return isStudyCity(city) ? city : null;
  if (pathname === ROUTES.reports || pathname === ROUTES.researchCenter) {
    const view = new URLSearchParams(search).get('view');
    if (view !== 'cross_city' && view !== 'synthesis') return selectedCityFromSearch(search);
  }
  return null;
}

/** 页面用同一套城市选择逻辑（3D 点击与 DOM 列表共用）。 */
const CitySelectionContext = createContext<(cityId: string) => void>(() => undefined);

export function useCitySelection() {
  return useContext(CitySelectionContext);
}

/** One persistent Canvas follows the route; navigation never waits for paper or camera. */
export function SpatialShell() {
  const location = useLocation();
  const navigate = usePageNavigate();
  const reducedMotion = Boolean(useReducedMotion());
  const mode = stageModeForPath(location.pathname, location.search);
  const focusCityId = mode === 'province' ? selectedCityFromSearch(location.search) : focusCityForPath(location.pathname, location.search);
  const [pending, setPending] = useState<PaperNavigationDetail | null>(null);
  useLayoutEffect(() => {
    const followIntent = (event: Event) => {
      const detail = (event as CustomEvent<PaperNavigationDetail>).detail;
      setPending(current => detail.phase === 'start' ? detail : current?.id === detail.id ? null : current);
    };
    window.addEventListener(PAPER_NAVIGATION_EVENT, followIntent);
    return () => window.removeEventListener(PAPER_NAVIGATION_EVENT, followIntent);
  }, []);
  const destination = pending ? new URL(pending.target, window.location.href) : location;
  const cameraMode = stageModeForPath(destination.pathname, destination.search);
  const cameraCityId = cameraMode === 'province' ? selectedCityFromSearch(destination.search) : focusCityForPath(destination.pathname, destination.search);
  const hoveredCityId = useSpatialStageStore((state) => state.hoveredCityId);
  const setMode = useSpatialStageStore((state) => state.setMode);
  const focusCity = useSpatialStageStore((state) => state.focusCity);
  const setHoveredCity = useSpatialStageStore((state) => state.setHoveredCity);
  const history = useAppHistory();

  useEffect(() => {
    setMode(mode);
    focusCity(focusCityId);
    setHoveredCity(null);
  }, [focusCity, focusCityId, mode, setMode, setHoveredCity]);

  /** Province selection stays on the map; only the six study cities are actionable. */
  const handleSelectCity = useCallback((cityId: string) => {
    if (!isStudyCity(cityId)) return;
    if (mode === 'opening' || mode === 'none') return;
    if (mode === 'province') {
      const target = provinceUrl(cityId);
      if (target !== `${location.pathname}${location.search}`) navigate(target);
      return;
    }
    const target = location.pathname.startsWith('/reports/') ? ROUTES.cityReport(cityId)
      : location.pathname.endsWith('/decision') ? ROUTES.decision(cityId) : ROUTES.city(cityId);
    // 已经在这一页：再 push 一次只会多出一条无意义历史。
    if (location.pathname === target) return;
    navigate(target);
  }, [location.pathname, location.search, mode, navigate]);

  const canvasInteractive = mode !== 'none' && !pending;
  const handleBackgroundClick = useCallback(() => {
    setHoveredCity(null);
    if (mode === 'province') {
      if (focusCityId) navigate(provinceUrl(null));
    } else if (mode === 'city') {
      const parent = structuralParent(location.pathname, location.search);
      if (parent) navigate(parent);
    }
  }, [focusCityId, location.pathname, location.search, mode, navigate, setHoveredCity]);

  return (
    <CitySelectionContext.Provider value={handleSelectCity}>
      <div className="spatial-shell" data-stage-mode={mode}>
        <div className="spatial-shell__canvas" aria-hidden={!canvasInteractive} data-visible data-interactive={canvasInteractive || undefined}>
          <LiaoningCanvas
            mode={cameraMode === 'city' ? 'city' : cameraMode === 'opening' ? 'opening' : 'province'}
            active
            interactive={canvasInteractive}
            focusCityId={cameraCityId}
            hoveredCityId={hoveredCityId}
            onHoverCity={setHoveredCity}
            onSelectCity={handleSelectCity}
            onBackgroundClick={handleBackgroundClick}
            reducedMotion={reducedMotion}
          />
        </div>
        <div className="spatial-shell__dom">
          <RouteTransition
            routeKey={location.key}
            pathname={location.pathname}
            search={location.search}
            direction={history?.direction ?? 0}
            navigationType={history?.action ?? NavigationType.Pop}
          >
            <Outlet />
          </RouteTransition>
        </div>
      </div>
    </CitySelectionContext.Provider>
  );
}
