import { create } from 'zustand';
import { hasSeenOpening } from './openingSession';

/**
 * Opening 状态机（V5 §58）。
 *
 * 只有三个阶段：草稿 → 组装 → 完成。
 * 「组装」内部由**同一个 progress（0→1）**同时驱动行政区下落与相机环绕，
 * 因此不会出现"地图动完、镜头再动"的分裂感；相机也不再决定路由提交。
 */
export type OpeningPhase = 'sketch' | 'assembling' | 'ready';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 首屏阶段（V5 §36/§37/§71）：看过本次版本、或要求减少动效 → 直接完成态。 */
function initialPhase(): OpeningPhase {
  return hasSeenOpening() || prefersReducedMotion() ? 'ready' : 'sketch';
}

interface OpeningState {
  phase: OpeningPhase;
  /** 用户点击「进入」才开始构建。 */
  begin: () => void;
  /** 时间轴走完（行政区落定 + 相机到位）→ 完成态。 */
  finish: () => void;
}

export const useOpeningStore = create<OpeningState>((set, get) => ({
  phase: initialPhase(),
  begin: () => { if (get().phase === 'sketch') set({ phase: 'assembling' }); },
  finish: () => { if (get().phase !== 'ready') set({ phase: 'ready' }); },
}));
