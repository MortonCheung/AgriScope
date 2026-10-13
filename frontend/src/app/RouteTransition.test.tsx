// @vitest-environment jsdom
import { StrictMode, Suspense } from 'react';
import { cleanup, render, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, NavigationType, Outlet, RouterProvider, useLocation } from 'react-router-dom';
import { RouteTransition } from './RouteTransition';
import { withPaperExit } from './paperNavigation';
import { PAPER_OPEN, PAPER_CLOSED } from './paperNavigation';
import { MOTION_DURATION } from '../design/motion';
let animate: ReturnType<typeof vi.fn>;
let effects: { id: string; cancel: ReturnType<typeof vi.fn>; finish: () => void; finished: Promise<void> }[];
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  effects = [];
  animate = vi.fn((_frames, options) => {
    let finish!: () => void, reject!: (reason: unknown) => void;
    const finished = new Promise<void>((resolve, fail) => { finish = resolve; reject = fail; });
    const effect = { id: options.id, cancel: vi.fn(() => reject(new DOMException('Canceled', 'AbortError'))), finish, finished };
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
  it('a long publication unfolds through the visible first screen and restores unrestricted scrolling', async () => {
    vi.stubGlobal('innerHeight', 900);
    const box = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 12100, height: 12000 } as DOMRect);
    try {
      const rendered = render(view('/about', 'long'));
      const paper = rendered.container.querySelector<HTMLElement>('main')!;
      const [frames, options] = animate.mock.calls[0];
      expect(frames).toEqual([{ clipPath: 'polygon(0 0px, 100% 0px, 100% 1px, 0 1px)' }, { clipPath: 'polygon(0 0px, 100% 0px, 100% 800px, 0 800px)' }]);
      expect(options.duration).toBe(MOTION_DURATION.paperEnter * 1000);
      await act(async () => effects[0].finish());
      expect(paper.style.clipPath).toBe(''); expect(paper.style.height).toBe('');
    } finally { box.mockRestore(); }
  });
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
    expect(effects[0].cancel).toHaveBeenCalledOnce();
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
  it('absent or unsupported geometry leaves the paper visible and later navigation available', () => {
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    const rendered = render(view('/reports', 'one'));
    expect(rendered.container.querySelector('main')).not.toBeNull();
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: vi.fn(() => { throw new DOMException('Unsupported'); }) });
    expect(() => rendered.rerender(view('/about', 'two'))).not.toThrow();
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    rendered.rerender(view('/liaoning', 'three'));
    expect(animate).toHaveBeenCalledOnce();
  });
  it('reveals with pure four-vertex geometry while keeping opacity and text size untouched', () => {
    render(view('/reports', 'one'));
    const [frames, options] = animate.mock.calls[0];
    expect(frames).toEqual([{ clipPath: PAPER_CLOSED }, { clipPath: PAPER_OPEN }]);
    expect(frames.every((frame: Keyframe) => !('opacity' in frame) && !('transform' in frame))).toBe(true);
    expect(options.duration).toBe(MOTION_DURATION.paperEnter * 1000);
    expect(options.fill).toBe('both');
  });
  it('the first reveal has closed base geometry and restores an existing inline clipping rule', async () => {
    const rendered = render(<RouteTransition pathname="/reports" routeKey="one" navigationType={NavigationType.Pop} direction={0}>
      <main data-paper-surface style={{ clipPath: 'inset(2px)' }} />
    </RouteTransition>);
    const paper = rendered.container.querySelector<HTMLElement>('main')!;
    expect(paper.style.clipPath).toBe(PAPER_CLOSED);
    await act(async () => effects[0].finish());
    expect(paper.style.clipPath).toBe('inset(2px)');
    expect(effects[0].cancel).toHaveBeenCalledOnce();
  });
  it('a canceled reveal restores the original rule and cannot overwrite the next owner’s guard', async () => {
    const rendered = render(view('/reports', 'one'));
    rendered.rerender(view('/about', 'two'));
    const paper = rendered.container.querySelector<HTMLElement>('main')!;
    await act(async () => {});
    expect(paper.style.clipPath).toBe(PAPER_CLOSED);
    await act(async () => effects[1].finish());
    expect(paper.style.clipPath).toBe('');
  });
  it.each([false, true])('real Router completion waits for the destination DOM before releasing the exit (suspended=%s)', async suspended => {
    let ready = !suspended, finishContent!: () => void;
    const content = new Promise<void>(resolve => { finishContent = () => { ready = true; resolve(); }; });
    function Shell() {
      const location = useLocation();
      return <RouteTransition pathname={location.pathname} search={location.search} routeKey={location.key} navigationType={NavigationType.Push} direction={0}><Outlet /></RouteTransition>;
    }
    function Destination() {
      if (!ready) throw content;
      return <main data-paper-surface>new about content</main>;
    }
    const router = createMemoryRouter([{ element: <Shell />, children: [
      { path: '/reports', element: <main data-paper-surface>old report content</main> },
      { path: '/about', lazy: async () => ({ Component: Destination }) },
    ] }], { initialEntries: ['/reports'] });
    const rendered = render(<Suspense fallback="loading destination"><RouterProvider router={router} /></Suspense>);
    try {
      await act(async () => effects[0].finish());
      const oldPaper = rendered.container.querySelector('main')!;
      let routerCompleted = false;
      const pending = withPaperExit('/reports', '/about', () => {
        const navigation = router.navigate('/about');
        void navigation.then(() => { routerCompleted = true; });
        return navigation;
      });
      const exit = effects.find(effect => effect.id === 'ag-paper-exit')!;
      const visibleAtCancellation: (string | null | undefined)[] = [];
      exit.cancel.mockImplementation(() => { visibleAtCancellation.push(rendered.container.querySelector('main')?.textContent); });
      await act(async () => { exit.finish(); });
      expect(router.state.location.pathname).toBe('/about');
      expect(routerCompleted).toBe(true);
      if (suspended) {
        expect(oldPaper.isConnected).toBe(true);
        expect(exit.cancel).not.toHaveBeenCalled();
        expect(withPaperExit('/reports', '/about', vi.fn())).toBe(pending);
        await act(async () => finishContent());
      }
      await pending;
      expect(oldPaper.isConnected).toBe(false);
      expect(visibleAtCancellation).toEqual(['new about content']);
      expect(effects.filter(effect => effect.id === 'ag-paper-enter')).toHaveLength(2);
      expect(rendered.container.querySelector('main')?.style.clipPath).toBe(PAPER_CLOSED);
      await act(async () => effects.at(-1)!.finish());
      expect(rendered.container.querySelector('main')?.style.clipPath).toBe('');
    } finally { rendered.unmount(); router.dispose(); }
  });
});
