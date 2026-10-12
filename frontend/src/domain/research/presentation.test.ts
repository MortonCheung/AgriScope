import { describe, expect, it } from 'vitest';
import catalogJson from '../../../../runtime/research/research_catalog.json';
import type { V2Catalog } from './v2/types';
import { hasResearchPresentation, presentedModules, presentedInteractiveModules, presentationExplorers, resolvePresentedResearch } from './presentation';

// Publisher tests validate the imported payload; JSON's union inference invents optional hash keys.
const catalog = catalogJson as unknown as V2Catalog;
describe('one verified publication owns every research entrance', () => {
  it('preserves the real uneven city counts and the complete original inventory', () => {
    expect(catalog.cities.reduce((sum, city) => sum + city.modules.length, 0)).toBe(56);
    expect(presentedModules(catalog, 'tieling').map(module => module.module_id)).toEqual(['A07', 'A09']);
    expect(presentedModules(catalog, 'dandong').map(module => module.module_id)).toEqual(['A07', 'A09']);
    const cities = catalog.cities.filter(city => city.city !== 'cross_city');
    expect(cities.reduce((sum, city) => sum + presentedModules(catalog, city.city).length, 0)).toBe(40);
    expect(cities.reduce((sum, city) => sum + presentedInteractiveModules(catalog, city.city).length, 0)).toBe(39);
  });
  it('fails closed for missing publication evidence instead of trusting old explorer flags', () => {
    const legacy = { ...catalog, presentation_version: undefined };
    expect(hasResearchPresentation(legacy)).toBe(false);
    expect(presentedModules(legacy, 'chaoyang')).toEqual([]);
    expect(resolvePresentedResearch(legacy, 'chaoyang')).toBeNull();
    const incomplete = { ...catalog, cities: catalog.cities.map(city => ({ ...city, presentation: undefined })) };
    expect(presentedModules(incomplete, 'tieling')).toEqual([]);
    expect(resolvePresentedResearch(null, 'tieling')).toBeNull();
  });
  it('defaults to actual interactive content and signals excluded deep links explicitly', () => {
    expect(resolvePresentedResearch(catalog, 'shenyang')).toEqual({ moduleId: 'A1', payloadId: 'A01', selectionId: 'A1.3', kind: 'interactive', replaced: false });
    expect(resolvePresentedResearch(catalog, 'tieling', 'A6')).toEqual({ moduleId: 'A7', payloadId: 'A07', selectionId: 'A7', kind: 'interactive', replaced: true });
    expect(resolvePresentedResearch(catalog, 'dandong', 'A06')?.replaced).toBe(true);
    expect(resolvePresentedResearch(catalog, 'shenyang', 'A4.4')?.selectionId).toBe('A1.3');
    expect(resolvePresentedResearch(catalog, 'shenyang', 'A2.2')).toMatchObject({ selectionId: 'A2.2', kind: 'interactive', replaced: false });
  });
  it('retains scientific negative conclusions as supplements and complete articles as secondary content', () => {
    expect(resolvePresentedResearch(catalog, 'shenyang', 'A3.10')).toMatchObject({ selectionId: 'A3.10', kind: 'supplement', replaced: false });
    expect(resolvePresentedResearch(catalog, 'shenyang', 'A6.6')).toMatchObject({ selectionId: 'A6.6', kind: 'supplement', replaced: false });
    expect(resolvePresentedResearch(catalog, 'shenyang', 'A09')).toMatchObject({ selectionId: 'A9', kind: 'supplement', replaced: false });
    expect(presentedModules(catalog, 'chaoyang').find(module => module.module_id === 'A06')?.presentation?.kind).toBe('interactive');
  });
  it('returns audited chart configs and the real pair dimension without inventing selectors', () => {
    const cross = presentedModules(catalog, 'cross_city').find(module => module.module_id === 'A10')!;
    expect(presentationExplorers(cross)[0]).toMatchObject({ table: 'cross_city_seasonal_sync.csv', category: 'city_b', focus: 'seasonal_corr', selectors: ['crop', 'city_a'] });
    const structure = presentedModules(catalog, 'tieling')[0];
    expect(presentationExplorers(structure)[0].selectors).toEqual([]);
    const excluded = catalog.cities.find(city => city.city === 'tieling')!.modules[0];
    expect(excluded.explorer_available).toBe(true);
    expect(presentationExplorers(excluded)).toEqual([]);
  });
});
