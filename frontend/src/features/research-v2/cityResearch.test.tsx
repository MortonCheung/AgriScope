// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { listTopics } from '../../domain/research/catalog';
import { CityResearchPage } from './CityResearchPage';
import { useCityExitStore } from '../spatial/cityExit';

/**
 * 城市研究空间（本轮 §21–§23 / §37 / §59 的 7–12 条）。
 *
 * 守的是四件事：
 *   1. 结构是**三栏工作台**（研究树 / 中栏交互探索 / 证据栏）+ chrome + 关闭，三块各自滚动；
 *   2. 单击研究树只改选择，**URL 不变**；中栏默认「交互探索」，「完整文章」是次入口；
 *   3. 右栏只呈现研究侧真实元数据 —— 载荷取不到时**整块不渲染**，不写占位；
 *   4. `×` 与 `Esc` 都进入同一个空间退出协调器（小屏抽屉打开时 `Esc` 先关抽屉）。
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
const railTitle = (container: HTMLElement) => container.querySelector('.evidence-rail__title')?.textContent;
const stageTitle = (container: HTMLElement) => container.querySelector('.research__title')?.textContent;

describe('城市研究三栏工作台', () => {
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

  it('结构：chrome / 研究树 / 中栏 / 证据栏 / 关闭按钮齐全（§59-7/11）', () => {
    const { container } = renderCity();
    expect(container.querySelector('.city-research__chrome')).not.toBeNull();
    expect(container.querySelector('.city-research__body')?.getAttribute('data-layout')).toBe('workbench');
    expect(container.querySelector('.city-research__sidebar')).not.toBeNull();
    expect(container.querySelector('.city-research__column')).not.toBeNull();
    expect(container.querySelector('.city-research__evidence')).not.toBeNull();
    expect(screen.getByRole('button', { name: '返回辽宁' })).toBeTruthy();
  });

  it('默认选中第一个方向；点击另一个方向只改选中与中栏，URL 不变（§59-8）', () => {
    const { container } = renderCity();
    expect(railTitle(container)).toBe(A1.title);
    expect(stageTitle(container)).toBe(A1.title);

    const toggles = container.querySelectorAll('.tree__toggle');
    fireEvent.click(toggles[1]);
    expect(railTitle(container)).toBe(A2.title);
    expect(stageTitle(container)).toBe(A2.title);
    expect(path()).toBe('/cities/shenyang');
    expect(container.querySelector('.tree__topic[data-selected] .tree__topic-id')?.textContent).toBe(A2.id);
  });

  it('点击研究点只改选中，URL 不变（§59-9）', () => {
    const { container } = renderCity();
    // A1 默认展开，第一个点位行就是 A1.1。
    const firstPoint = container.querySelector('.tree__point-link');
    expect(firstPoint).not.toBeNull();
    fireEvent.click(firstPoint as Element);
    expect(stageTitle(container)).toBe(A1.points[0].title);
    expect(container.querySelector('.evidence-rail__id')?.textContent).toBe(A1.points[0].id);
    expect(path()).toBe('/cities/shenyang');
  });

  it('中栏默认「交互探索」，「完整文章」是次入口（§22）', () => {
    const { container } = renderCity();
    const modes = container.querySelector('.city-research__modes');
    expect(modes?.textContent).toContain('交互探索');
    expect(modes?.textContent).toContain('完整文章');
    expect(modes?.querySelector('[aria-selected="true"]')?.textContent).toBe('交互探索');

    const articleTab = [...(modes?.querySelectorAll('.city-research__mode') ?? [])]
      .find((element) => element.textContent === '完整文章') as Element;
    fireEvent.click(articleTab);
    expect(container.querySelector('.city-research__modes [aria-selected="true"]')?.textContent).toBe('完整文章');
    // 模式切换只改中栏，不导航（选择的 URL 语义不变）。
    expect(path()).toBe('/cities/shenyang');
  });

  it('证据栏只渲染研究侧真实元数据；取不到就整块不渲染（§23/§38）', () => {
    const { container } = renderCity();
    // 离线：文章与来源都取不到 —— 证据栏只留选中项标识，没有来源/方法/限制块。
    expect(container.querySelector('.evidence-rail__title')).not.toBeNull();
    expect(container.querySelectorAll('.evidence-rail__label').length).toBe(0);
    expect(container.textContent ?? '').not.toContain('来源待补充');
  });

  it('点击 × 进入空间退出协调器（§59-12）', () => {
    renderCity();
    fireEvent.click(screen.getByRole('button', { name: '返回辽宁' }));
    expect(useCityExitStore.getState().status).toBe('exiting');
  });

  it('Esc 与 × 走同一条退出路径；抽屉打开时先关抽屉（§23/§59-12）', () => {
    renderCity();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useCityExitStore.getState().status).toBe('exiting');

    cleanup();
    useCityExitStore.getState().reset();
    renderCity();
    const toggle = screen.getByRole('button', { name: '研究方向' });
    expect(toggle.getAttribute('aria-controls')).toBe('city-research-tree');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(useCityExitStore.getState().status).toBe('idle');
  });

  it('证据折叠面板开关带 aria 关联（§37/§38）', () => {
    renderCity();
    const toggle = screen.getByRole('button', { name: '研究证据' });
    expect(toggle.getAttribute('aria-controls')).toBe('city-research-evidence');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });
});