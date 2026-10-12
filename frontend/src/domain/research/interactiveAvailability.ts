import type { V2Catalog } from './v2/types';
import { presentedInteractiveModules } from './presentation';

/** One publication audit owns runtime explorers and historical curated bindings alike. */
export function hasInteractiveResearch(cityId: string, runtime: V2Catalog | null): boolean {
  return presentedInteractiveModules(runtime, cityId).length > 0;
}
