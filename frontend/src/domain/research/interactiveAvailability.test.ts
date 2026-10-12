import { describe, expect, it } from 'vitest';
import runtimeCatalog from '../../../../runtime/research/research_catalog.json';
import type { V2Catalog } from './v2/types';
import { hasInteractiveResearch } from './interactiveAvailability';

// Publisher tests validate the imported payload; JSON's union inference invents optional hash keys.
const catalog = runtimeCatalog as unknown as V2Catalog;
describe('real interactive research availability', () => {
  it('recognizes published curated Shenyang bindings despite missing runtime explorer metadata', () => {
    expect(catalog.cities.find(city => city.city === 'shenyang')?.modules.some(module => module.explorer_available)).toBe(false);
    expect(hasInteractiveResearch('shenyang', catalog)).toBe(true);
  });
  it('keeps all five runtime explorer cities reachable', () => {
    for (const city of ['tieling', 'chaoyang', 'jinzhou', 'dandong', 'dalian']) expect(hasInteractiveResearch(city, catalog)).toBe(true);
  });
  it('does not advertise a local tree with no corresponding published interactive article', () => {
    expect(hasInteractiveResearch('shenyang', null)).toBe(false);
    const reportOnly = { ...catalog, cities: catalog.cities.map(city => city.city === 'shenyang' ? { ...city, modules: city.modules.filter(module => module.module_id === 'A09') } : city) };
    expect(hasInteractiveResearch('shenyang', reportOnly)).toBe(false);
  });
  it('does not invent capabilities for unsupported or unknown cities', () => {
    expect(hasInteractiveResearch('unknown', catalog)).toBe(false);
    const unsupported = { ...catalog, cities: catalog.cities.map(city => ({ ...city, modules: city.modules.map(module => ({ ...module, presentation: module.presentation ? { ...module.presentation, kind: 'excluded' as const, visible: false } : undefined })) })) };
    expect(hasInteractiveResearch('shenyang', unsupported)).toBe(false);
    expect(hasInteractiveResearch('chaoyang', unsupported)).toBe(false);
  });
});
