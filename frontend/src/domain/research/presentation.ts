import { listTopics, type ResearchTopic, type TopicExplorer } from './catalog';
import { columnMeta } from './v2/metrics';
import type { V2Catalog, V2CatalogModule } from './v2/types';

export const RESEARCH_PRESENTATION_VERSION = 'final-1';
export function canonicalPresentationId(raw: string): string {
  return raw.replace(/^A0*(\d+)(?=\.|$)/, (_, number: string) => `A${Number(number)}`);
}
export function hasResearchPresentation(catalog: V2Catalog | null): boolean {
  return catalog?.presentation_version === RESEARCH_PRESENTATION_VERSION;
}

/** Every entrance consumes publication evidence. Legacy flags never grant visibility. */
export function presentedModules(catalog: V2Catalog | null, cityId: string): V2CatalogModule[] {
  if (!hasResearchPresentation(catalog)) return [];
  const city = catalog!.cities.find(entry => entry.city === cityId);
  if (!city?.presentation) return [];
  return city.modules.filter(module => module.presentation?.visible === true && (module.presentation.kind === 'interactive' || module.presentation.kind === 'supplement'));
}
export function presentedInteractiveModules(catalog: V2Catalog | null, cityId: string): V2CatalogModule[] {
  return presentedModules(catalog, cityId).filter(module => module.presentation?.kind === 'interactive');
}

/** Curated points are offered only when the same published policy accepts them. */
export function presentedTopics(catalog: V2Catalog | null, cityId: string): ResearchTopic[] {
  const modules = presentedModules(catalog, cityId);
  return listTopics(cityId).filter(topic => modules.some(module => canonicalPresentationId(module.module_id) === topic.id)).map(topic => ({
    ...topic,
    points: topic.points.filter(point => {
      const selection = resolvePresentedResearch(catalog, cityId, point.id);
      return selection !== null && !selection.replaced;
    }),
  }));
}

export interface PresentedResearchSelection {
  /** Canonical direction ID, e.g. A7. */
  moduleId: string;
  /** Actual published payload ID, e.g. A07. */
  payloadId: string;
  selectionId: string;
  kind: 'interactive' | 'supplement';
  replaced: boolean;
}

export function resolvePresentedResearch(catalog: V2Catalog | null, cityId: string, requested?: string | null): PresentedResearchSelection | null {
  const modules = presentedModules(catalog, cityId);
  const city = catalog?.cities.find(entry => entry.city === cityId);
  if (!modules.length || !city?.presentation) return null;
  const canonical = requested ? canonicalPresentationId(requested) : null;
  const matching = canonical ? modules.find(module => canonicalPresentationId(module.module_id) === canonical.split('.')[0]) : undefined;
  if (matching?.presentation) {
    const point = canonical!.includes('.');
    const interactive = matching.presentation.interactive_point_ids.includes(canonical!);
    const supplement = matching.presentation.supplement_point_ids.includes(canonical!);
    if (!point || interactive || supplement) return {
      moduleId: canonicalPresentationId(matching.module_id), payloadId: matching.module_id, selectionId: canonical!,
      kind: point ? supplement ? 'supplement' : 'interactive' : matching.presentation.kind as 'interactive' | 'supplement', replaced: false,
    };
  }
  const fallback = modules.find(module => module.module_id === city.presentation!.default_module_id)
    ?? modules.find(module => module.presentation?.kind === 'interactive') ?? modules[0];
  const chosen = city.presentation.default_module_id === fallback.module_id
    ? city.presentation.default_selection_id ?? canonicalPresentationId(fallback.module_id) : canonicalPresentationId(fallback.module_id);
  return {
    moduleId: canonicalPresentationId(fallback.module_id), payloadId: fallback.module_id, selectionId: chosen,
    kind: fallback.presentation!.kind as 'interactive' | 'supplement', replaced: Boolean(requested),
  };
}

/** Return the existing chart configuration format, with audited columns/selectors only. */
export function presentationExplorers(module: V2CatalogModule | null): TopicExplorer[] {
  if (module?.presentation?.kind !== 'interactive' || !module.presentation.visible) return [];
  return module.presentation.verified_series.map(series => ({
    id: `${canonicalPresentationId(module.module_id)}.${series.id}`,
    title: `${columnMeta(series.y)?.label ?? '观测指标'} · 按${columnMeta(series.x)?.label ?? '类别'}`,
    table: series.table, filter: series.filter, selectors: series.selectors, category: series.x, focus: series.y,
  }));
}
