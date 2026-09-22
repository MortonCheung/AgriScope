import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { Outlet, useLocation, NavigationType } from 'react-router-dom';
import { getCity } from '../../domain/geography/cities';
import { LiaoningCanvas } from '../liaoning/LiaoningCanvas';
import { useSpatialStageStore, type SpatialStageMode } from './spatialStageStore';
import { usePageNavigate } from '../../app/pageNavigation';
import { RouteTransition } from '../../app/RouteTransition';
import { useAppHistory } from '../../app/appHistory';
import { ROUTES } from '../../app/routes';
import './spatial-shell.css';

function stageModeForPath(pathname: string): SpatialStageMode {
  if (pathname === ROUTES.root) return 'opening';
  if (pathname === ROUTES.liaoning) return 'province';
  const match = /^\/cities\/([^/]+)\/?$/.exec(pathname);
  if (match) return 'city';
  return 'none';
}

function focusCityForPath(pathname: string): string | null {
  const match = /^\/cities\/([^/]+)/.exec(pathname);
  return match ? match[1] : null;
}

/** 页面用同一套城市选择逻辑（3D 点击与 DOM 列表共用）。 */
const CitySelectionContext = createContext<(cityId: string) => void>(() => undefined);

export function useCitySelection() {
  return useContext(CitySelectionContext);
}

/**
 * 空间外壳：一个 WebGL Canvas 服务全部路由，DOM 层在其上承载页面。
 * 从省域进入城市时由这里统一发起相机推近，避免出现"点击 → 白屏 → 新页面"。
 */
export function SpatialShell() {
  const location = useLocation();
  const navigate = usePageNavigate();
  const reducedMotion = Boolean(useReducedMotion());
  const mode = useSpatialStageStore((state) => state.mode);
  const focusCityId = useSpatialStageStore((state) => state.focusCityId);
  const hoveredCityId = useSpatialStageStore((state) => state.hoveredCityId);
  const dollyToken = useSpatialStageStore((state) => state.dollyToken);
  const setMode = useSpatialStageStore((state) => state.setMode);
  const focusCity = useSpatialStageStore((state) => state.focusCity);
  const setHoveredCity = useSpatialStageStore((state) => state.setHoveredCity);
  const requestDolly = useSpatialStageStore((state) => state.requestDolly);
  const history = useAppHistory();
  const [notice, setNotice] = useState<string | null>(null);

  const pathStage = useMemo(() => stageModeForPath(location.pathname), [location.pathname]);

  useEffect(() => {
    setMode(pathStage);
    focusCity(focusCityForPath(location.pathname));
  }, [focusCity, location.pathname, pathStage, setMode]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const handleSelectCity = useCallback((cityId: string) => {
    const city = getCity(cityId);
    if (!city) return;
    if (!city.hasResearch) {
      setNotice(`${city.shortName}的研究尚未开放，当前完整样板为沈阳`);
      return;
    }
    requestDolly(cityId);
    const delay = reducedMotion ? 0 : 760;
    window.setTimeout(() => navigate(ROUTES.city(cityId)), delay);
  }, [navigate, reducedMotion, requestDolly]);

  const canvasVisible = mode !== 'none';

  return (
    <CitySelectionContext.Provider value={handleSelectCity}>
      <div className="spatial-shell" data-stage-mode={mode}>
        <div className="spatial-shell__canvas" aria-hidden={!canvasVisible} data-visible={canvasVisible || undefined}>
          <LiaoningCanvas
            mode={mode === 'city' ? 'city' : mode === 'opening' ? 'opening' : 'province'}
            focusCityId={focusCityId}
            hoveredCityId={hoveredCityId}
            dollyToken={dollyToken}
            onHoverCity={setHoveredCity}
            onSelectCity={handleSelectCity}
            reducedMotion={reducedMotion}
          />
        </div>
        <div className="spatial-shell__dom">
          <RouteTransition
            routeKey={location.key}
            direction={history?.direction ?? 0}
            navigationType={history?.action ?? NavigationType.Pop}
          >
            <Outlet />
          </RouteTransition>
        </div>
        {notice && <div className="spatial-notice" role="status">{notice}</div>}
      </div>
    </CitySelectionContext.Provider>
  );
}
