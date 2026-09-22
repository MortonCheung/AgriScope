import { create } from 'zustand';
import { hasSeenOpening } from './openingSession';

/**
 * Opening 状态机（V4 §二十七）。
 *
 * 只用一个阶段枚举，不堆布尔值：
 *   sketch     —— 草稿纸 + 手稿边界，页面初始状态（§二十三）
 *   assembling —— 用户点击「进入」后，14 块行政区从空间落下（§二十七/§三十）
 *   settling   —— 全部落地，相机收束到正式沙盘位姿（§三十三）
 *   exiting    —— 相机已就位，准备切到 /liaoning（§三十四）
 *   ready      —— 完成态：再次进入首页直接显示沙盘，不再重放（§三十六）
 */
export type OpeningPhase = 'sketch' | 'assembling' | 'settling' | 'ready' | 'exiting';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 首屏阶段（V4 §三十六/§三十七）：
 * 本次 session 已看过、或用户要求减少动效 → 直接给完成态，不砸第二次地图。
 */
function initialPhase(): OpeningPhase {
  return hasSeenOpening() || prefersReducedMotion() ? 'ready' : 'sketch';
}

interface OpeningState {
  phase: OpeningPhase;
  /** 用户点击「进入」才开始三维构建（§二十七）。 */
  begin: () => void;
  /** 行政区全部落地（§三十）。 */
  settle: () => void;
  /** 相机已收敛到正式沙盘位姿（§三十三）。 */
  exit: () => void;
  /** 回到完成态（§三十六）。 */
  finish: () => void;
}

export const useOpeningStore = create<OpeningState>((set, get) => ({
  phase: initialPhase(),
  begin: () => { if (get().phase === 'sketch') set({ phase: 'assembling' }); },
  settle: () => { if (get().phase === 'assembling') set({ phase: 'settling' }); },
  exit: () => { if (get().phase === 'settling') set({ phase: 'exiting' }); },
  finish: () => { if (get().phase !== 'ready') set({ phase: 'ready' }); },
}));
