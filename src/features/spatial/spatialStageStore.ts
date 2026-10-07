import { create } from 'zustand';

/**
 * 空间舞台状态：一个 Canvas 服务全部路由。
 * 路由只声明"需要哪种空间模式"，相机与几何由场景自己负责。
 *
 * V5 §66：这里不再有 dollyToken。过去"点城市 → 请求一次推近 → 相机停下后才切路由"
 * 需要它来标记那一次请求；现在路由先切，相机由 focusCityId / mode 直接推导，
 * 一次性令牌已无存在必要。
 *
 * 本轮新增 `cameraMoving`：城市 → 省域的退出协调器要等相机真正回到 provinceView
 * 并停稳（§25）。它由 CameraRig 的 setLookAt / onRest 维护，只读消费。
 */
export type SpatialStageMode = 'opening' | 'province' | 'city' | 'none';

interface SpatialStageState {
  mode: SpatialStageMode;
  focusCityId: string | null;
  hoveredCityId: string | null;
  /** 相机是否正在做一次平滑位移（城市推近 / 回到省域）。 */
  cameraMoving: boolean;
  setMode: (mode: SpatialStageMode) => void;
  focusCity: (cityId: string | null) => void;
  setHoveredCity: (cityId: string | null) => void;
  setCameraMoving: (moving: boolean) => void;
  reset: () => void;
}

export const useSpatialStageStore = create<SpatialStageState>((set) => ({
  mode: 'opening',
  focusCityId: null,
  hoveredCityId: null,
  cameraMoving: false,
  setMode: (mode) => set((state) => (state.mode === mode ? state : { mode })),
  focusCity: (focusCityId) => set({ focusCityId }),
  setHoveredCity: (hoveredCityId) => set({ hoveredCityId }),
  setCameraMoving: (cameraMoving) => set((state) => (state.cameraMoving === cameraMoving ? state : { cameraMoving })),
  reset: () => set({ mode: 'opening', focusCityId: null, hoveredCityId: null, cameraMoving: false }),
}));
