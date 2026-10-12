// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrowserRouter, MemoryRouter, NavigationType, RouterProvider, useLocation } from 'react-router-dom';
import { TransitionLink, TransitionNavLink, usePageNavigate } from './pageNavigation';
import { RouteTransition } from './RouteTransition';
import { AppHistoryProvider, useAppHistory } from './appHistory';
import { cancelPendingPaperNavigation } from './paperNavigation';

let effects: { id: string; finish: () => void; cancel: ReturnType<typeof vi.fn>; finished: Promise<void> }[];
let animate: ReturnType<typeof vi.fn>;
function Page() {
  const location = useLocation(), navigate = usePageNavigate(), history = useAppHistory();
  return <><nav>
    <TransitionLink to="/decision" viewTransition>决策</TransitionLink>
    <TransitionNavLink to="/reports" viewTransition>报告</TransitionNavLink>
    <TransitionLink to="/about">关于</TransitionLink>
    <TransitionLink to="/reports/shenyang">沈阳报告</TransitionLink>
    <TransitionLink to="/reports?view=synthesis">综合研究</TransitionLink>
    <TransitionLink to="/reports" onClick={event => event.preventDefault()}>被阻止</TransitionLink>
    <TransitionLink to="/reports" target="_blank">新窗口</TransitionLink>
  </nav>
  <button onClick={() => navigate('/about', { viewTransition: true })}>程序导航</button>
  <button onClick={() => navigate(-1)}>数字后退</button>
  <button onClick={() => history?.goBack({ to: '/liaoning' })}>应用后退</button>
  <button onClick={() => history?.goForward()}>应用前进</button>
  <RouteTransition routeKey={location.key} pathname={location.pathname} search={location.search} direction={0} navigationType={NavigationType.Push}>
    <main data-paper-surface><output aria-label="当前位置">{location.pathname}{location.search}</output></main>
  </RouteTransition></>;
}
function open(entry = '/liaoning') { return render(<MemoryRouter initialEntries={[entry]}><AppHistoryProvider><Page /></AppHistoryProvider></MemoryRouter>); }
const path = () => screen.getByLabelText('当前位置').textContent;
const phase = (id: string) => effects.filter(effect => effect.id === id);
async function finishExit() { await act(async () => phase('ag-paper-exit').at(-1)!.finish()); }
beforeEach(() => {
  sessionStorage.clear(); effects = [];
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: vi.fn() });
  animate = vi.fn((_frames, options) => {
    let finish!: () => void, reject!: (reason: unknown) => void;
    const finished = new Promise<void>((resolve, fail) => { finish = resolve; reject = fail; });
    const effect = { id: options.id, finish, finished, cancel: vi.fn(() => reject(new DOMException('Canceled', 'AbortError'))) }; effects.push(effect); return effect;
  });
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
});
afterEach(async () => { cleanup(); cancelPendingPaperNavigation(); await act(async () => {}); vi.unstubAllGlobals(); delete (document as Partial<Document>).startViewTransition; delete (HTMLElement.prototype as Partial<HTMLElement>).animate; });

describe('all internal navigation uses one DOM paper owner', () => {
  it('home → decision → report commits after one exit and reveals once per destination', async () => {
    open(); effects = []; animate.mockClear();
    fireEvent.click(screen.getByRole('link', { name: '决策' }));
    expect(path()).toBe('/liaoning'); expect(phase('ag-paper-exit')).toHaveLength(1); expect(phase('ag-paper-enter')).toHaveLength(0);
    await finishExit(); expect(path()).toBe('/decision'); expect(phase('ag-paper-enter')).toHaveLength(1);
    effects = []; animate.mockClear();
    fireEvent.click(screen.getByRole('link', { name: '报告' }));
    expect(path()).toBe('/decision'); expect(phase('ag-paper-exit')).toHaveLength(1);
    await finishExit(); expect(path()).toBe('/reports'); expect(phase('ag-paper-enter')).toHaveLength(1);
    expect(document.startViewTransition).not.toHaveBeenCalled();
  });
  it('programmatic viewTransition:true cannot enable a second native owner', async () => {
    open('/reports'); effects = [];
    fireEvent.click(screen.getByRole('button', { name: '程序导航' }));
    expect(path()).toBe('/reports'); await finishExit();
    expect(path()).toBe('/about'); expect(phase('ag-paper-enter')).toHaveLength(1);
    expect(document.startViewTransition).not.toHaveBeenCalled();
  });
  it('repeated Link clicks reuse the pending exit and create one history destination', async () => {
    open('/reports'); effects = [];
    for (let count = 0; count < 20; count++) fireEvent.click(screen.getByRole('link', { name: '关于' }));
    expect(path()).toBe('/reports'); expect(phase('ag-paper-exit')).toHaveLength(1);
    expect(phase('ag-paper-exit')[0].cancel).not.toHaveBeenCalled();
    await finishExit(); expect(path()).toBe('/about');
    effects = [];
    fireEvent.click(screen.getByRole('button', { name: '应用后退' })); await finishExit();
    expect(path()).toBe('/reports');
  });
  it('the real BrowserRouter never starts a native snapshot for Link, NavLink or navigate', async () => {
    window.history.replaceState(null, '', '/liaoning');
    const router = createBrowserRouter([{ path: '*', element: <AppHistoryProvider><Page /></AppHistoryProvider> }]);
    try {
      render(<RouterProvider router={router} />);
      effects = [];
      fireEvent.click(screen.getByRole('link', { name: '决策' }));
      expect(path()).toBe('/liaoning'); await finishExit();
      await waitFor(() => expect(path()).toBe('/decision'));
      fireEvent.click(screen.getByRole('link', { name: '报告' })); await finishExit();
      await waitFor(() => expect(path()).toBe('/reports'));
      fireEvent.click(screen.getByRole('button', { name: '程序导航' })); await finishExit();
      await waitFor(() => expect(path()).toBe('/about'));
      expect(document.startViewTransition).not.toHaveBeenCalled();
      expect(phase('ag-paper-exit')).toHaveLength(3);
      expect(phase('ag-paper-enter')).toHaveLength(3);
    } finally { cleanup(); router.dispose(); window.history.replaceState(null, '', '/'); }
  });
  it('same workspace links invalidate a pending cross-page intent without folding again', async () => {
    open('/reports'); effects = [];
    fireEvent.click(screen.getByRole('link', { name: '关于' }));
    fireEvent.click(screen.getByRole('link', { name: '沈阳报告' }));
    await act(async () => {});
    expect(path()).toBe('/reports/shenyang'); expect(phase('ag-paper-exit')).toHaveLength(1); expect(phase('ag-paper-enter')).toHaveLength(0);
    expect(phase('ag-paper-exit')[0].cancel).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('link', { name: '综合研究' }));
    expect(path()).toBe('/reports?view=synthesis'); expect(phase('ag-paper-enter')).toHaveLength(0);
  });
  it('numeric back cancels an unfinished destination before POP', async () => {
    open('/reports');
    fireEvent.click(screen.getByRole('link', { name: '沈阳报告' }));
    effects = [];
    fireEvent.click(screen.getByRole('link', { name: '关于' }));
    fireEvent.click(screen.getByRole('button', { name: '数字后退' }));
    await act(async () => {});
    expect(path()).toBe('/reports'); expect(phase('ag-paper-enter')).toHaveLength(0);
  });
  it('app back/forward fold once while maintaining real observed history', async () => {
    open('/reports');
    fireEvent.click(screen.getByRole('link', { name: '关于' })); await finishExit();
    effects = [];
    fireEvent.click(screen.getByRole('button', { name: '应用后退' }));
    expect(path()).toBe('/about'); await finishExit();
    expect(path()).toBe('/reports'); expect(phase('ag-paper-enter')).toHaveLength(1);
    effects = [];
    fireEvent.click(screen.getByRole('button', { name: '应用前进' })); await finishExit();
    expect(path()).toBe('/about'); expect(phase('ag-paper-enter')).toHaveLength(1);
    expect(document.startViewTransition).not.toHaveBeenCalled();
  });
  it('repeated Back clicks share one pending POP without skipping an observed level', async () => {
    open('/liaoning');
    fireEvent.click(screen.getByRole('link', { name: '报告' })); await finishExit();
    fireEvent.click(screen.getByRole('link', { name: '关于' })); await finishExit();
    effects = [];
    for (let count = 0; count < 20; count++) fireEvent.click(screen.getByRole('button', { name: '应用后退' }));
    expect(path()).toBe('/about'); expect(phase('ag-paper-exit')).toHaveLength(1);
    expect(phase('ag-paper-exit')[0].cancel).not.toHaveBeenCalled();
    await finishExit(); expect(path()).toBe('/reports');
  });
  it('modified, target and prevented clicks do not start a paper effect', async () => {
    open('/reports'); effects = []; animate.mockClear();
    // Cancel only the browser default after React's handlers have run. jsdom
    // cannot open tabs; that platform limitation is unrelated to this owner.
    const preventBrowserDefault = (event: Event) => event.preventDefault();
    document.addEventListener('click', preventBrowserDefault);
    try {
      fireEvent.click(screen.getByRole('link', { name: '关于' }), { ctrlKey: true });
      fireEvent.click(screen.getByRole('link', { name: '新窗口' }));
      fireEvent.click(screen.getByRole('link', { name: '被阻止' }));
      await waitFor(() => expect(path()).toBe('/reports'));
    } finally { document.removeEventListener('click', preventBrowserDefault); }
    expect(animate).not.toHaveBeenCalled();
  });
});
