// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import runtimeCatalog from '../../../../runtime/research/research_catalog.json';
import type { V2Catalog } from '../../domain/research/v2/types';
vi.mock('../../domain/research/runtime/catalog', async importOriginal => ({ ...await importOriginal<typeof import('../../domain/research/runtime/catalog')>(), useRuntimeCatalog: () => ({ status: 'ready', catalog: runtimeCatalog as unknown as V2Catalog }) }));
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { listTopics } from '../../domain/research/catalog';
import { CityResearchPage } from './CityResearchPage';

/**
 * 城市研究空间（本轮 §21–§23 / §37 / §59 的 7–12 条）。
 *
 * 守的是四件事：
 *   1. 结构是**三栏工作台**（研究树 / 中栏交互研究 / 证据栏）+ chrome + 关闭，三块各自滚动；
 *   2. 单击研究树只改选择，**URL 保留研究选择**；中栏默认「交互研究」，「完整文章」是次入口；
 *   3. 右栏只呈现研究侧真实元数据 —— 载荷取不到时**整块不渲染**，不写占位；
 *   4. `Esc` 先关闭局部抽屉，随后直接进入父级；全局 Header 负责页面导航。
 */

const topics = listTopics('shenyang');
const A1 = topics[0];
const A2 = topics[1];

function Probe() {
  const location = useLocation();
  return <output data-testid="path">{location.pathname + location.search}</output>;
}

function renderCity(url = '/cities/shenyang') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Probe />
      <Routes>
        <Route path="/cities/:cityId" element={<CityResearchPage />} />
        <Route path="/liaoning" element={<div>LIAONING_PAGE</div>} />
        <Route path="/cities/:cityId/research/:researchId" element={<CityResearchPage />} />
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
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('三栏和局部抽屉保留，重复页面退出/跨任务按钮已删除', () => {
    const { container } = renderCity();
    expect(container.querySelector('.city-research__chrome')).not.toBeNull();
    expect(container.querySelector('.city-research__body')?.getAttribute('data-layout')).toBe('workbench');
    expect(container.querySelector('.city-research__sidebar')).not.toBeNull();
    expect(container.querySelector('.city-research__column')).not.toBeNull();
    expect(container.querySelector('.city-research__evidence')).not.toBeNull();
    expect(screen.queryByRole('button', { name: '返回城市概览' })).toBeNull();
    expect(screen.queryByRole('link', { name: /进入决策/ })).toBeNull();
    expect(container.textContent).not.toContain('研究工作台');
    expect(container.querySelector('.city-research__chrome')?.textContent).not.toContain('个研究点');
  });

  it('默认选中发布清单中的 A1.3；点击另一个方向只改选中与中栏，URL 保留研究选择（§59-8）', () => {
    const { container } = renderCity();
    expect(railTitle(container)).toBe(A1.points.find(point => point.id === 'A1.3')!.title);
    expect(stageTitle(container)).toBe(A1.points.find(point => point.id === 'A1.3')!.title);

    const toggles = container.querySelectorAll('.tree__toggle');
    fireEvent.click(toggles[1]);
    expect(railTitle(container)).toBe(A2.title);
    expect(stageTitle(container)).toBe(A2.title);
    expect(path()).toContain('/cities/shenyang');
    expect(path()).toContain('/research/A2');
    expect(container.querySelector('.tree__topic[data-selected] .tree__topic-id')?.textContent).toBe(A2.id);
  });

  it('点击研究点只改选中，URL 保留研究选择（§59-9）', () => {
    const { container } = renderCity();
    // A1 默认展开，第一个点位行就是 A1.1。
    const firstPoint = container.querySelector('.tree__point-link');
    expect(firstPoint).not.toBeNull();
    fireEvent.click(firstPoint as Element);
    expect(stageTitle(container)).toBe(A1.points[0].title);
    expect(container.querySelector('.evidence-rail__id')?.textContent).toBe(A1.points[0].id);
    expect(path()).toContain('/research/A1.1');
    expect(path()).toContain('/cities/shenyang');
  });

  it('中栏默认「交互研究」，「完整文章」是次入口（§22）', () => {
    const { container } = renderCity();
    const modes = container.querySelector('.city-research__modes');
    expect(modes?.textContent).toContain('交互研究');
    expect(modes?.textContent).toContain('完整文章');
    expect(modes?.querySelector('[aria-selected="true"]')?.textContent).toBe('交互研究');

    const articleTab = [...(modes?.querySelectorAll('.city-research__mode') ?? [])]
      .find((element) => element.textContent === '完整文章') as Element;
    fireEvent.click(articleTab);
    expect(container.querySelector('.city-research__modes [aria-selected="true"]')?.textContent).toBe('完整文章');
    expect(path()).toContain('mode=article');
    // 模式切换只改中栏，不导航（选择的 URL 语义不变）。
    expect(path()).toContain('/cities/shenyang');
  });

  it('证据栏只渲染研究侧真实元数据；取不到就整块不渲染（§23/§38）', () => {
    const { container } = renderCity();
    // 离线：文章与来源都取不到 —— 证据栏只留选中项标识，没有来源/方法/限制块。
    expect(container.querySelector('.evidence-rail__title')).not.toBeNull();
    expect(container.querySelectorAll('.evidence-rail__label').length).toBe(0);
    expect(container.textContent ?? '').not.toContain('来源待补充');
  });

  it('Esc直接回父级；抽屉打开时先关抽屉，不启动折纸等待', () => {
    renderCity();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(path()).toBe('/liaoning?city=shenyang');

    cleanup();
    renderCity();
    const toggle = screen.getByRole('button', { name: '研究目录' });
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)?.getAttribute('aria-label')).toBe('研究目录');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('证据折叠面板开关带 aria 关联（§37/§38）', () => {
    renderCity();
    const toggle = screen.getByRole('button', { name: '研究依据' });
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)?.getAttribute('aria-label')).toBe('研究依据');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('选择研究点和文章模式时实体纸面与目录不重新挂载', () => {
    const { container } = renderCity();
    const paper = container.querySelector('.city-research__paper');
    const sidebar = container.querySelector('.city-research__sidebar');
    fireEvent.click(container.querySelector('.tree__point-link')!);
    fireEvent.click(screen.getByRole('tab', { name: '完整文章' }));
    expect(container.querySelector('.city-research__paper')).toBe(paper);
    expect(container.querySelector('.city-research__sidebar')).toBe(sidebar);
  });

  it('深链路径定位优先，树选择更新路径而非保留冲突research query', () => {
    const { container } = renderCity('/cities/shenyang/research/A2.2?research=A1.1');
    expect(container.querySelector('.evidence-rail__id')?.textContent).toBe('A2.2');
    const selected = container.querySelector('.tree__topic[data-selected] .tree__point-link')
      ?? container.querySelector('.tree__point-link');
    fireEvent.click(selected!);
    expect(path()).toContain('/cities/shenyang/research/');
    expect(path()).not.toContain('research=A1.1');
  });

  it('城市目录与深链使用同组件时，来回跳转仍保留实体纸面与目录', () => {
    function Controls() { const navigate = useNavigate(); return <><button onClick={() => navigate('/cities/shenyang/research/A2.2?research=A1.1')}>深链跳转</button><button onClick={() => navigate('/cities/shenyang')}>目录跳转</button></>; }
    const { container } = render(<MemoryRouter initialEntries={['/cities/shenyang']}><Controls /><Routes><Route path="/cities/:cityId" element={<CityResearchPage />} /><Route path="/cities/:cityId/research/:researchId" element={<CityResearchPage />} /></Routes></MemoryRouter>);
    const paper = container.querySelector('.workbench__paper'); const sidebar = container.querySelector('.workbench__sidebar');
    fireEvent.click(screen.getByRole('button', { name: '深链跳转' }));
    expect(container.querySelector('.evidence-rail__id')?.textContent).toBe('A2.2');
    expect(container.querySelector('.workbench__paper')).toBe(paper); expect(container.querySelector('.workbench__sidebar')).toBe(sidebar);
    fireEvent.click(screen.getByRole('button', { name: '目录跳转' }));
    expect(container.querySelector('.workbench__paper')).toBe(paper); expect(container.querySelector('.workbench__sidebar')).toBe(sidebar);
  });

  it('不存在条目明确替换到有效研究，旧载荷编号仍重定向到 canonical 路径', () => {
    renderCity('/cities/shenyang/research/A8.999');
    expect(path()).toContain('/cities/shenyang/research/A1.3');
    expect(screen.queryByRole('heading', { name: '研究条目不存在' })).toBeNull();
    cleanup();
    renderCity('/cities/shenyang/research/A02.2?mode=article');
    expect(path()).toContain('/cities/shenyang/research/A2.2?');
    expect(path()).toContain('mode=article');
  });

});
