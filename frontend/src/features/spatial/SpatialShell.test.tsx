// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AppHistoryProvider } from '../../app/appHistory';
import { NavigationControls } from '../../components/NavigationControls';
import { STUDY_CITY_IDS } from '../../domain/geography/cities';
import type { LiaoningCanvasProps } from '../liaoning/LiaoningCanvas';
import { SpatialShell } from './SpatialShell';
import { useSpatialStageStore } from './spatialStageStore';
import spatialStyles from './spatial-shell.css?raw';
import { TransitionLink } from '../../app/pageNavigation';
import { primaryNavigationTarget } from '../../app/context/navigationContext';
import { cancelPendingPaperNavigation, withPaperExit } from '../../app/paperNavigation';

const cameraTrace = vi.hoisted(() => [] as { mode: string; city: string | null }[]);

vi.mock('react-router-dom', async original => ({ ...await original<typeof import('react-router-dom')>(), useViewTransitionState: () => false }));
vi.mock('motion/react', () => ({ useReducedMotion: () => false }));
vi.mock('../liaoning/LiaoningCanvas', () => ({
  LiaoningCanvas: (props: LiaoningCanvasProps) => { cameraTrace.push({ mode: props.mode, city: props.focusCityId }); return <div data-testid="canvas-host" data-mode={props.mode} data-active={props.active} data-focus={props.focusCityId}>
    {[...STUDY_CITY_IDS, 'fushun'].map(city => <button key={city} onClick={() => props.onSelectCity(city)}>{city}</button>)}
    <button onClick={props.onBackgroundClick}>背景空白</button>
  </div>; },
}));

function Page() {
  const location = useLocation();
  return <main><div className="city-research__paper">当前纸面</div>
    <output data-testid="location" data-state={JSON.stringify(location.state)}>{location.pathname}{location.search}</output>
    <Link to="/about">关于页面</Link>
    <TransitionLink to={primaryNavigationTarget('reports', location)}>报告页面</TransitionLink>
  </main>;
}
function open(entry: string | { pathname: string; state?: unknown } = '/liaoning') {
  return render(<MemoryRouter initialEntries={[entry]}><AppHistoryProvider>
    <NavigationControls />
    <Routes><Route element={<SpatialShell />}>
      <Route path="/liaoning" element={<Page />} />
      <Route path="/cities/:cityId" element={<Page />} />
      <Route path="/cities/:cityId/research/:researchId" element={<Page />} />
      <Route path="/cities/:cityId/decision" element={<Page />} />
      <Route path="/reports/:cityId" element={<Page />} />
      <Route path="/reports" element={<Page />} />
      <Route path="/about" element={<Page />} />
    </Route></Routes>
  </AppHistoryProvider></MemoryRouter>);
}
const path = () => screen.getByTestId('location').textContent;

beforeEach(() => {
  window.sessionStorage.clear();
  useSpatialStageStore.getState().reset();
  cameraTrace.length = 0;
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => { cancelPendingPaperNavigation(); cleanup(); vi.unstubAllGlobals(); useSpatialStageStore.getState().reset(); });

describe('空间外壳直接导航，整纸动画已退役', () => {
  it('决策直达报告的每次相机更新都保留同一城市，没有省域中转', () => {
    open('/cities/shenyang/decision'); const host = screen.getByTestId('canvas-host');
    cameraTrace.length = 0;
    fireEvent.click(screen.getByRole('link', { name: '报告页面' }));
    expect(path()).toContain('/reports/shenyang?'); expect(screen.getByTestId('canvas-host')).toBe(host);
    expect(cameraTrace.length).toBeGreaterThan(0);
    expect(cameraTrace.every(frame => frame.mode === 'city' && frame.city === 'shenyang')).toBe(true);
  });
  it.each(['/reports?city=tieling', '/reports?city=dalian'])('旧带城市报告入口 %s 在规范跳转前就保持城市背景', url => {
    open(url); expect(cameraTrace.every(frame => frame.mode === 'city' && frame.city === url.split('=')[1])).toBe(true);
  });
  it.each(['/reports?city=shenyang&view=cross_city', '/reports?city=shenyang&view=synthesis', '/reports/liaoning?city=shenyang'])('综合报告 %s 保留省域背景', url => {
    open(url); expect(cameraTrace.every(frame => frame.mode === 'province' && frame.city === null)).toBe(true);
  });
  it('未提交路由前背景已开始过渡，取消后回到当前城市且纸面不被替换', async () => {
    open('/cities/shenyang/decision'); const host = screen.getByTestId('canvas-host');
    const paper = document.querySelector('main')!; paper.setAttribute('data-paper-surface', '');
    let reject!: (error: unknown) => void;
    const finished = new Promise<void>((_, fail) => { reject = fail; });
    Object.defineProperty(paper, 'animate', { value: () => ({ finished, cancel: () => reject(new DOMException('Canceled', 'AbortError')) }) });
    let pending: void | Promise<void>; const commit = vi.fn();
    act(() => { pending = withPaperExit('/cities/shenyang/decision', '/about', commit); });
    expect(path()).toBe('/cities/shenyang/decision'); expect(host.dataset.mode).toBe('province');
    expect(host.dataset.focus).toBeUndefined(); expect(commit).not.toHaveBeenCalled();
    await act(async () => { cancelPendingPaperNavigation(); await pending; });
    expect(host.dataset.mode).toBe('city'); expect(host.dataset.focus).toBe('shenyang');
    expect(screen.getByTestId('canvas-host')).toBe(host); expect(commit).not.toHaveBeenCalled();
  });
  it('决策和报告保持城市背景，背景空白与结构父级一致', () => {
    open('/cities/dandong/decision');
    const canvas = screen.getByTestId('canvas-host');
    expect(canvas.dataset.active).toBe('true');
    expect(canvas.dataset.focus).toBe('dandong');
    fireEvent.click(screen.getByRole('button', { name: '背景空白' }));
    expect(path()).toBe('/liaoning?city=dandong');
    fireEvent.click(screen.getByRole('button', { name: '背景空白' }));
    expect(path()).toBe('/liaoning');
    expect(screen.getByTestId('canvas-host')).toBe(canvas);
    cleanup();
    open('/reports/shenyang');
    expect(screen.getByTestId('canvas-host').dataset.active).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '背景空白' }));
    expect(path()).toBe('/reports');
  });
  it.each(['province-to-city', 'city-to-province'])('旧历史标记 %s 不再改变纸面或注册退出等待', transition => {
    const { container } = open({ pathname: '/cities/shenyang', state: { transition } });
    expect(container.querySelector('.spatial-shell__dom')?.hasAttribute('data-transition')).toBe(false);
    expect(container.querySelector('.spatial-shell')?.hasAttribute('data-exiting')).toBe(false);
    expect(container.querySelector('.city-research__paper')).not.toBeNull();
    expect(spatialStyles).not.toMatch(/ag-paper-(?:unfold|fold|content-in|content-out)/);
    fireEvent.click(screen.getByRole('button', { name: 'jinzhou' }));
    expect(path()).toBe('/cities/jinzhou');
    expect(screen.getByTestId('location').dataset.state).toBe('null');
  });

  it('相机仍在移动时，上一级立即提交 URL，无需动画结束或延时', () => {
    const { container } = open('/cities/shenyang');
    const canvas = screen.getByTestId('canvas-host');
    act(() => useSpatialStageStore.getState().setCameraMoving(true));
    fireEvent.click(screen.getByRole('button', { name: '上一级' }));
    expect(path()).toBe('/liaoning?city=shenyang');
    expect(useSpatialStageStore.getState().cameraMoving).toBe(true);
    expect(screen.getByTestId('canvas-host')).toBe(canvas);
    expect(container.querySelector('.spatial-shell__dom')?.hasAttribute('data-exiting')).toBe(false);
  });

  it('六城选择仅更新地图上下文，非研究地块不能选择；Canvas 宿主始终保留', () => {
    open();
    const canvas = screen.getByTestId('canvas-host');
    for (const city of STUDY_CITY_IDS) {
      fireEvent.click(screen.getByRole('button', { name: city }));
      expect(path()).toBe('/liaoning?city=' + city);
      expect(screen.getByTestId('canvas-host')).toBe(canvas);
    }
    fireEvent.click(screen.getByRole('button', { name: 'fushun' }));
    expect(path()).toBe('/liaoning?city=' + STUDY_CITY_IDS.at(-1));
  });

  it('About、后退和前进只切换舞台可见性，不卸载 Canvas 或等待收纸', () => {
    open('/cities/shenyang/research/A2.2');
    const canvas = screen.getByTestId('canvas-host');
    fireEvent.click(screen.getByRole('link', { name: '关于页面' }));
    expect(path()).toBe('/about');
    expect(screen.getByTestId('canvas-host')).toBe(canvas);
    fireEvent.click(screen.getByRole('button', { name: '后退' }));
    expect(path()).toBe('/cities/shenyang/research/A2.2');
    expect(screen.getByTestId('canvas-host')).toBe(canvas);
    fireEvent.click(screen.getByRole('button', { name: '前进' }));
    expect(path()).toBe('/about');
    expect(screen.getByTestId('canvas-host')).toBe(canvas);
  });

  it.each(['/about', '/reports'])('环境背景在 %s 仍可见，城市控件不改变该任务', url => {
    const { container } = open(url);
    expect(container.querySelector('.spatial-shell__canvas')?.hasAttribute('data-visible')).toBe(true);
    expect(container.querySelector('.spatial-shell__canvas')?.hasAttribute('data-interactive')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'tieling', hidden: true }));
    expect(path()).toBe(url);
  });
});
