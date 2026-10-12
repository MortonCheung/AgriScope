import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { NavigationType, useLocation, useNavigate, useNavigationType, type Location } from 'react-router-dom';
import { prefersInstantPaper, withPaperExit } from './paperNavigation';
import { getRouteDirection, type RouteDirection } from './routeTransitions';

export interface AppBackTarget {
  to: string;
  state?: unknown;
}

interface HistoryEntry {
  key: string;
  pathname: string;
  search?: string;
}

interface PendingDirection {
  sourceKey: string;
  action: NavigationType;
  direction: RouteDirection;
}

export interface AppHistoryState {
  entries: HistoryEntry[];
  index: number;
  direction: RouteDirection;
  action: NavigationType;
  pending: PendingDirection | null;
}

interface AppHistoryValue {
  direction: RouteDirection;
  action: NavigationType;
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: (fallback: AppBackTarget) => void;
  goForward: () => void;
}

const AppHistoryContext = createContext<AppHistoryValue | null>(null);
export const APP_HISTORY_STORAGE_KEY = 'agriscope.observed-history.v4-final';
type HistoryLocation = Pick<Location, 'key' | 'pathname'> & Partial<Pick<Location, 'search'>>;
const entryFor = (location: HistoryLocation): HistoryEntry => ({ key: location.key, pathname: location.pathname,
  ...(location.search !== undefined ? { search: location.search } : {}) });

export function createAppHistoryState(location: HistoryLocation): AppHistoryState {
  return {
    entries: [entryFor(location)],
    index: 0,
    direction: 0,
    action: NavigationType.Pop,
    pending: null,
  };
}

/** Restore only a previously observed matching location; browser history length is never trusted. */
export function restoreAppHistoryState(location: HistoryLocation, raw?: string | null): AppHistoryState {
  try {
    const saved: unknown = JSON.parse(raw === undefined ? window.sessionStorage.getItem(APP_HISTORY_STORAGE_KEY) ?? 'null' : raw ?? 'null');
    if (!saved || typeof saved !== 'object' || !('entries' in saved) || !Array.isArray(saved.entries) || !saved.entries.length || saved.entries.length > 2000) return createAppHistoryState(location);
    const entries = saved.entries as unknown[];
    if (entries.some(entry => !entry || typeof entry !== 'object' || !('key' in entry) || typeof entry.key !== 'string' || !entry.key
      || !('pathname' in entry) || typeof entry.pathname !== 'string' || !entry.pathname.startsWith('/') || entry.pathname.startsWith('//')
      || ('search' in entry && typeof entry.search !== 'string'))) return createAppHistoryState(location);
    const known = entries as HistoryEntry[];
    if (new Set(known.map(entry => entry.key)).size !== known.length) return createAppHistoryState(location);
    const index = known.findIndex(entry => entry.key === location.key && entry.pathname === location.pathname && (entry.search ?? '') === (location.search ?? ''));
    if (index < 0) return createAppHistoryState(location);
    return { entries: known, index, direction: 0, action: NavigationType.Pop, pending: null };
  } catch { return createAppHistoryState(location); }
}

export function persistAppHistoryState(state: AppHistoryState): void {
  try { window.sessionStorage.setItem(APP_HISTORY_STORAGE_KEY, JSON.stringify({ entries: state.entries })); } catch { /* Storage failure only disables reload recovery. */ }
}

/** Record only locations observed during this app session; external browser history is never trusted. */
export function recordAppLocation(
  state: AppHistoryState,
  location: HistoryLocation,
  action: NavigationType,
) {
  const current = state.entries[state.index];
  if (current?.key === location.key) return state;

  const previousPath = current?.pathname ?? location.pathname;
  const pending = state.pending?.sourceKey === current?.key && state.pending.action === action
    ? state.pending
    : null;
  state.pending = null;
  state.action = action;

  if (action === 'PUSH') {
    state.entries = [...state.entries.slice(0, state.index + 1), entryFor(location)];
    state.index = state.entries.length - 1;
    state.direction = pending?.direction ?? getRouteDirection(previousPath, location.pathname, { action });
    return state;
  }

  if (action === 'REPLACE') {
    state.entries[state.index] = entryFor(location);
    state.direction = pending?.direction ?? 0;
    return state;
  }

  const nextIndex = state.entries.findIndex((entry) => entry.key === location.key);
  if (nextIndex < 0) {
    state.entries = [entryFor(location)];
    state.index = 0;
    state.direction = pending?.direction ?? 0;
    return state;
  }

  const popDirection = Math.sign(nextIndex - state.index) as RouteDirection;
  state.index = nextIndex;
  state.direction = pending?.direction ?? getRouteDirection(previousPath, location.pathname, { action, popDirection });
  return state;
}

export function AppHistoryProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  const state = useRef<AppHistoryState | null>(null);
  if (!state.current) state.current = restoreAppHistoryState(location);

  const snapshot = useMemo(
    () => recordAppLocation(state.current!, location, navigationType),
    [location, navigationType],
  );

  useLayoutEffect(() => {
    persistAppHistoryState(snapshot);
    document.documentElement.dataset.routeDirection = snapshot.direction > 0
      ? 'forward'
      : snapshot.direction < 0
        ? 'back'
        : 'lateral';
  }, [location.key, snapshot.direction]);

  const goBack = useCallback((fallback: AppBackTarget) => {
    const current = state.current!;
    const canGoBack = current.index > 0;
    current.pending = {
      sourceKey: current.entries[current.index].key,
      action: canGoBack ? NavigationType.Pop : NavigationType.Replace,
      direction: -1,
    };
    const from = current.entries[current.index];
    const to = canGoBack ? current.entries[current.index - 1] : { pathname: fallback.to, search: '' };
    void withPaperExit(`${from.pathname}${from.search ?? ''}`, `${to.pathname}${to.search ?? ''}`, () => canGoBack ? navigate(-1) : navigate(fallback.to, { replace: true, state: fallback.state, viewTransition: typeof document.startViewTransition === 'function' && !prefersInstantPaper() }));
  }, [navigate]);

  /**
   * 前进（V4 §九）：与浏览器 / 资源管理器一致。
   * 前进栈由 recordAppLocation 维护——主动 PUSH 时会 slice(0, index+1)，
   * 因此"从沈阳又进了 G3"之后，原来的 forward 栈自动废弃。
   */
  const goForward = useCallback(() => {
    const current = state.current!;
    if (current.index >= current.entries.length - 1) return;
    current.pending = {
      sourceKey: current.entries[current.index].key,
      action: NavigationType.Pop,
      direction: 1,
    };
    const from = current.entries[current.index];
    const to = current.entries[current.index + 1];
    void withPaperExit(`${from.pathname}${from.search ?? ''}`, `${to.pathname}${to.search ?? ''}`, () => navigate(1));
  }, [navigate]);

  const value = useMemo<AppHistoryValue>(() => ({
    direction: snapshot.direction,
    action: snapshot.action,
    canGoBack: snapshot.index > 0,
    canGoForward: snapshot.index < snapshot.entries.length - 1,
    goBack,
    goForward,
  }), [goBack, goForward, snapshot.action, snapshot.direction, snapshot.entries.length, snapshot.index]);

  return <AppHistoryContext.Provider value={value}>{children}</AppHistoryContext.Provider>;
}

export function useAppHistory() {
  return useContext(AppHistoryContext);
}

export function useAppBack(fallback: AppBackTarget) {
  const history = useContext(AppHistoryContext);
  const navigate = useNavigate();
  return useCallback(() => {
    if (history) history.goBack(fallback);
    else navigate(fallback.to, { replace: true, state: fallback.state });
  }, [fallback.state, fallback.to, history, navigate]);
}
