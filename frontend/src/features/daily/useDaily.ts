import { useCallback, useEffect, useRef, useState } from 'react';
import type { DailyProvider, DailyState } from '../../domain/daily/types';
import { getDailyProvider } from '../../providers/daily';

interface Resource {
  cityId: string;
  provider: DailyProvider;
  state: DailyState;
  refreshing: boolean;
  refreshError?: string;
}

/** Foreground revalidation reads published facts; it never starts collection or inference. */
export function useDailyResource(cityId: string, provider: DailyProvider = getDailyProvider()) {
  const initialState = (): DailyState => ({ status: cityId === 'shenyang' ? 'loading' : 'unsupported' });
  const [resource, setResource] = useState<Resource>(() => ({ cityId, provider, state: initialState(), refreshing: false }));
  const request = useRef<{ ticket: number; controller?: AbortController; started: number }>({ ticket: 0, started: 0 });
  const alive = useRef(false);
  const refresh = useCallback(() => {
    if (!alive.current || cityId !== 'shenyang') return;
    request.current.controller?.abort();
    const controller = new AbortController();
    const ticket = ++request.current.ticket;
    request.current.controller = controller;
    request.current.started = Date.now();
    setResource(previous => ({ cityId, provider,
      state: previous.cityId === cityId && previous.provider === provider && previous.state.status === 'ready'
        ? previous.state : { status: 'loading' }, refreshing: true }));
    void provider.latest(cityId, { signal: controller.signal }).then(data => {
      if (alive.current && !controller.signal.aborted && request.current.ticket === ticket) {
        setResource({ cityId, provider, state: { status: 'ready', data }, refreshing: false });
      }
    }).catch((error: unknown) => {
      if (!alive.current || controller.signal.aborted || request.current.ticket !== ticket) return;
      const message = error instanceof Error ? error.message : '最新市场数据暂时无法加载。';
      setResource(previous => previous.cityId === cityId && previous.provider === provider && previous.state.status === 'ready'
        ? { ...previous, refreshing: false, refreshError: message }
        : { cityId, provider, state: { status: 'error', error: message }, refreshing: false });
    });
  }, [cityId, provider]);
  useEffect(() => {
    alive.current = true;
    if (cityId !== 'shenyang') setResource({ cityId, provider, state: { status: 'unsupported' }, refreshing: false });
    else refresh();
    // Focus + visibility can arrive together; a single foreground request is sufficient.
    const foreground = () => {
      if (document.visibilityState === 'visible' && Date.now() - request.current.started >= 1000) refresh();
    };
    window.addEventListener('focus', foreground);
    document.addEventListener('visibilitychange', foreground);
    return () => {
      alive.current = false;
      request.current.ticket += 1;
      request.current.controller?.abort();
      window.removeEventListener('focus', foreground);
      document.removeEventListener('visibilitychange', foreground);
    };
  }, [cityId, provider, refresh]);
  // Never paint another city's facts during the render before its effect runs.
  const matched = resource.cityId === cityId && resource.provider === provider;
  return { state: matched ? resource.state : initialState(), refresh,
    refreshing: matched && resource.refreshing, refreshError: matched ? resource.refreshError : undefined };
}

export function useDaily(cityId: string, provider: DailyProvider = getDailyProvider()): DailyState {
  return useDailyResource(cityId, provider).state;
}
