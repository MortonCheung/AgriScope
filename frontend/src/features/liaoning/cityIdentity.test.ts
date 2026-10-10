import { describe, expect, it } from 'vitest';
import { LIAONING_CITIES, STUDY_CITY_IDS, isStudyCity } from '../../domain/geography/cities';
import { CITY_COLOR_TOKENS, SCENE_TOKENS } from '../../design/sceneTokens';
describe('研究城市身份与行政背景', () => {
  it('六城可选，其余八个行政区与未知名称不能成为交互目标', () => {
    expect(LIAONING_CITIES.filter(city => isStudyCity(city.id)).map(city => city.id)).toEqual([...STUDY_CITY_IDS]);
    expect(LIAONING_CITIES.filter(city => !isStudyCity(city.id))).toHaveLength(8);
    expect(isStudyCity('unknown')).toBe(false);
  });
  it('六城身份色互不相同，且都区别于行政背景色', () => {
    expect(Object.keys(CITY_COLOR_TOKENS)).toEqual([...STUDY_CITY_IDS]);
    expect(new Set(Object.values(CITY_COLOR_TOKENS)).size).toBe(6);
    expect(Object.values(CITY_COLOR_TOKENS)).not.toContain(SCENE_TOKENS.cityFill.base);
  });
});
