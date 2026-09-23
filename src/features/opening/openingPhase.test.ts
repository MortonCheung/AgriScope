// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Opening 首屏决策（本轮 §10/§11 修订）。
 *
 * 阶段是在模块加载时定的，所以每条用例都先重置模块再导入，
 * 以便分别验证「减少动效 / 全新」两种环境。
 * sessionStorage 已不再参与决策 —— 有专门用例证明这一点。
 */

function stubMotion(reducedMotion: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reducedMotion && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

async function loadPhaseModule(options: { reducedMotion: boolean }) {
  vi.resetModules();
  stubMotion(options.reducedMotion);
  return import('./openingPhase');
}

describe('Opening 首屏阶段', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); window.sessionStorage.clear(); });

  it('全新进入先停在草稿态', async () => {
    const { useOpeningStore } = await loadPhaseModule({ reducedMotion: false });
    expect(useOpeningStore.getState().phase).toBe('sketch');
  });

  it('要求减少动效时直接完成态，不组装（§11）', async () => {
    const { useOpeningStore } = await loadPhaseModule({ reducedMotion: true });
    expect(useOpeningStore.getState().phase).toBe('ready');
  });

  it('阶段只能单向推进', async () => {
    const { useOpeningStore } = await loadPhaseModule({ reducedMotion: false });
    useOpeningStore.getState().finish();
    expect(useOpeningStore.getState().phase).toBe('ready');
    useOpeningStore.getState().begin();
    expect(useOpeningStore.getState().phase).toBe('ready');
  });

  it('草稿 → 组装 → 完成', async () => {
    const { useOpeningStore } = await loadPhaseModule({ reducedMotion: false });
    useOpeningStore.getState().begin();
    expect(useOpeningStore.getState().phase).toBe('assembling');
    useOpeningStore.getState().finish();
    expect(useOpeningStore.getState().phase).toBe('ready');
  });

  it('reset 让完成态重新回到草稿，支持再次进入 / 重放（§11）', async () => {
    const { useOpeningStore } = await loadPhaseModule({ reducedMotion: false });
    useOpeningStore.getState().begin();
    useOpeningStore.getState().finish();
    expect(useOpeningStore.getState().phase).toBe('ready');
    useOpeningStore.getState().reset();
    expect(useOpeningStore.getState().phase).toBe('sketch');
  });

  it('reset 幂等：连续调用结果一致（StrictMode 安全）', async () => {
    const { useOpeningStore } = await loadPhaseModule({ reducedMotion: false });
    useOpeningStore.getState().reset();
    useOpeningStore.getState().reset();
    expect(useOpeningStore.getState().phase).toBe('sketch');
    useOpeningStore.getState().begin();
    useOpeningStore.getState().reset();
    useOpeningStore.getState().reset();
    expect(useOpeningStore.getState().phase).toBe('sketch');
  });

  it('减少动效下 reset 仍落在完成态，不强迫看动画', async () => {
    const { useOpeningStore } = await loadPhaseModule({ reducedMotion: true });
    useOpeningStore.getState().reset();
    expect(useOpeningStore.getState().phase).toBe('ready');
  });

  it('sessionStorage 不再决定是否播放（本轮退役 openingSession）', async () => {
    window.sessionStorage.setItem('agriscope-opening-seen', 'v5-orbit-assembly');
    const { useOpeningStore } = await loadPhaseModule({ reducedMotion: false });
    expect(useOpeningStore.getState().phase).toBe('sketch');
  });
});
