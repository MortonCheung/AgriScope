// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { GuidedPresentation } from './GuidedPresentation';
import { PRESENTATION_STEPS } from './steps';

/**
 * 演示导览模式行为（规范 §42）。
 *
 * 守的是四条验收：
 *   1. 开启后自动导航到第一步并播报旁白、聚焦高亮；
 *   2. 下一步推进步骤并导航，旁白随之更新；
 *   3. 暂停 / 继续 切换；
 *   4. Escape 退出后面板关闭、高亮清除、入口恢复。
 */

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="loc">{location.pathname + location.search}</p>;
}

/** 用真实锚点选择器搭出各目标页的最小 DOM。 */
function renderAt(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <GuidedPresentation />
      <LocationProbe />
      <Routes>
        <Route path="/liaoning" element={<h1 className="liaoning-page__title">辽宁农业态势</h1>} />
        <Route path="/cities/:cityId" element={<h1 className="city-research__city">城市研究</h1>} />
        <Route path="/cities/:cityId/research/:researchId" element={<h1 className="research__title">研究点</h1>} />
        <Route
          path="/cities/:cityId/decision"
          element={
            <div>
              <div className="center-hero">决策中心</div>
              <section className="center-ops">
                <button type="button" className="ag-button ag-button--primary">为什么？</button>
              </section>
            </div>
          }
        />
        <Route
          path="/research"
          element={
            <div>
              <div className="research-center__flow">证据链</div>
              <section className="cx-redline">价格口径红线</section>
            </div>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('演示导览模式', () => {
  it('开启后自动导航到第一步、播报旁白并高亮目标；下一步推进；退出后清理干净', async () => {
    renderAt('/cities/chaoyang');

    fireEvent.click(screen.getByRole('button', { name: '开启演示导览模式' }));

    expect(screen.getByRole('region', { name: '演示导览模式' })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe(PRESENTATION_STEPS[0].to));
    expect(screen.getByText(PRESENTATION_STEPS[0].narration)).toBeTruthy();

    // 自动聚焦：目标元素拿到高亮类。
    await waitFor(() => expect(document.querySelector('.liaoning-page__title')?.classList.contains('ag-guide-highlight')).toBe(true));

    // 下一步 → 步骤 2，且导航到朝阳城市页。
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe(PRESENTATION_STEPS[1].to));
    expect(screen.getByText(PRESENTATION_STEPS[1].narration)).toBeTruthy();
    await waitFor(() => expect(document.querySelector('.city-research__city')?.classList.contains('ag-guide-highlight')).toBe(true));

    // 退出：面板消失、入口恢复、无残留高亮。
    fireEvent.click(screen.getByRole('button', { name: '退出' }));
    expect(screen.queryByRole('region', { name: '演示导览模式' })).toBeNull();
    expect(screen.getByRole('button', { name: '开启演示导览模式' })).toBeTruthy();
    expect(document.querySelector('.ag-guide-highlight')).toBeNull();
  });

  it('暂停 / 继续 可切换，Escape 退出', async () => {
    renderAt('/liaoning');
    fireEvent.click(screen.getByRole('button', { name: '开启演示导览模式' }));
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe(PRESENTATION_STEPS[0].to));

    fireEvent.click(screen.getByRole('button', { name: '暂停' }));
    expect(screen.getByRole('button', { name: '继续' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '继续' }));
    expect(screen.getByRole('button', { name: '暂停' })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: '演示导览模式' })).toBeNull();
  });
});