import { useEffect, useSyncExternalStore } from 'react';
import { UNAVAILABLE_DISPLAY_MARKET, type DisplayMarketSnapshot, type MarketSnapshot } from '../../domain/market/displayMarket';
import { validateMarketPresentation, validateMarketSnapshot } from '../../domain/market/marketPresentationSnapshot';
import publishedPresentation from '../../domain/market/publishedPresentation.json';
import { getDisplayMarketProvider } from '../../providers/market/displayMarketProvider';

export type DisplayMarketStatus = 'idle' | 'loading' | 'failed';
const REFRESH_MS = 60_000;
const DEADLINE_MS = 10_000;

/** Known unordered collections cannot make an identical publication notify twice. */
function fingerprint(snapshot: MarketSnapshot) {
  const cell = (row: { region: string; product: string; price_level: string }) => `${row.region}:${row.product}:${row.price_level}`;
  // An API release includes private calculation evidence that the bundled public
  // release omits. Equal visible publications must not refresh the whole paper.
  const visible = snapshot.schema_version === 'presentation-1' ? {
    schema_version: snapshot.schema_version, published_at: snapshot.published_at, input_hash: snapshot.input_hash,
    regions: [...snapshot.regions].sort(), products: snapshot.products, price_levels: snapshot.price_levels,
    records: snapshot.records.map(({ origin: _origin, ...row }) => row),
  } : snapshot;
  const ordered = { ...visible, products: [...visible.products].sort(), price_levels: [...visible.price_levels].sort(),
    records: [...visible.records].sort((a, b) => cell(a).localeCompare(cell(b))),
    ...(snapshot.schema_version === 'presentation-1' ? {} : { missing: [...snapshot.missing].sort((a, b) => cell(a).localeCompare(cell(b))) }),
  };
  return JSON.stringify(ordered, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
}

/** One complete publication, shared by every city/product/type selection. */
export function createDisplayMarketStore<T extends MarketSnapshot = DisplayMarketSnapshot>(load: (signal?: AbortSignal) => Promise<T>, seed: T = UNAVAILABLE_DISPLAY_MARKET as T) {
  let snapshot = validateMarketSnapshot(seed) as T;
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
        const next = validateMarketSnapshot(raw) as T;
        // Official availability is a separate contract; an empty/partial official release
        // cannot replace a complete presentation or erase its historical curves.
        if (snapshot.schema_version === 'presentation-1' && next.schema_version !== 'presentation-1') throw new Error('行情展示版本不符。');
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
const marketStore = createDisplayMarketStore(signal => getDisplayMarketProvider().latest(signal), validateMarketPresentation(publishedPresentation));
export function useDisplayMarket(): MarketSnapshot {
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
