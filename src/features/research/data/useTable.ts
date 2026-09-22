import { ResearchRepository } from '../../../services/ResearchRepository';
import type { AsyncState } from '../../../services/useCityResearch';
import { useCachedResource } from '../../../services/useCachedResource';
import type { ResearchTable } from '../../../domain/research/types';

/**
 * 按需读取一张研究表；同一路径全应用共享缓存。
 *
 * 缓存命中时同步进入 ready，因此**重看**同一研究点不会再让图表区域闪一次骨架；
 * 未命中时只在图表区域内出局部 skeleton，绝不让整个 Research Workspace 变成加载态（V4 §四十六）。
 */
export function useTable(src: string | null): AsyncState<ResearchTable> {
  return useCachedResource<ResearchTable>({
    key: src,
    peek: () => (src ? ResearchRepository.peekResearchTable(src) : null),
    load: () => ResearchRepository.getResearchTable(src as string),
    missingMessage: '缺少数据来源',
  });
}

/** 同时读取多张表：全部命中才同步返回，否则整体等待。 */
export function useTables(sources: (string | null)[]): AsyncState<ResearchTable[]> {
  const list = sources.filter((src): src is string => Boolean(src));
  const key = list.join('|');

  return useCachedResource<ResearchTable[]>({
    key: list.length === 0 ? null : key,
    peek: () => {
      const values = list.map((src) => ResearchRepository.peekResearchTable(src));
      return values.every((value): value is ResearchTable => value !== null) ? values : null;
    },
    load: () => Promise.all(list.map((src) => ResearchRepository.getResearchTable(src))),
    missingMessage: '缺少数据来源',
  });
}
