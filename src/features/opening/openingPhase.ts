import { create } from 'zustand';

/**
 * Opening 状态机（V5 §58，本轮 §10/§11 修订）。
 *
 * 只有三个阶段：草稿 → 组装 → 完成。
 * 「组装」内部由**同一个 progress（0→1）**同时驱动行政区下落与相机环绕，
 * 因此不会出现"地图动完、镜头再动"的分裂感；相机也不再决定路由提交。
 *
 * 本轮关键修订：**每次真正进入 `/` 都要重放完整开场**。
 * 过去用 sessionStorage（`openingSession.ts`）记住"已看过"，再加上 Zustand 是模块级单例，
 * 于是用户一整个会话只能看到一次 Opening。现在：
 *   · sessionStorage 不再决定播放与否（该文件已退役）；
 *   · 由 `<OpeningPage>` 挂载时的 `reset()` 把状态机拉回 `sketch`（幂等，StrictMode 安全）；
 *   · 只有 `prefers-reduced-motion` 直接落到 `ready`（不播放动画，§11）。
 */
export type OpeningPhase = 'sketch' | 'assembling' | 'ready';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 首屏阶段：只需减少动效时直接完成态，否则一律从草稿开始（§11）。 */
function initialPhase(): OpeningPhase {
  return prefersReducedMotion() ? 'ready' : 'sketch';
}

interface OpeningState {
  phase: OpeningPhase;
  /** 用户点击「进入」才开始构建。 */
  begin: () => void;
  /** 时间轴走完（行政区落定 + 相机到位）→ 完成态。 */
  finish: () => void;
  /**
   * 回到首屏阶段（打开 `/` 时调用）。幂等：可重复调用、StrictMode 双执行无副作用。
   * 减少动效时落点仍是 `ready`，不会强迫用户看动画。
   */
  reset: () => void;
}

export const useOpeningStore = create<OpeningState>((set, get) => ({
  phase: initialPhase(),
  begin: () => { if (get().phase === 'sketch') set({ phase: 'assembling' }); },
  finish: () => { if (get().phase !== 'ready') set({ phase: 'ready' }); },
  reset: () => {
    const next = initialPhase();
    if (get().phase !== next) set({ phase: next });
  },
}));
