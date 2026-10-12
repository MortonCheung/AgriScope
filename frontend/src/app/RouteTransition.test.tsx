// @vitest-environment jsdom
import { cleanup, render, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigationType } from 'react-router-dom';
import { RouteTransition } from './RouteTransition';
const state = vi.hoisted(() => ({ native: false }));
vi.mock('react-router-dom', async original => ({ ...await original<typeof import('react-router-dom')>(), useViewTransitionState: () => state.native }));
let animate: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  animate = vi.fn(() => ({ cancel: vi.fn() }));
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
});
afterEach(() => { cleanup(); state.native = false; vi.unstubAllGlobals(); delete (HTMLElement.prototype as Partial<HTMLElement>).animate; });
const view = (path: string, key: string, paper = true) => <RouteTransition pathname={path} routeKey={key} navigationType={NavigationType.Pop} direction={0}>{paper && <main data-paper-surface />}</RouteTransition>;
describe('paper animation owner', () => {
  it('cold surfaces enter once, including an asynchronously loaded paper', async () => {
    const rendered = render(view('/reports', 'one', false));
    rendered.rerender(view('/reports', 'one'));
    await act(async () => {});
    expect(animate).toHaveBeenCalledOnce();
    rendered.rerender(view('/reports', 'one'));
    expect(animate).toHaveBeenCalledOnce();
  });
  it('native completion never starts a DOM reveal, including POP', () => {
    const rendered = render(view('/liaoning', 'one'));
    animate.mockClear();
    state.native = true;
    rendered.rerender(view('/reports', 'two'));
    state.native = false;
    rendered.rerender(view('/reports', 'two'));
    expect(animate).not.toHaveBeenCalled();
  });
  it('fallback enters once and same workspace city switches retain the paper', () => {
    const rendered = render(view('/liaoning', 'one'));
    animate.mockClear();
    rendered.rerender(view('/cities/shenyang/decision', 'two'));
    expect(animate).toHaveBeenCalledOnce();
    animate.mockClear();
    const paper = rendered.container.querySelector('main');
    rendered.rerender(view('/cities/dalian/decision', 'three'));
    expect(rendered.container.querySelector('main')).toBe(paper);
    expect(animate).not.toHaveBeenCalled();
  });
});
