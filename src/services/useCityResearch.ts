import { useEffect, useState } from 'react';
import type { CityResearchIndex } from '../domain/research/types';
import { ResearchRepository } from './ResearchRepository';

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: string };

function useAsync<T>(factory: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    factory()
      .then((data) => { if (alive) setState({ status: 'ready', data }); })
      .catch((error: unknown) => {
        if (alive) setState({ status: 'error', error: error instanceof Error ? error.message : '加载失败' });
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function useCityResearch(cityId: string): AsyncState<CityResearchIndex> {
  return useAsync(() => ResearchRepository.getCityIndex(cityId), [cityId]);
}
