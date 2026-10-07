import { useEffect, useState } from 'react';
import { findHorizonCap, preferredHorizon } from '../../domain/longHorizon/adapter';
import type { LongHorizonProvider, LongHorizonState } from '../../domain/longHorizon/types';
import { getLongHorizonProvider } from '../../providers/longHorizon';

interface Keyed { cityId: string; crop: string; provider: LongHorizonProvider; state: LongHorizonState }

/** Fetch capability, pick the most usable horizon, then read the precomputed forecast. */
export function useLongHorizon(cityId: string, crop: string,
  provider: LongHorizonProvider = getLongHorizonProvider()): LongHorizonState {
  const [resource, setResource] = useState<Keyed>(() => ({
    cityId, crop, provider,
    state: cityId === 'shenyang' && crop ? { status: 'loading' } : { status: 'unsupported' },
  }));
  useEffect(() => {
    if (cityId !== 'shenyang' || !crop) { setResource({ cityId, crop, provider, state: { status: 'unsupported' } }); return; }
    const controller = new AbortController();
    let alive = true;
    const load = async () => {
      setResource({ cityId, crop, provider, state: { status: 'loading' } });
      try {
        const capability = await provider.capabilities(cityId, { signal: controller.signal });
        const cropCap = findHorizonCap(capability, crop);
        const days = cropCap ? preferredHorizon(cropCap) : null;
        if (!capability.supported || !cropCap || days === null) {
          if (alive) setResource({ cityId, crop, provider, state: { status: 'unsupported' } });
          return;
        }
        const data = await provider.forecast({ cityId, crop, horizonDays: days }, { signal: controller.signal });
        if (alive) setResource({ cityId, crop, provider, state: { status: 'ready', data, capability: cropCap } });
      } catch (error) {
        if (alive && !controller.signal.aborted) {
          setResource({
            cityId, crop, provider,
            state: { status: 'error', error: error instanceof Error ? error.message : '长期预测暂时无法加载。' },
          });
        }
      }
    };
    void load();
    return () => { alive = false; controller.abort(); };
  }, [cityId, crop, provider]);
  // Never paint another crop's long-horizon numbers during the render before its effect runs.
  return resource.cityId === cityId && resource.crop === crop && resource.provider === provider
    ? resource.state
    : { status: cityId === 'shenyang' && crop ? 'loading' : 'unsupported' };
}