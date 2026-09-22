import type { CityResearchIndex } from '../domain/research/types';
import { ResearchRepository } from './ResearchRepository';
import { useCachedResource } from './useCachedResource';

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: string };

/**
 * 城市研究索引（V4 §四十四）。
 * 索引按 cityId 缓存，重进同一城市同步命中，不再出现加载态。
 */
export function useCityResearch(cityId: string): AsyncState<CityResearchIndex> {
  return useCachedResource<CityResearchIndex>({
    key: cityId || null,
    peek: () => ResearchRepository.peekCityIndex(cityId),
    load: () => ResearchRepository.getCityIndex(cityId),
    missingMessage: '缺少城市编号',
  });
}
