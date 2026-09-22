import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { NavigationType, useLocation, useNavigate, useNavigationType, type Location } from 'react-router-dom';
import { getRouteDirection, type RouteDirection } from './routeTransitions';

export interface AppBackTarget {
  to: string;
  state?: unknown;
}

interface HistoryEntry {
  key: string;
  pathname: string;
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
  goBack: (fallback: AppBackTarget) => void;
}

const AppHistoryContext = createContext<AppHistoryValue | null>(null);

export function createAppHistoryState(location: Pick<Location, 'key' | 'pathname'>): AppHistoryState {
  return {
    entries: [{ key: location.key, pathname: location.pathname }],
    index: 0,
    direction: 0,
    action: NavigationType.Pop,
    pending: null,
  };
}

/** Record only locations observed during this app session; external browser history is never trusted. */
export function recordAppLocation(
  state: AppHistoryState,
  location: Pick<Location, 'key' | 'pathname'>,
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
    state.entries = [...state.entries.slice(0, state.index + 1), { key: location.key, pathname: location.pathname }];
    state.index = state.entries.length - 1;
    state.direction = pending?.direction ?? getRouteDirection(previousPath, location.pathname, { action });
    return state;
  }

  if (action === 'REPLACE') {
    state.entries[state.index] = { key: location.key, pathname: location.pathname };
    state.direction = pending?.direction ?? 0;
    return state;
  }

  const nextIndex = state.entries.findIndex((entry) => entry.key === location.key);
  if (nextIndex < 0) {
    state.entries = [{ key: location.key, pathname: location.pathname }];
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
  if (!state.current) state.current = createAppHistoryState(location);

  const snapshot = useMemo(
    () => recordAppLocation(state.current!, location, navigationType),
    [location, navigationType],
  );

  useLayoutEffect(() => {
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
    if (canGoBack) navigate(-1);
    else navigate(fallback.to, { replace: true, state: fallback.state, viewTransition: true });
  }, [navigate]);

  const value = useMemo<AppHistoryValue>(() => ({
    direction: snapshot.direction,
    action: snapshot.action,
    canGoBack: snapshot.index > 0,
    goBack,
  }), [goBack, snapshot.action, snapshot.direction, snapshot.index]);

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
