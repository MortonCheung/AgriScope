// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ResearchRoutePage } from './ResearchRoutePage';

/**
 * 交互研究是**三栏网格**：研究树 / 中栏（切换条 + 正文）/ 证据栏。
 *
 * 这条回归守的是一个真实出过的错：模式切换条与正文曾经是两个并列的网格子项，
 * 于是网格把切换条放进中栏、把整篇研究正文塞进右侧 250px 的证据栏，
 * 图表被压到 250px 宽、读数行被迫折行（连带违反 §87「hover 不改变盒子尺寸」）。
 * 结构一旦退回旧写法，网格列数不变、页面仍渲染，只有肉眼或这条测试能发现。
 */

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/cities/:cityId/research/:researchId" element={<ResearchRoutePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const shellChildren = (container: HTMLElement): string[] =>
  [...(container.querySelector('.research__shell')?.children ?? [])].map((element) => element.className);

describe('交互研究的中栏是一个网格子项', () => {
  beforeEach(() => {
    // 结构断言与载荷无关；让研究载荷取不到即可，页面照常渲染结构。
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('研究点：三栏依次是 研究树 / 中栏 / 证据栏', () => {
    const { container } = renderAt('/cities/shenyang/research/A2.2');
    expect(shellChildren(container)).toEqual(['research__tree', 'research__column', 'research__rail']);
  });

  it('方向入口：同样是三栏', () => {
    const { container } = renderAt('/cities/shenyang/research/A2');
    expect(shellChildren(container)).toEqual(['research__tree', 'research__column', 'research__rail']);
  });

  it('切换条与正文同属中栏，正文不是网格的直接子项', () => {
    const { container } = renderAt('/cities/shenyang/research/A2.2');
    const column = container.querySelector('.research__column');
    expect(column?.querySelector('.research__modes')).not.toBeNull();
    expect(column?.querySelector('.research__stage')).not.toBeNull();
    expect(container.querySelector('.research__shell > .research__stage')).toBeNull();
    expect(container.querySelector('.research__shell > .research__modes')).toBeNull();
  });
});
