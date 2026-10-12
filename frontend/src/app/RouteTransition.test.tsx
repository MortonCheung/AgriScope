// @vitest-environment jsdom
import { StrictMode } from 'react';
import { cleanup, render, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigationType } from 'react-router-dom';
import { RouteTransition } from './RouteTransition';
import { withPaperExit } from './paperNavigation';
let animate: ReturnType<typeof vi.fn>;
let effects: { id: string; cancel: ReturnType<typeof vi.fn>; finish: () => void; finished: Promise<void> }[];
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  effects = [];
  animate = vi.fn((_frames, options) => {
    let finish!: () => void;
    const finished = new Promise<void>(resolve => { finish = resolve; });
    const effect = { id: options.id, cancel: vi.fn(finish), finish, finished };
    effects.push(effect); return effect;
  });
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
});
afterEach(async () => { cleanup(); await act(async () => {}); vi.unstubAllGlobals(); delete (HTMLElement.prototype as Partial<HTMLElement>).animate; });
const view = (path: string, key: string, paper = true) => {
  const url = new URL(path, 'http://localhost');
  return <RouteTransition pathname={url.pathname} search={url.search} routeKey={key} navigationType={NavigationType.Pop} direction={0}>{paper && <main data-paper-surface />}</RouteTransition>;
};
describe('single WAAPI paper owner', () => {
  it('cold surfaces enter once, including a lazily mounted paper and later child changes', async () => {
    const rendered = render(view('/reports', 'one', false));
    rendered.rerender(view('/reports', 'one'));
    await act(async () => {});
    expect(animate).toHaveBeenCalledOnce();
    rendered.container.querySelector('main')!.appendChild(document.createElement('p'));
    await act(async () => {});
    rendered.rerender(view('/reports', 'one'));
    expect(animate).toHaveBeenCalledOnce();
  });
  it('a browser with native support still uses exactly one DOM reveal', () => {
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: vi.fn() });
    const rendered = render(view('/liaoning', 'one'));
    animate.mockClear();
    rendered.rerender(view('/reports', 'two'));
    expect(animate).toHaveBeenCalledOnce();
    expect(document.startViewTransition).not.toHaveBeenCalled();
    delete (document as Partial<Document>).startViewTransition;
  });
  it.each([
    ['/cities/shenyang/decision', '/cities/jinzhou/decision'],
    ['/reports/shenyang', '/reports/dalian'],
    ['/reports?view=cross_city', '/reports?view=synthesis'],
    ['/cities/shenyang/decision?crop=黄瓜', '/cities/shenyang/decision?crop=土豆'],
  ])('%s → %s keeps the same paper without another full reveal', (from, to) => {
    const rendered = render(view(from, 'one'));
    const paper = rendered.container.querySelector('main');
    animate.mockClear(); rendered.rerender(view(to, 'two'));
    expect(rendered.container.querySelector('main')).toBe(paper);
    expect(animate).not.toHaveBeenCalled();
  });
  it('carries an unconsumed entrance through a canonical redirect', async () => {
    const rendered = render(view('/decision', 'one', false));
    rendered.rerender(view('/cities/shenyang/decision', 'two'));
    await act(async () => {});
    expect(animate).toHaveBeenCalledOnce();
    rendered.rerender(view('/cities/jinzhou/decision', 'three'));
    expect(animate).toHaveBeenCalledOnce();
  });
  it('StrictMode preserves its single reveal until completion instead of canceling the rehearsal', async () => {
    const rendered = render(<StrictMode>{view('/reports', 'one')}</StrictMode>);
    await act(async () => {});
    expect(animate).toHaveBeenCalledOnce();
    expect(effects[0].cancel).not.toHaveBeenCalled();
    rendered.unmount(); await act(async () => {});
    expect(effects[0].cancel).toHaveBeenCalledOnce();
  });
  it('completed animations are not retained after unmount', async () => {
    const rendered = render(view('/reports', 'one'));
    await act(async () => effects[0].finish());
    rendered.unmount(); await act(async () => {});
    expect(effects[0].cancel).not.toHaveBeenCalled();
  });
  it('real POP cancels an exit before its old target can commit', async () => {
    render(view('/reports', 'one'));
    const commit = vi.fn();
    const waiting = withPaperExit('/reports', '/about', commit);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await waiting;
    expect(commit).not.toHaveBeenCalled();
    expect(effects.find(effect => effect.id === 'ag-paper-exit')?.cancel).toHaveBeenCalled();
  });
  it('a new observed route invalidates an old pending exit, without another Outlet', async () => {
    const rendered = render(view('/reports', 'one'));
    const commit = vi.fn();
    const waiting = withPaperExit('/reports', '/about', commit);
    rendered.rerender(view('/reports/dalian', 'two'));
    await waiting;
    expect(commit).not.toHaveBeenCalled();
    expect(rendered.container.querySelectorAll('.route-page')).toHaveLength(1);
  });
  it('reduced motion immediately exposes cold and cross-page surfaces', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const rendered = render(view('/reports', 'one'));
    rendered.rerender(view('/about', 'two'));
    expect(animate).not.toHaveBeenCalled();
  });
});
