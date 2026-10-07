import { useEffect, useState } from 'react';
import type { DailyProvider, DailyState } from '../../domain/daily/types';
import { getDailyProvider } from '../../providers/daily';

export function useDaily(cityId: string, provider: DailyProvider = getDailyProvider()): DailyState {
  const [resource, setResource] = useState<{ cityId: string; provider: DailyProvider; state: DailyState }>(() => ({ cityId, provider, state: { status: cityId === 'shenyang' ? 'loading' : 'unsupported' } }));
  useEffect(() => {
    if (cityId !== 'shenyang') { setResource({ cityId, provider, state: { status: 'unsupported' } }); return; }
    const controller = new AbortController();
    let alive = true;
    const load = () => {
      setResource({ cityId, provider, state: { status: 'loading' } });
      provider.latest(cityId, { signal: controller.signal }).then(data => {
        if (alive) setResource({ cityId, provider, state: { status: 'ready', data } });
      }).catch((error: unknown) => {
        if (alive && !controller.signal.aborted) setResource({ cityId, provider, state: { status: 'error', error: error instanceof Error ? error.message : '最新市场数据暂时无法加载。' } });
      });
    };
    load();
    return () => { alive = false; controller.abort(); };
  }, [cityId, provider]);
  // Never paint another city's facts during the render before its effect runs.
  return resource.cityId === cityId && resource.provider === provider ? resource.state : { status: cityId === 'shenyang' ? 'loading' : 'unsupported' };
}
