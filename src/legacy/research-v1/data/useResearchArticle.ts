import type { ResearchArticle } from '../../../domain/research/types';
import { ResearchRepository } from '../../../services/ResearchRepository';
import type { AsyncState } from '../../../services/useCityResearch';
import { useCachedResource } from '../../../services/useCachedResource';

/**
 * 研究原文（V4 §四十四/§四十五）。
 *
 * - 原文在进入城市时已被后台预取（ResearchRepository §四十五），因此切换研究点
 *   通常**同步**拿到正文，不再出现"旧内容消失 → 加载 → 新内容出现"。
 * - 万一未命中（冷启动直接深链到某个研究点），也保留上一篇正文不撤下，
 *   等新正文到达后由正文区自行 crossfade。
 */
export function useResearchArticle(cityId: string, articleId: string | null): AsyncState<ResearchArticle> {
  return useCachedResource<ResearchArticle>({
    key: articleId ? `${cityId}:${articleId}` : null,
    peek: () => (articleId ? ResearchRepository.peekResearchArticle(cityId, articleId) : null),
    load: () => ResearchRepository.getResearchArticle(cityId, articleId as string),
    missingMessage: '该研究点没有可用的研究原文',
    keepPrevious: true,
  });
}
