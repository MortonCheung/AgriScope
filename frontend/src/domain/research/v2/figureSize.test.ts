import { describe, expect, it } from 'vitest';
import { researchFigureSize } from './figureSize';
import { RESEARCH_FIGURE_DIMENSIONS } from './figureDimensions';

describe('published figure dimensions', () => {
  it('uses different real PNG dimensions for API and legacy URLs before loading', () => {
    expect(researchFigureSize('/api/research/shenyang/figures/A07_district_structure.png')).toEqual([1937, 567]);
    expect(researchFigureSize('/research/chaoyang/figures/A03_lag_profile.png?version=2')).toEqual([975, 585]);
    expect(researchFigureSize('/api/research/jinzhou/figures/A01_seasonal_amplitude.png')).toEqual([1091, 585]);
  });
  it('never invents dimensions or throws for missing and malformed identities', () => {
    expect(researchFigureSize('/api/research/unknown/figures/missing.png')).toBeUndefined();
    expect(researchFigureSize('/api/research/%ZZ/figures/figure.png')).toBeUndefined();
  });
  it('covers the immutable published PNG headers exactly', () => {
    expect(Object.keys(RESEARCH_FIGURE_DIMENSIONS)).toHaveLength(34);
  });
});
