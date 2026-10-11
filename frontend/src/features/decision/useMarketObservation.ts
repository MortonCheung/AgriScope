import { useEffect, useRef, useState } from 'react';
import type { MarketObservation } from '../../domain/market/types';
import { getMarketProvider } from '../../providers/market';

export type MarketObservationState = { status: 'loading' | 'ready' | 'error'; data?: MarketObservation; available?: boolean; error?: string; retry: () => void };
type Reading = { key: string; status: 'loading' | 'ready' | 'error'; data?: MarketObservation; error?: string };

/** Keep city capability separate from crop loading. Cache only within this mounted
 * workspace; changed city/crop never renders a mismatched reading. */
export function useMarketObservation(cityId: string, crop?: string): MarketObservationState {
  const key = `${cityId}:${crop ?? ''}`;
  const bases = useRef(new Map<string, MarketObservation>());
  const readings = useRef(new Map<string, MarketObservation>());
  const forceRefresh = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Reading>({ key, status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    const refresh = forceRefresh.current;
    forceRefresh.current = false;
    const provider = getMarketProvider();
    const load = async () => {
      setState({ key, status: 'loading' });
      try {
        const base = !refresh && bases.current.get(cityId) || await provider.observations(cityId, undefined, { signal: controller.signal });
        if (controller.signal.aborted) return;
        bases.current.set(cityId, base);
        if (refresh) for (const cached of readings.current.keys()) if (cached.startsWith(cityId + ':')) readings.current.delete(cached);
        // Publish capability now, even if the requested crop takes another request.
        setState({ key, status: 'loading' });
        const selected = crop && base.crops.includes(crop) ? crop : base.selectedCrop;
        const readingKey = `${cityId}:${selected ?? ''}`;
        const data = selected && selected !== base.selectedCrop
          ? readings.current.get(readingKey) ?? await provider.observations(cityId, selected, { signal: controller.signal })
          : base;
        if (controller.signal.aborted) return;
        readings.current.set(readingKey, data);
        setState({ key, status: 'ready', data });
      } catch (error) {
        if (!controller.signal.aborted) setState({ key, status: 'error', error: error instanceof Error ? error.message : '本城市场观测暂时无法加载。' });
      }
    };
    void load();
    return () => controller.abort();
  }, [attempt, cityId, crop, key]);
  const base = bases.current.get(cityId);
  const selected = crop && base?.crops.includes(crop) ? crop : base?.selectedCrop;
  const cached = selected === base?.selectedCrop ? base : readings.current.get(`${cityId}:${selected ?? ''}`);
  // URL normalization can change the key without changing the observed crop.
  // Reuse that exact reading immediately, avoiding a one-frame loading flash.
  const current = state.key === key ? state : cached ? { status: 'ready' as const, data: cached } : { status: 'loading' as const };
  return { ...current,
    available: base?.available,
    retry: () => { forceRefresh.current = true; setAttempt(value => value + 1); } };
}
