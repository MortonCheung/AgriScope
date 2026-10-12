import { getCatalog } from './catalog';
import type { V2Catalog } from './v2/types';

const canonicalId = (id: string) => id.replace(/^A0+(\d+)$/, 'A$1');

/** Historical curated trees and runtime explorers are two real, separate publication formats. */
export function hasInteractiveResearch(cityId: string, runtime: V2Catalog | null): boolean {
  const modules = runtime?.cities.find(city => city.city === cityId)?.modules ?? [];
  const published = modules.filter(module => module.status !== 'NOT_SUPPORTED');
  if (published.some(module => module.explorer_available)) return true;
  const articleIds = new Set(published.map(module => canonicalId(module.module_id)));
  return Boolean(getCatalog(cityId)?.topics.some(topic => articleIds.has(canonicalId(topic.articleId)) && (
    topic.explorers?.some(explorer => Boolean(explorer.table && explorer.focus)) ||
    topic.points.some(point => point.status === 'ready' && Boolean(point.binding?.table))
  )));
}
