// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import WebGL from 'three/addons/capabilities/WebGL.js';
import { LiaoningCanvas, type LiaoningCanvasProps } from './LiaoningCanvas';
import { CityMapLabel } from './CityMapLabel';
import { STUDY_CITY_IDS } from '../../domain/geography/cities';

const scene = vi.hoisted(() => ({
  canvas: 'ready' as 'ready' | 'error',
  modelError: false,
  created: null as null | ((state: { gl: { domElement: HTMLCanvasElement } }) => void),
}));
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ fallback, onCreated }: { fallback: ReactNode; onCreated: typeof scene.created }) => {
    scene.created = onCreated;
    if (scene.canvas === 'error') throw new Error('renderer failed');
    // Fiber always mounts fallback as native canvas children, including when WebGL works.
    return <canvas data-testid="canvas">{fallback}</canvas>;
  },
  useThree: vi.fn(),
}));
vi.mock('@react-three/drei', () => ({ CameraControls: () => null, CameraControlsImpl: {}, ContactShadows: () => null, Html: () => null, PerspectiveCamera: () => null }));
vi.mock('./useLiaoningModel', () => ({ useLiaoningModel: () => scene.modelError ? { status: 'error', error: 'asset failed' } : { status: 'loading' } }));

const props = (): LiaoningCanvasProps => ({ mode: 'province', focusCityId: null, hoveredCityId: null, onHoverCity: vi.fn(), onSelectCity: vi.fn(), reducedMotion: true });
beforeEach(() => { scene.canvas = 'ready'; scene.modelError = false; scene.created = null; vi.spyOn(WebGL, 'isWebGL2Available').mockReturnValue(true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const nav = () => screen.getByRole('navigation', { name: '地图城市选择' });

describe('one accessible city entry beside the pointer-only mesh', () => {
  it('renders city text as a span with no focusable or pressed control', () => {
    const { container } = render(<CityMapLabel cityId="shenyang" name="沈阳" highlighted hasResearch/>);
    expect(screen.getByText('沈阳').tagName).toBe('SPAN');
    expect(screen.getByText('沈阳').getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('button, a, [tabindex], [aria-pressed]')).toBeNull();
    expect(screen.getByText('沈阳').className).toContain('is-active');
  });
  it('keeps one hidden semantic nav when Fiber mounts its native canvas fallback', () => {
    const callbacks = props();
    const view = render(<LiaoningCanvas {...callbacks} focusCityId="shenyang"/>);
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(nav().className).toContain('ag-sr-only');
    expect(nav().hasAttribute('data-fallback')).toBe(false);
    expect(within(nav()).getAllByRole('button')).toHaveLength(STUDY_CITY_IDS.length);
    const button = within(nav()).getByRole('button', { name: '沈阳', pressed: true });
    fireEvent.focus(button); expect(callbacks.onHoverCity).toHaveBeenLastCalledWith('shenyang');
    fireEvent.click(button); expect(callbacks.onSelectCity).toHaveBeenCalledExactlyOnceWith('shenyang');
    fireEvent.blur(button); expect(callbacks.onHoverCity).toHaveBeenLastCalledWith(null);
    view.rerender(<LiaoningCanvas {...callbacks} focusCityId="tieling"/>);
    expect(WebGL.isWebGL2Available).toHaveBeenCalledTimes(1);
    expect(nav().hasAttribute('data-fallback')).toBe(false);
  });
  it('reveals one nav without mounting the renderer when WebGL2 is unsupported', () => {
    vi.mocked(WebGL.isWebGL2Available).mockReturnValue(false);
    render(<LiaoningCanvas {...props()}/>);
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(nav().hasAttribute('data-fallback')).toBe(true);
    expect(within(nav()).getAllByRole('button')).toHaveLength(STUDY_CITY_IDS.length);
    expect(screen.queryByTestId('canvas')).toBeNull();
  });
  it('reveals that same nav only after an actual renderer error', () => {
    scene.canvas = 'error';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<LiaoningCanvas {...props()}/>);
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(nav().hasAttribute('data-fallback')).toBe(true);
    expect(within(nav()).getAllByRole('button')).toHaveLength(STUDY_CITY_IDS.length);
  });
  it('reveals one nav on asset failure and removes it on inactive/opening routes', () => {
    scene.modelError = true;
    const callbacks = props();
    const view = render(<LiaoningCanvas {...callbacks}/>);
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(nav().hasAttribute('data-fallback')).toBe(true);
    view.rerender(<LiaoningCanvas {...callbacks} active={false}/>);
    expect(screen.queryByRole('navigation')).toBeNull();
    view.rerender(<LiaoningCanvas {...callbacks} mode="opening"/>);
    expect(screen.queryByRole('navigation')).toBeNull();
  });
  it('reveals and restores one nav across context loss without replacing the Canvas', () => {
    const view = render(<LiaoningCanvas {...props()}/>);
    const canvas = document.createElement('canvas');
    act(() => scene.created!({ gl: { domElement: canvas } }));
    const original = nav();
    fireEvent(canvas, new Event('webglcontextlost', { cancelable: true }));
    expect(nav()).toBe(original); expect(nav().hasAttribute('data-fallback')).toBe(true);
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(screen.getByTestId('canvas')).toBeTruthy();
    fireEvent(canvas, new Event('webglcontextrestored'));
    expect(nav()).toBe(original); expect(nav().hasAttribute('data-fallback')).toBe(false);
    view.unmount();
    fireEvent(canvas, new Event('webglcontextlost'));
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
