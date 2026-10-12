import { createContext, useCallback, useContext, useEffect } from 'react';
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
import './spatial-shell.css';

function stageModeForPath(pathname: string): SpatialStageMode {
  if (pathname === ROUTES.root) return 'opening';
  if (pathname === ROUTES.liaoning) return 'province';
  if (focusCityForPath(pathname)) return 'city';
  return 'none';
}

function focusCityForPath(pathname: string): string | null {
  const city = /^\/(?:cities|reports)\/([^/]+)(?:\/|$)/.exec(pathname)?.[1];
  return city && isStudyCity(city) ? city : null;
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
  const mode = stageModeForPath(location.pathname);
  const focusCityId = mode === 'province' ? selectedCityFromSearch(location.search) : focusCityForPath(location.pathname);
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
    if (mode === 'opening') return;
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

  const canvasVisible = mode !== 'none';
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
        <div className="spatial-shell__canvas" aria-hidden={!canvasVisible} data-visible={canvasVisible || undefined}>
          <LiaoningCanvas
            mode={mode === 'city' ? 'city' : mode === 'opening' ? 'opening' : 'province'}
            active={canvasVisible}
            focusCityId={focusCityId}
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
