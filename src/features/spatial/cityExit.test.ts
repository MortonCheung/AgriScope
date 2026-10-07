// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { isCityExiting, requestCityExit, useCityExitStore } from './cityExit';
import { ROUTES } from '../../app/routes';

/**
 * 城市退出协调器（本轮 §24/§25/§59-12 的入口侧）。
 *
 * 真正"先 fold + 相机回位，再 navigate"由 SpatialShell 消费这些状态完成；
 * 这里锁的是协调器本身的语义：幂等、两个信号、复位。
 */

afterEach(() => { useCityExitStore.getState().reset(); });

describe('城市退出协调器', () => {
  it('初始为 idle', () => {
    expect(useCityExitStore.getState().status).toBe('idle');
    expect(isCityExiting()).toBe(false);
  });

  it('requestCityExit 默认回退到辽宁，via=back', () => {
    requestCityExit();
    const state = useCityExitStore.getState();
    expect(state.status).toBe('exiting');
    expect(state.target).toBe(ROUTES.liaoning);
    expect(state.via).toBe('back');
    expect(isCityExiting()).toBe(true);
  });

  it('幂等：退出期间重复请求不会重开时间线（StrictMode 安全）', () => {
    requestCityExit({ via: 'back' });
    useCityExitStore.getState().markPaperDone();
    requestCityExit({ target: ROUTES.about, via: 'push' });
    const state = useCityExitStore.getState();
    // 目标与来源都不变，已有的信号也不被清掉。
    expect(state.target).toBe(ROUTES.liaoning);
    expect(state.via).toBe('back');
    expect(state.paperDone).toBe(true);
  });

  it('纸面与相机两个信号分别记录', () => {
    requestCityExit({ via: 'push' });
    expect(useCityExitStore.getState().paperDone).toBe(false);
    expect(useCityExitStore.getState().cameraDone).toBe(false);
    useCityExitStore.getState().markCameraDone();
    expect(useCityExitStore.getState().cameraDone).toBe(true);
    expect(useCityExitStore.getState().paperDone).toBe(false);
    useCityExitStore.getState().markPaperDone();
    expect(useCityExitStore.getState().paperDone).toBe(true);
  });

  it('reset 回到 idle 并清空信号', () => {
    requestCityExit();
    useCityExitStore.getState().markPaperDone();
    useCityExitStore.getState().markCameraDone();
    useCityExitStore.getState().reset();
    const state = useCityExitStore.getState();
    expect(state.status).toBe('idle');
    expect(state.paperDone).toBe(false);
    expect(state.cameraDone).toBe(false);
  });
});
