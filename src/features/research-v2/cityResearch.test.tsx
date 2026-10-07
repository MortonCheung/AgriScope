// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { listTopics } from '../../domain/research/catalog';
import { CityResearchPage } from './CityResearchPage';
import { useCityExitStore } from '../spatial/cityExit';

/**
 * 城市研究 App（本轮 §18–§23 / §59 的 7–12 条）。
 *
 * 守的是三件事：
 *   1. 结构是"窗口 + 侧栏 + 预览 + 关闭"，两块各自滚动；
 *   2. 单击研究树只改选择，**URL 不变**，只有「进入研究」才导航；
 *   3. `×` 与 `Esc` 都进入同一个空间退出协调器（先动画、后导航）。
 */

const topics = listTopics('shenyang');
const A1 = topics[0];
const A2 = topics[1];

function Probe() {
  const location = useLocation();
  return <output data-testid="path">{location.pathname}</output>;
}

function renderCity() {
  return render(
    <MemoryRouter initialEntries={['/cities/shenyang']}>
      <Probe />
      <Routes>
        <Route path="/cities/:cityId" element={<CityResearchPage />} />
        <Route path="/liaoning" element={<div>LIAONING_PAGE</div>} />
        <Route path="/cities/:cityId/research/:researchId" element={<div>RESEARCH_PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const path = () => screen.getByTestId('path').textContent;
const previewTitle = (container: HTMLElement) => container.querySelector('.city-preview__title')?.textContent;

describe('城市研究 App', () => {
  beforeEach(() => {
    // 城市页的结构与选择逻辑与载荷无关；让文章取不到即可。
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    useCityExitStore.getState().reset();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useCityExitStore.getState().reset();
  });

  it('结构：chrome / 侧栏 / 预览 / 关闭按钮齐全（§59-7/11）', () => {
    const { container } = renderCity();
    expect(container.querySelector('.city-research__chrome')).not.toBeNull();
    expect(container.querySelector('.city-research__sidebar')).not.toBeNull();
    expect(container.querySelector('.city-research__preview')).not.toBeNull();
    expect(screen.getByRole('button', { name: '返回辽宁' })).toBeTruthy();
    // 侧栏与预览是同一个 body 下的两个并列滚动区（§59-11 的结构前提）。
    const body = container.querySelector('.city-research__body');
    expect(body?.children[0]?.className).toBe('city-research__sidebar');
    expect(body?.children[1]?.className).toBe('city-research__preview');
  });

  it('默认选中第一个方向；点击另一个方向只改预览，URL 不变（§59-8）', () => {
    const { container } = renderCity();
    expect(previewTitle(container)).toBe(A1.title);

    const toggles = container.querySelectorAll('.tree__toggle');
    fireEvent.click(toggles[1]);
    expect(previewTitle(container)).toBe(A2.title);
    expect(path()).toBe('/cities/shenyang');
    expect(container.querySelector('.tree__topic[data-selected] .tree__topic-id')?.textContent).toBe(A2.id);
  });

  it('点击研究点只改预览，URL 不变（§59-9）', () => {
    const { container } = renderCity();
    // A1 默认展开，第一个点位行就是 A1.1。
    const firstPoint = container.querySelector('.tree__point-link');
    expect(firstPoint).not.toBeNull();
    fireEvent.click(firstPoint as Element);
    expect(container.querySelector('.city-preview')?.getAttribute('data-kind')).toBe('point');
    expect(previewTitle(container)).toBe(A1.points[0].title);
    expect(path()).toBe('/cities/shenyang');
  });

  it('只有「进入研究」才真正导航（§59-10）', () => {
    const { container } = renderCity();
    const enter = container.querySelector('.city-preview__enter') as HTMLAnchorElement;
    expect(enter.getAttribute('href')).toBe(`/cities/shenyang/research/${A1.id}`);
    fireEvent.click(enter);
    expect(screen.getByText('RESEARCH_PAGE')).toBeTruthy();
  });

  it('点击 × 进入空间退出协调器（§59-12）', () => {
    renderCity();
    fireEvent.click(screen.getByRole('button', { name: '返回辽宁' }));
    expect(useCityExitStore.getState().status).toBe('exiting');
  });

  it('Esc 与 × 走同一条退出路径（§23/§59-12）', () => {
    renderCity();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useCityExitStore.getState().status).toBe('exiting');
  });
});
