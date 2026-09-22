import type { V2Article, V2Manifest, V2Source } from '../../domain/research/v2/types';
import { V2Repository, type V2Table } from '../../domain/research/v2/repository';
import type { AsyncState } from '../../services/asyncState';
import { useCachedResource } from '../../services/useCachedResource';

/** v2 载荷的读取 hooks：同步命中缓存，切换条目不闪加载态。 */

export function useV2Manifest(): AsyncState<V2Manifest> {
  return useCachedResource<V2Manifest>({
    key: 'v2:manifest',
    peek: () => V2Repository.peekManifest(),
    load: () => V2Repository.getManifest(),
    missingMessage: '缺少研究清单',
  });
}

export function useV2Sources(): AsyncState<V2Source[]> {
  return useCachedResource<V2Source[]>({
    key: 'v2:sources',
    peek: () => V2Repository.peekSources(),
    load: () => V2Repository.getSources(),
    missingMessage: '缺少来源表',
  });
}

export function useV2Article(articleId: string | null): AsyncState<V2Article> {
  return useCachedResource<V2Article>({
    key: articleId ? `v2:article:${articleId}` : null,
    peek: () => (articleId ? V2Repository.peekArticle(articleId) : null),
    load: () => V2Repository.getArticle(articleId as string),
    missingMessage: '缺少文章编号',
    /** 未命中时保留上一篇正文，等新正文到达再换（沿用 v4 §四十四 的做法）。 */
    keepPrevious: true,
  });
}

export function useV2Table(file: string | null): AsyncState<V2Table> {
  return useCachedResource<V2Table>({
    key: file ? `v2:table:${file}` : null,
    peek: () => (file ? V2Repository.peekTable(file) : null),
    load: () => V2Repository.getTable(file as string),
    missingMessage: '缺少数据表',
  });
}

export function useV2References(): AsyncState<string> {
  return useCachedResource<string>({
    key: 'v2:references',
    peek: () => V2Repository.peekReferences(),
    load: () => V2Repository.getReferences(),
    missingMessage: '缺少来源清单',
  });
}
