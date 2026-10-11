import { useEffect, useState } from 'react';
import type { MarketObservation } from '../../domain/market/types';
import { getMarketProvider } from '../../providers/market';

export type MarketObservationState = { status: 'loading' | 'ready' | 'error'; data?: MarketObservation; error?: string; retry: () => void };

/** 切城/作物立即隐藏旧价格；失败可重试，不回退到模型或别城观测。 */
export function useMarketObservation(cityId: string, crop?: string): MarketObservationState {
  const key = `${cityId}:${crop ?? ''}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; status: 'loading' | 'ready' | 'error'; data?: MarketObservation; error?: string }>({ key, status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    setState({ key, status: 'loading' });
    getMarketProvider().observations(cityId, undefined, { signal: controller.signal }).then(async base => {
      if(controller.signal.aborted)return base;
      return crop && base.crops.includes(crop) && crop !== base.selectedCrop ? getMarketProvider().observations(cityId,crop,{signal:controller.signal}) : base;
    }).then(data => {
      if (!controller.signal.aborted) setState({ key, status: 'ready', data });
    }, error => {
      if (!controller.signal.aborted) setState({ key, status: 'error', error: error instanceof Error ? error.message : '本城市场观测暂时无法加载。' });
    });
    return () => controller.abort();
  }, [attempt, cityId, crop, key]);
  return { ...(state.key === key ? state : { status: 'loading' as const }), retry: () => setAttempt(value => value + 1) };
}
