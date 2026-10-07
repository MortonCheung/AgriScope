import { useEffect, useState } from 'react';
import { findHorizonCap } from '../../domain/longHorizon/adapter';
import type { LongHorizonProvider, LongHorizonState } from '../../domain/longHorizon/types';
import { getLongHorizonProvider } from '../../providers/longHorizon';

interface Keyed { cityId: string; crop: string; horizonDays?: number; provider: LongHorizonProvider; state: LongHorizonState }

/** The user selects a horizon. Registry quality never silently chooses a harvest date. */
export function useLongHorizon(cityId: string, crop: string, horizonDays?: number,
  provider: LongHorizonProvider = getLongHorizonProvider()): LongHorizonState {
  const [resource, setResource] = useState<Keyed>(() => ({ cityId, crop, horizonDays, provider,
    state: cityId === 'shenyang' && crop ? { status: 'loading' } : { status: 'unsupported' } }));
  useEffect(() => {
    if (cityId !== 'shenyang' || !crop) { setResource({ cityId, crop, horizonDays, provider, state: { status: 'unsupported' } }); return; }
    const controller = new AbortController();
    const set = (state: LongHorizonState) => { if (!controller.signal.aborted) setResource({ cityId, crop, horizonDays, provider, state }); };
    const load = async () => {
      set({ status: 'loading' });
      try {
        const capability = await provider.capabilities(cityId, { signal: controller.signal });
        const cropCap = findHorizonCap(capability, crop);
        if (!capability.supported || !cropCap) { set({ status: 'unsupported' }); return; }
        if (horizonDays === undefined) { set({ status: 'awaiting_selection', capability: cropCap }); return; }
        if (!cropCap.horizons.some(h => h.days === horizonDays)) throw new Error('该作物尚未登记这个上市跨度。');
        const data = await provider.forecast({ cityId, crop, horizonDays }, { signal: controller.signal });
        set({ status: 'ready', data, capability: cropCap });
      } catch (error) { set({ status: 'error', error: error instanceof Error ? error.message : '长期预测暂时无法加载。' }); }
    };
    void load();
    return () => controller.abort();
  }, [cityId, crop, horizonDays, provider]);
  return resource.cityId === cityId && resource.crop === crop && resource.horizonDays === horizonDays && resource.provider === provider
    ? resource.state : { status: cityId === 'shenyang' && crop ? 'loading' : 'unsupported' };
}
