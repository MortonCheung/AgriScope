import { useEffect, useSyncExternalStore } from 'react';
import { UNAVAILABLE_DISPLAY_MARKET, validateDisplayMarket, type DisplayMarketSnapshot } from '../../domain/market/displayMarket';
import { getDisplayMarketProvider } from '../../providers/market/displayMarketProvider';

export type DisplayMarketStatus = 'idle' | 'loading' | 'failed';
const REFRESH_MS = 60_000;
const DEADLINE_MS = 10_000;

/** Known unordered collections cannot make an identical publication notify twice. */
function fingerprint(snapshot: DisplayMarketSnapshot) {
  const cell = (row: { region: string; product: string; price_level: string }) => `${row.region}:${row.product}:${row.price_level}`;
  const ordered = { ...snapshot, products: [...snapshot.products].sort(), price_levels: [...snapshot.price_levels].sort(),
    records: [...snapshot.records].sort((a, b) => cell(a).localeCompare(cell(b))),
    missing: [...snapshot.missing].sort((a, b) => cell(a).localeCompare(cell(b))),
  };
  return JSON.stringify(ordered, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
}

/** One complete publication, shared by every city/product/type selection. */
export function createDisplayMarketStore(load: (signal?: AbortSignal) => Promise<DisplayMarketSnapshot>, seed = UNAVAILABLE_DISPLAY_MARKET) {
  let snapshot = validateDisplayMarket(seed);
  let snapshotIdentity = fingerprint(snapshot);
  let pending: Promise<void> | null = null;
  let epoch = 0;
  let lastSuccess: number | null = null;
  let status: DisplayMarketStatus = 'idle';
  const listeners = new Set<() => void>();
  const statusListeners = new Set<() => void>();
  const setStatus = (next: DisplayMarketStatus) => {
    if (next === status) return;
    status = next;
    statusListeners.forEach(notify => notify());
  };
  return {
    getSnapshot: () => snapshot,
    getStatus: () => status,
    subscribe: (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; },
    subscribeStatus: (notify: () => void) => { statusListeners.add(notify); return () => { statusListeners.delete(notify); }; },
    refresh: ({ force = false }: { force?: boolean } = {}) => {
      if (pending) return pending;
      if (!force && lastSuccess !== null && Date.now() - lastSuccess < REFRESH_MS) return Promise.resolve();
      const requestId = ++epoch;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout>;
      const expired = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new DOMException('行情请求超时', 'TimeoutError')); }, DEADLINE_MS);
      });
      pending = Promise.race([Promise.resolve().then(() => load(controller.signal)), expired]).then(raw => {
        if (requestId !== epoch) return;
        const next = validateDisplayMarket(raw);
        const nextIdentity = fingerprint(next);
        lastSuccess = Date.now();
        if (nextIdentity !== snapshotIdentity) {
          snapshot = next; snapshotIdentity = nextIdentity;
          listeners.forEach(notify => notify());
        }
        setStatus('idle');
      }).catch(() => {
        // Failed updates retain every byte/date/source from the last verified publication.
        if (requestId === epoch) setStatus('failed');
      }).finally(() => {
        clearTimeout(timer);
        if (requestId === epoch) pending = null;
      });
      setStatus('loading');
      return pending;
    },
  };
}
const marketStore = createDisplayMarketStore(signal => getDisplayMarketProvider().latest(signal));
export function useDisplayMarket(): DisplayMarketSnapshot {
  const snapshot = useSyncExternalStore(marketStore.subscribe, marketStore.getSnapshot, marketStore.getSnapshot);
  useEffect(() => {
    const refresh = (force = false) => { if (document.visibilityState !== 'hidden') void marketStore.refresh({ force }); };
    const restore = () => refresh(true);
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    window.addEventListener('focus', restore); document.addEventListener('visibilitychange', restore);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', restore); document.removeEventListener('visibilitychange', restore); };
  }, []);
  return snapshot;
}

/** Subscribe to request health separately; it never starts its own polling or clock. */
export function useDisplayMarketStatus(): DisplayMarketStatus {
  return useSyncExternalStore(marketStore.subscribeStatus, marketStore.getStatus, marketStore.getStatus);
}
