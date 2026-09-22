import { create } from 'zustand';

/**
 * 空间舞台状态：一个 Canvas 服务全部路由。
 * 路由只声明"需要哪种空间模式"，相机与几何由场景自己负责。
 */
export type SpatialStageMode = 'opening' | 'province' | 'city' | 'none';

interface SpatialStageState {
  mode: SpatialStageMode;
  focusCityId: string | null;
  hoveredCityId: string | null;
  /** 从省域进入城市时的一次性推近请求 */
  dollyToken: number;
  setMode: (mode: SpatialStageMode) => void;
  focusCity: (cityId: string | null) => void;
  setHoveredCity: (cityId: string | null) => void;
  requestDolly: (cityId: string) => void;
  reset: () => void;
}

export const useSpatialStageStore = create<SpatialStageState>((set) => ({
  mode: 'opening',
  focusCityId: null,
  hoveredCityId: null,
  dollyToken: 0,
  setMode: (mode) => set((state) => (state.mode === mode ? state : { mode })),
  focusCity: (focusCityId) => set({ focusCityId }),
  setHoveredCity: (hoveredCityId) => set({ hoveredCityId }),
  requestDolly: (cityId) => set((state) => ({ focusCityId: cityId, dollyToken: state.dollyToken + 1 })),
  reset: () => set({ mode: 'opening', focusCityId: null, hoveredCityId: null }),
}));
