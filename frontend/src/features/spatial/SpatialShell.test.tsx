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

vi.mock('motion/react', () => ({ useReducedMotion: () => false }));
vi.mock('../liaoning/LiaoningCanvas', () => ({
  LiaoningCanvas: (props: LiaoningCanvasProps) => <div data-testid="canvas-host" data-mode={props.mode} data-active={props.active} data-focus={props.focusCityId}>
    {[...STUDY_CITY_IDS, 'fushun'].map(city => <button key={city} onClick={() => props.onSelectCity(city)}>{city}</button>)}
  </div>,
}));

function Page() {
  const location = useLocation();
  return <main><div className="city-research__paper">当前纸面</div>
    <output data-testid="location" data-state={JSON.stringify(location.state)}>{location.pathname}{location.search}</output>
    <Link to="/about">关于页面</Link>
  </main>;
}
function open(entry: string | { pathname: string; state?: unknown } = '/liaoning') {
  return render(<MemoryRouter initialEntries={[entry]}><AppHistoryProvider>
    <NavigationControls />
    <Routes><Route element={<SpatialShell />}>
      <Route path="/liaoning" element={<Page />} />
      <Route path="/cities/:cityId" element={<Page />} />
      <Route path="/cities/:cityId/research/:researchId" element={<Page />} />
      <Route path="/about" element={<Page />} />
    </Route></Routes>
  </AppHistoryProvider></MemoryRouter>);
}
const path = () => screen.getByTestId('location').textContent;

beforeEach(() => {
  window.sessionStorage.clear();
  useSpatialStageStore.getState().reset();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); useSpatialStageStore.getState().reset(); });

describe('空间外壳直接导航，整纸动画已退役', () => {
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
});
