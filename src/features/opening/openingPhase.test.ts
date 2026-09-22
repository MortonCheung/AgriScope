// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Opening 首屏决策（V5 §36/§37/§71）。
 *
 * 阶段是在模块加载时定的，所以每条用例都先重置模块再导入，
 * 才能分别验证「看过 / 减少动效 / 全新」三种环境。
 */

const SEEN_KEY = 'agriscope-opening-seen';

async function loadPhaseModule(options: { seen: boolean; reducedMotion: boolean }) {
  vi.resetModules();
  window.sessionStorage.clear();
  if (options.seen) window.sessionStorage.setItem(SEEN_KEY, 'v5-orbit-assembly');
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: options.reducedMotion && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
  return import('./openingPhase');
}

describe('Opening 首屏阶段', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); window.sessionStorage.clear(); });

  it('全新会话先停在草稿态', async () => {
    const { useOpeningStore } = await loadPhaseModule({ seen: false, reducedMotion: false });
    expect(useOpeningStore.getState().phase).toBe('sketch');
  });

  it('看过本次版本直接进入完成态', async () => {
    const { useOpeningStore } = await loadPhaseModule({ seen: true, reducedMotion: false });
    expect(useOpeningStore.getState().phase).toBe('ready');
  });

  it('要求减少动效时不做任何组装（§71）', async () => {
    const { useOpeningStore } = await loadPhaseModule({ seen: false, reducedMotion: true });
    expect(useOpeningStore.getState().phase).toBe('ready');
  });

  it('阶段只能单向推进', async () => {
    const { useOpeningStore } = await loadPhaseModule({ seen: false, reducedMotion: false });
    const { begin, finish } = useOpeningStore.getState();
    // 完成态不可退回组装态。
    finish();
    expect(useOpeningStore.getState().phase).toBe('ready');
    begin();
    expect(useOpeningStore.getState().phase).toBe('ready');
  });

  it('草稿 → 组装 → 完成', async () => {
    const { useOpeningStore } = await loadPhaseModule({ seen: false, reducedMotion: false });
    const { begin } = useOpeningStore.getState();
    begin();
    expect(useOpeningStore.getState().phase).toBe('assembling');
    useOpeningStore.getState().finish();
    expect(useOpeningStore.getState().phase).toBe('ready');
  });
});

describe('Opening 会话标记按版本记录', () => {
  beforeEach(() => { vi.resetModules(); window.sessionStorage.clear(); });

  it('记住的是当前动画版本，而不是布尔值', async () => {
    const session = await import('./openingSession');
    expect(session.hasSeenOpening()).toBe(false);
    session.markOpeningSeen();
    expect(window.sessionStorage.getItem(SEEN_KEY)).toBe(session.OPENING_VERSION);
    expect(session.hasSeenOpening()).toBe(true);
  });

  it('旧版本的标记不会被当成本次已看过', async () => {
    window.sessionStorage.setItem(SEEN_KEY, 'v4-something-old');
    const session = await import('./openingSession');
    expect(session.hasSeenOpening()).toBe(false);
  });
});
