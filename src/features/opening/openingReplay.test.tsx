// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OpeningPage } from './OpeningPage';
import { useOpeningStore } from './openingPhase';

/**
 * 首页重放（本轮 §11 / §59 的 1–3 条）。
 *
 * 守的是一个真实出过的错：sessionStorage + 模块级单例 Zustand 让 Opening
 * 一个会话只能看一次。现在只有 `reset()` 决定 —— 只要再打开 `/`，
 * 即使上一次已经走到「完成」，也必须被拉回草稿重新播放。
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

function renderOpening() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<OpeningPage />} />
        <Route path="/liaoning" element={<div>LIAONING_PROVINCE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Opening 每次进入 / 都重放（§11/§59）', () => {
  beforeEach(() => { stubMotion(false); });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useOpeningStore.setState({ phase: 'sketch' });
  });

  it('上次已「完成」的情况下再次打开 /，仍被拉回草稿并给出「进入」', () => {
    useOpeningStore.setState({ phase: 'ready' });
    renderOpening();
    expect(useOpeningStore.getState().phase).toBe('sketch');
    expect(screen.getByRole('button', { name: /进入/ })).toBeTruthy();
    expect(screen.queryByText('LIAONING_PROVINCE')).toBeNull();
  });

  it('点击进入 → 组装 → 完成 → 自动切到 /liaoning', async () => {
    renderOpening();
    fireEvent.click(screen.getByRole('button', { name: /进入/ }));
    expect(useOpeningStore.getState().phase).toBe('assembling');
    act(() => { useOpeningStore.getState().finish(); });
    await waitFor(() => expect(screen.getByText('LIAONING_PROVINCE')).toBeTruthy());
  });

  it('减少动效时直接完成态：给出链接且不自动跳走', () => {
    stubMotion(true);
    renderOpening();
    expect(useOpeningStore.getState().phase).toBe('ready');
    expect(screen.getByRole('link', { name: /进入/ })).toBeTruthy();
    expect(screen.queryByText('LIAONING_PROVINCE')).toBeNull();
  });
});
