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

/** 「省域 → 城市」导航随行携带的转场标记（V5 §65）。 */
export const PROVINCE_TO_CITY = 'province-to-city';

/** 城市页纸面展开动画名；`onAnimationEnd` 靠它区分是哪一个动画结束（V5 §67）。 */
const PAPER_UNFOLD_ANIMATION = 'ag-paper-unfold';

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
 *
 * V5 §65/§66：进入城市**先导航**，然后相机与纸面同时动画。
 * 相机不再控制路由提交 —— 那正是"点击 → 等相机 → 白屏 → 新页面"的生硬来源。
 * 因此这里没有 pendingCityId、没有 onCameraRest、也没有超时兜底：
 * 路由在点击那一帧就切好，Cursor Dolly 由路由推导出的 focusCity 触发。
 */
export function SpatialShell() {
  const location = useLocation();
  const navigate = usePageNavigate();
  const reducedMotion = Boolean(useReducedMotion());
  const mode = useSpatialStageStore((state) => state.mode);
  const focusCityId = useSpatialStageStore((state) => state.focusCityId);
  const hoveredCityId = useSpatialStageStore((state) => state.hoveredCityId);
  const setMode = useSpatialStageStore((state) => state.setMode);
  const focusCity = useSpatialStageStore((state) => state.focusCity);
  const setHoveredCity = useSpatialStageStore((state) => state.setHoveredCity);
  const history = useAppHistory();

  /**
   * 正在播放的「纸面展开」（V5 §67–§69）。
   *
   * 不放进 effect：effect 晚于首帧提交，会先无裁切地画一帧再突然收起，看起来像闪一下。
   * 这里直接从 location.state + reducedMotion 同步推导，并且只在**这一次导航**
   * （location.key）上生效；动画结束把自己记下来，因此回退（POP）回到同一条历史
   * 记录时不会重播。
   */
  const [unfoldedKey, setUnfoldedKey] = useState<string | null>(null);
  const navigationState = location.state as { transition?: string } | null;
  const unfoldRequested = navigationState?.transition === PROVINCE_TO_CITY && !reducedMotion;
  const paperUnfold = unfoldRequested && unfoldedKey !== location.key;

  const pathStage = useMemo(() => stageModeForPath(location.pathname), [location.pathname]);

  useEffect(() => {
    setMode(pathStage);
    focusCity(focusCityForPath(location.pathname));
  }, [focusCity, location.pathname, pathStage, setMode]);

  /**
   * 六个城市一律可进入（V4 §十七）：路由立刻切换，相机与纸面随后同时动画。
   * 没有研究数据的城市同样进入 `/cities/:cityId`，由页面自己说明「研究内容待接入」，
   * 而不是静默 return —— 那会让点击看起来毫无反应。
   */
  const handleSelectCity = useCallback((cityId: string) => {
    if (!getCity(cityId)) return;
    const target = ROUTES.city(cityId);
    // 已经在这一页：再 push 一次只会多出一条无意义历史。
    if (location.pathname === target) return;
    navigate(target, { state: { transition: PROVINCE_TO_CITY } });
  }, [location.pathname, navigate]);

  const canvasVisible = mode !== 'none';

  return (
    <CitySelectionContext.Provider value={handleSelectCity}>
      <div className="spatial-shell" data-stage-mode={mode}>
        <div className="spatial-shell__canvas" aria-hidden={!canvasVisible} data-visible={canvasVisible || undefined}>
          <LiaoningCanvas
            mode={mode === 'city' ? 'city' : mode === 'opening' ? 'opening' : 'province'}
            focusCityId={focusCityId}
            hoveredCityId={hoveredCityId}
            onHoverCity={setHoveredCity}
            onSelectCity={handleSelectCity}
            reducedMotion={reducedMotion}
          />
        </div>
        <div
          className="spatial-shell__dom"
          data-transition={paperUnfold ? PROVINCE_TO_CITY : undefined}
          onAnimationEnd={(event) => {
            if (event.animationName === PAPER_UNFOLD_ANIMATION) setUnfoldedKey(location.key);
          }}
        >
          <RouteTransition
            routeKey={location.key}
            pathname={location.pathname}
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
