// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { GuidedPresentation } from './GuidedPresentation';
import { PRESENTATION_STEPS } from './steps';
import { resetAppContext, useAppContext } from '../../app/context/appContext';

/**
 * 演示导览模式行为（规范 §42）。
 *
 * 守的是六条验收：
 *   1. 开启后自动导航到第一步并播报旁白、聚焦高亮；
 *   2. 停稳窗口结束后「下一步」才可用，推进后导航与旁白更新；
 *   3. 暂停 / 继续 切换；
 *   4. Escape / ← → 键盘可用；
 *   5. 退出后**恢复进入前的 URL 与四要素 Context**；
 *   6. 退出后面板关闭、高亮清除、入口恢复。
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
              <nav className="center-horizon-tabs" aria-label="短期周期">短期预测</nav>
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
              <ul className="cx-findings"><li>关键发现</li></ul>
            </div>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

/** 等待主操作「下一步」结束停稳、变为可用。 */
async function waitForNextEnabled(name: '下一步' | '结束' = '下一步') {
  const button = screen.getByRole('button', { name }) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false), { timeout: 3000 });
  return button;
}

beforeEach(() => {
  resetAppContext();
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
  it('开启后自动导航到第一步、播报旁白并高亮目标；停稳后下一步推进；退出后清理干净', async () => {
    renderAt('/cities/chaoyang');

    fireEvent.click(screen.getByRole('button', { name: '开启演示导览模式' }));

    expect(screen.getByRole('region', { name: '演示导览模式' })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe(PRESENTATION_STEPS[0].to));
    expect(screen.getByText(PRESENTATION_STEPS[0].narration)).toBeTruthy();

    // 自动聚焦：目标元素拿到高亮类。
    await waitFor(() => expect(document.querySelector('.liaoning-page__title')?.classList.contains('ag-guide-highlight')).toBe(true));

    // 停稳前「下一步」不可用（评委先看清这一步）。
    await waitForNextEnabled();

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

  it('← → 键盘可上一步 / 下一步', async () => {
    renderAt('/liaoning');
    fireEvent.click(screen.getByRole('button', { name: '开启演示导览模式' }));
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe(PRESENTATION_STEPS[0].to));
    await waitForNextEnabled();

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe(PRESENTATION_STEPS[1].to));

    // 回到上一步（无需等停稳）。
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe(PRESENTATION_STEPS[0].to));
  });

  it('退出后恢复进入前的 URL 与四要素 Context', async () => {
    const ctx = useAppContext.getState();
    ctx.setCity('chaoyang');
    ctx.setHorizon(7);
    ctx.setCrop('黄瓜');
    ctx.setAsOf('2026-05-01');

    renderAt('/cities/chaoyang?city=chaoyang&horizon=7');
    fireEvent.click(screen.getByRole('button', { name: '开启演示导览模式' }));
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe(PRESENTATION_STEPS[0].to));

    // 演示过程中上下文被改动（模拟逐页切换城市 / 周期）。
    const during = useAppContext.getState();
    during.setCity('shenyang');
    during.setHorizon(30);
    during.setCrop(null);

    fireEvent.click(screen.getByRole('button', { name: '退出' }));

    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/cities/chaoyang?city=chaoyang&horizon=7'));
    const restored = useAppContext.getState();
    expect(restored.cityId).toBe('chaoyang');
    expect(restored.horizon).toBe(7);
    expect(restored.crop).toBe('黄瓜');
    expect(restored.asOf).toBe('2026-05-01');
  });
});