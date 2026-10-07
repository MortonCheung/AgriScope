import type { V2Article, V2Manifest, V2Source, V2Table } from '../../domain/research/v2/types';
import { V2Repository } from '../../domain/research/v2/repository';
import type { AsyncState } from '../../services/asyncState';
import { useCachedResource } from '../../services/useCachedResource';

/**
 * 研究载荷 hooks（城市无关）。
 *
 * 全部同步命中缓存：切换研究点时不闪加载态（`peek` 命中即 ready）。
 * 参数里的文章 id 一律是 **canonical**（A2），解析由 repository 负责。
 */

export function useManifest(cityId: string): AsyncState<V2Manifest> {
  return useCachedResource<V2Manifest>({
    key: cityId ? `${cityId}:manifest` : null,
    peek: () => V2Repository.peekManifest(cityId),
    load: () => V2Repository.getManifest(cityId),
    missingMessage: '缺少研究清单',
  });
}

export function useSources(cityId: string): AsyncState<V2Source[]> {
  return useCachedResource<V2Source[]>({
    key: cityId ? `${cityId}:sources` : null,
    peek: () => V2Repository.peekSources(cityId),
    load: () => V2Repository.getSources(cityId),
    missingMessage: '缺少来源表',
  });
}

export function useArticle(cityId: string, articleId: string | null): AsyncState<V2Article> {
  return useCachedResource<V2Article>({
    key: cityId && articleId ? `${cityId}:article:${articleId}` : null,
    peek: () => (articleId ? V2Repository.peekArticle(cityId, articleId) : null),
    load: () => V2Repository.getArticle(cityId, articleId as string),
    missingMessage: '缺少文章编号',
    /** 未命中时保留上一篇正文，等新正文到达再换（沿用 v4 的做法）。 */
    keepPrevious: true,
  });
}

export function useTable(cityId: string, file: string | null): AsyncState<V2Table> {
  return useCachedResource<V2Table>({
    key: cityId && file ? `${cityId}:table:${file}` : null,
    peek: () => (file ? V2Repository.peekTable(cityId, file) : null),
    load: () => V2Repository.getTable(cityId, file as string),
    missingMessage: '缺少数据表',
  });
}

export function useScenarioTable(cityId: string, file: string | null): AsyncState<V2Table> {
  return useCachedResource<V2Table>({
    key: cityId && file ? `${cityId}:scenario:${file}` : null,
    peek: () => (file ? V2Repository.peekScenarioTable(cityId, file) : null),
    load: () => V2Repository.getScenarioTable(cityId, file as string),
    missingMessage: '缺少情景表',
  });
}

export function useReferences(cityId: string): AsyncState<string> {
  return useCachedResource<string>({
    key: cityId ? `${cityId}:references` : null,
    peek: () => V2Repository.peekReferences(cityId),
    load: () => V2Repository.getReferences(cityId),
    missingMessage: '缺少来源清单',
  });
}
