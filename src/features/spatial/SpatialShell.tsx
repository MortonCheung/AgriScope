import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { Outlet, useLocation, NavigationType } from 'react-router-dom';
import { getCity } from '../../domain/geography/cities';
import { LiaoningCanvas } from '../liaoning/LiaoningCanvas';
import { useSpatialStageStore, type SpatialStageMode } from './spatialStageStore';
import { useCityExitStore } from './cityExit';
import { usePageNavigate } from '../../app/pageNavigation';
import { RouteTransition } from '../../app/RouteTransition';
import { useAppHistory } from '../../app/appHistory';
import { ROUTES } from '../../app/routes';
import './spatial-shell.css';

/** 「省域 → 城市」导航随行携带的转场标记（V5 §65）。 */
export const PROVINCE_TO_CITY = 'province-to-city';
/** 「城市 → 省域」退出时的纸面 fold 标记（本轮 §24/§25）。 */
export const CITY_TO_PROVINCE = 'city-to-province';

/** 城市页纸面展开动画名；`onAnimationEnd` 靠它区分是哪一个动画结束（V5 §67）。 */
const PAPER_UNFOLD_ANIMATION = 'ag-paper-unfold';
/** 城市页纸面收起动画名（本轮 §24）。 */
const PAPER_FOLD_ANIMATION = 'ag-paper-fold';
/** 退出兜底：动画与相机都异常时也不能把用户卡在城市页（§25，只兜底不主导）。 */
const EXIT_FALLBACK_MS = 1200;

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
 *
 * 本轮 §24/§25 补上了**反向**：城市 → 省域不再是"点一下瞬间消失"，
 * 而是一条与进入对称的时间线 ——
 *   纸面 fold + 相机 cityView → provinceView，
 *   两者都结束之后才真正导航。整个过程由 `useCityExitStore` 统一协调，
 *   因此 `×`、`Esc`、应用内 `^` 三个入口走的是同一条路径。
 */
export function SpatialShell() {
  const location = useLocation();
  const navigate = usePageNavigate();
  const reducedMotion = Boolean(useReducedMotion());
  const mode = useSpatialStageStore((state) => state.mode);
  const focusCityId = useSpatialStageStore((state) => state.focusCityId);
  const hoveredCityId = useSpatialStageStore((state) => state.hoveredCityId);
  const cameraMoving = useSpatialStageStore((state) => state.cameraMoving);
  const setMode = useSpatialStageStore((state) => state.setMode);
  const focusCity = useSpatialStageStore((state) => state.focusCity);
  const setHoveredCity = useSpatialStageStore((state) => state.setHoveredCity);
  const history = useAppHistory();

  const exitStatus = useCityExitStore((state) => state.status);
  const exitTarget = useCityExitStore((state) => state.target);
  const exitVia = useCityExitStore((state) => state.via);
  const exitPaperDone = useCityExitStore((state) => state.paperDone);
  const exitCameraDone = useCityExitStore((state) => state.cameraDone);
  const markExitPaperDone = useCityExitStore((state) => state.markPaperDone);
  const markExitCameraDone = useCityExitStore((state) => state.markCameraDone);
  const resetExit = useCityExitStore((state) => state.reset);

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

  const exiting = exitStatus === 'exiting';
  /** 退出期间由外壳接管"有效模式"：路径仍是城市，但空间已经回到省域（§25）。 */
  const effectiveMode: SpatialStageMode = exiting ? 'province' : mode;
  const effectiveFocusCityId = exiting ? null : focusCityId;

  useEffect(() => {
    setMode(pathStage);
    focusCity(focusCityForPath(location.pathname));
  }, [focusCity, location.pathname, pathStage, setMode]);

  /** 相机从移动中回到静止，且这轮退出确实看到过它移动 → 记一次"相机到位（§25）"。 */
  const sawCameraMove = useRef(false);
  useEffect(() => {
    if (!exiting) { sawCameraMove.current = false; return; }
    if (cameraMoving) { sawCameraMove.current = true; return; }
    if (sawCameraMove.current) markExitCameraDone();
  }, [cameraMoving, exiting, markExitCameraDone]);

  /** 兜底：相机/动画任一没给出信号，也不能把用户卡住（§25）。 */
  useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(() => { markExitCameraDone(); markExitPaperDone(); }, EXIT_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [exiting, markExitCameraDone, markExitPaperDone]);

  /** 两个信号都到（或减少动效）→ 才真正离开城市。ref 保证只导航一次（StrictMode 安全）。 */
  const exitNavigated = useRef(false);
  useEffect(() => {
    if (!exiting) return;
    if (!reducedMotion && !(exitPaperDone && exitCameraDone)) return;
    if (exitNavigated.current) return;
    exitNavigated.current = true;
    if (exitVia === 'back') history?.goBack({ to: exitTarget });
    else navigate(exitTarget);
  }, [exiting, exitCameraDone, exitPaperDone, exitTarget, exitVia, history, navigate, reducedMotion]);

  /** 真正离开城市路由后收尾，回到 idle；退出期间一直保持 exiting，避免相机闪回城市。 */
  useEffect(() => {
    if (pathStage === 'city') return;
    if (useCityExitStore.getState().status !== 'exiting') return;
    exitNavigated.current = false;
    resetExit();
  }, [pathStage, resetExit]);

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

  const canvasVisible = effectiveMode !== 'none';
  const domTransition = exiting ? CITY_TO_PROVINCE : paperUnfold ? PROVINCE_TO_CITY : undefined;

  return (
    <CitySelectionContext.Provider value={handleSelectCity}>
      <div className="spatial-shell" data-stage-mode={effectiveMode} data-exiting={exiting || undefined}>
        <div className="spatial-shell__canvas" aria-hidden={!canvasVisible} data-visible={canvasVisible || undefined}>
          <LiaoningCanvas
            mode={effectiveMode === 'city' ? 'city' : effectiveMode === 'opening' ? 'opening' : 'province'}
            focusCityId={effectiveFocusCityId}
            hoveredCityId={hoveredCityId}
            onHoverCity={setHoveredCity}
            onSelectCity={handleSelectCity}
            reducedMotion={reducedMotion}
          />
        </div>
        <div
          className="spatial-shell__dom"
          data-transition={domTransition}
          data-exiting={exiting || undefined}
          onAnimationEnd={(event) => {
            if (event.animationName === PAPER_UNFOLD_ANIMATION) setUnfoldedKey(location.key);
            if (event.animationName === PAPER_FOLD_ANIMATION) markExitPaperDone();
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
