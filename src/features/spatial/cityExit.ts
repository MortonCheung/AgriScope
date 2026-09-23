import { create } from 'zustand';
import { ROUTES } from '../../app/routes';

/**
 * 城市 → 省域的**统一退出协调器**（本轮 §24/§25/§26）。
 *
 * 三种退出入口必须完全一致：纸面右上 `×`、`Esc`、应用内「上一级 `^`」。
 * 它们都调用 `requestCityExit()`，走同一条时间线：
 *
 *   1. `begin()` 把状态置为 exiting（幂等：重复请求不重开）；
 *   2. 空间外壳据此把 Canvas 的有效模式改成 province、focusCity 置空，
 *      于是相机从 cityView 回到 provinceView；同时纸面播放 fold 动画；
 *   3. 纸面 `animationend` 与相机停稳**都完成**后，才真正导航到 target；
 *   4. 离开城市路由后 `reset()`，回到 idle。
 *
 * 整个过程里 `pathname` 仍然是 `/cities/:cityId`（§25）—— 不靠魔法 timeout 同步。
 */

export type CityExitVia = 'back' | 'push';

interface CityExitState {
  status: 'idle' | 'exiting';
  /** 退出后要落到的路径。 */
  target: string;
  /** back：走应用历史回退（浏览器语义）；push：压入新历史。 */
  via: CityExitVia;
  /** 纸面 fold 动画已结束。 */
  paperDone: boolean;
  /** 相机已回到 provinceView 并停稳。 */
  cameraDone: boolean;
  begin: (target: string, via: CityExitVia) => void;
  markPaperDone: () => void;
  markCameraDone: () => void;
  reset: () => void;
}

export const useCityExitStore = create<CityExitState>((set, get) => ({
  status: 'idle',
  target: ROUTES.liaoning,
  via: 'back',
  paperDone: false,
  cameraDone: false,
  begin: (target, via) => {
    if (get().status === 'exiting') return;
    set({ status: 'exiting', target, via, paperDone: false, cameraDone: false });
  },
  markPaperDone: () => set((state) => (state.paperDone ? state : { paperDone: true })),
  markCameraDone: () => set((state) => (state.cameraDone ? state : { cameraDone: true })),
  reset: () => set({ status: 'idle', paperDone: false, cameraDone: false }),
}));

/**
 * 请求退出城市空间。
 *
 * 默认「回退到辽宁」：`×` / `Esc` 都走这条 —— 语义是"回到我来的地方"，
 * 由应用历史负责（没有历史时回退到 `/liaoning`）。`^` 传 `via: 'push'`。
 */
export function requestCityExit(options: { target?: string; via?: CityExitVia } = {}): void {
  useCityExitStore.getState().begin(options.target ?? ROUTES.liaoning, options.via ?? 'back');
}

/** 幂等：重复请求不会重开一条退出时间线。 */
export function isCityExiting(): boolean {
  return useCityExitStore.getState().status === 'exiting';
}
