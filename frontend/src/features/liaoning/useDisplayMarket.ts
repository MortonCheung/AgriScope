import { useEffect, useSyncExternalStore } from 'react';
import { UNAVAILABLE_DISPLAY_MARKET, validateDisplayMarket, type DisplayMarketSnapshot } from '../../domain/market/displayMarket';
import { getDisplayMarketProvider } from '../../providers/market/displayMarketProvider';

/** One complete publication, shared by every city/product/type selection. */
export function createDisplayMarketStore(load: () => Promise<DisplayMarketSnapshot>, seed = UNAVAILABLE_DISPLAY_MARKET) {
  let snapshot = validateDisplayMarket(seed);
  let pending: Promise<void> | null = null;
  let lastSuccess = 0;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; },
    refresh: () => {
      if (pending) return pending;
      if (lastSuccess && Date.now() - lastSuccess < 60_000) return Promise.resolve();
      pending = Promise.resolve().then(load).then(raw => {
        const next = validateDisplayMarket(raw);
        const changed = JSON.stringify(next) !== JSON.stringify(snapshot);
        lastSuccess = Date.now();
        if (changed) { snapshot = next; listeners.forEach(notify => notify()); }
      }).catch(() => {
        // Keep the last verified real publication; collection errors belong in the backend.
      }).finally(() => { pending = null; });
      return pending;
    },
  };
}
const marketStore = createDisplayMarketStore(() => getDisplayMarketProvider().latest());
export function useDisplayMarket(): DisplayMarketSnapshot {
  const snapshot = useSyncExternalStore(marketStore.subscribe, marketStore.getSnapshot, marketStore.getSnapshot);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== 'hidden') void marketStore.refresh(); };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return snapshot;
}
