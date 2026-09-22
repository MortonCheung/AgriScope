import { create } from 'zustand';

/**
 * 空间舞台状态：一个 Canvas 服务全部路由。
 * 路由只声明"需要哪种空间模式"，相机与几何由场景自己负责。
 *
 * V5 §66：这里不再有 dollyToken。过去"点城市 → 请求一次推近 → 相机停下后才切路由"
 * 需要它来标记那一次请求；现在路由先切，相机由 focusCityId / mode 直接推导，
 * 一次性令牌已无存在必要。
 */
export type SpatialStageMode = 'opening' | 'province' | 'city' | 'none';

interface SpatialStageState {
  mode: SpatialStageMode;
  focusCityId: string | null;
  hoveredCityId: string | null;
  setMode: (mode: SpatialStageMode) => void;
  focusCity: (cityId: string | null) => void;
  setHoveredCity: (cityId: string | null) => void;
  reset: () => void;
}

export const useSpatialStageStore = create<SpatialStageState>((set) => ({
  mode: 'opening',
  focusCityId: null,
  hoveredCityId: null,
  setMode: (mode) => set((state) => (state.mode === mode ? state : { mode })),
  focusCity: (focusCityId) => set({ focusCityId }),
  setHoveredCity: (hoveredCityId) => set({ hoveredCityId }),
  reset: () => set({ mode: 'opening', focusCityId: null, hoveredCityId: null }),
}));
