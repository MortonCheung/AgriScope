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
import { MOTION_DURATION } from '../../design/motion';
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
  /**
   * 已经选定、正在推近的城市。
   * 非空时表示"相机正在为这个城市移动"，移动结束（onCameraRest）后才切换路由。
   * 普通拖动地图时它始终为空，因此绝不会触发导航。
   */
  const [pendingCityId, setPendingCityId] = useState<string | null>(null);

  const pathStage = useMemo(() => stageModeForPath(location.pathname), [location.pathname]);

  useEffect(() => {
    setMode(pathStage);
    focusCity(focusCityForPath(location.pathname));
    // 路由已经变化（无论由谁发起）：放弃未完成的推近意图，避免"回退后又被相机带走"。
    setPendingCityId(null);
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
      setNotice(`${city.shortName}研究尚未接入`);
      return;
    }
    if (reducedMotion) {
      navigate(ROUTES.city(cityId));
      return;
    }
    // 相机已经在同一城市：没有可播放的空间移动，直接进入。
    if (focusCityId === cityId) {
      navigate(ROUTES.city(cityId));
      return;
    }
    setPendingCityId(cityId);
    requestDolly(cityId);
  }, [focusCityId, navigate, reducedMotion, requestDolly]);

  const handleCameraRest = useCallback(() => {
    if (!pendingCityId) return;
    const cityId = pendingCityId;
    setPendingCityId(null);
    navigate(ROUTES.city(cityId));
  }, [navigate, pendingCityId]);

  // 异常兜底：相机若因故没有报告 rest，也不能让用户卡在省域页。
  // 上限刻意取得比任何正常转场都长，因此它只在"rest 真的没来"时才会生效。
  useEffect(() => {
    if (!pendingCityId) return;
    const bound = MOTION_DURATION.camera * 2.5 * 1000;
    const timer = window.setTimeout(() => {
      setPendingCityId((current) => {
        if (current) navigate(ROUTES.city(current));
        return null;
      });
    }, bound);
    return () => window.clearTimeout(timer);
  }, [navigate, pendingCityId]);

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
            onCameraRest={handleCameraRest}
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
