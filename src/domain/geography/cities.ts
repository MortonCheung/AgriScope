import type { City, GeoRegion, Province } from './types';

/**
 * 辽宁省 14 个地级市的静态注册表。
 * center 使用各市驻地经纬度（行政事实，非研究结论）。
 * 当前阶段只有沈阳具备完整研究内容，其余城市仅保留地图入口与元数据。
 */
export const LIAONING_CITIES: City[] = [
  { id: 'shenyang', adcode: 210100, provinceId: 'liaoning', name: '沈阳市', shortName: '沈阳', center: { lngLat: [123.429096, 41.796767] }, hasResearch: true, studyOrder: 1 },
  { id: 'tieling', adcode: 211200, provinceId: 'liaoning', name: '铁岭市', shortName: '铁岭', center: { lngLat: [123.844699, 42.223345] }, hasResearch: false, studyOrder: 2 },
  { id: 'chaoyang', adcode: 211300, provinceId: 'liaoning', name: '朝阳市', shortName: '朝阳', center: { lngLat: [120.451412, 41.57674] }, hasResearch: false, studyOrder: 3 },
  { id: 'jinzhou', adcode: 210700, provinceId: 'liaoning', name: '锦州市', shortName: '锦州', center: { lngLat: [121.127003, 41.095119] }, hasResearch: false, studyOrder: 4 },
  { id: 'dandong', adcode: 210600, provinceId: 'liaoning', name: '丹东市', shortName: '丹东', center: { lngLat: [124.356181, 40.000787] }, hasResearch: false, studyOrder: 5 },
  { id: 'dalian', adcode: 210200, provinceId: 'liaoning', name: '大连市', shortName: '大连', center: { lngLat: [121.614682, 38.914003] }, hasResearch: false, studyOrder: 6 },
  { id: 'anshan', adcode: 210300, provinceId: 'liaoning', name: '鞍山市', shortName: '鞍山', center: { lngLat: [122.994601, 41.110344] }, hasResearch: false, studyOrder: 20 },
  { id: 'fushun', adcode: 210400, provinceId: 'liaoning', name: '抚顺市', shortName: '抚顺', center: { lngLat: [123.957208, 41.880872] }, hasResearch: false, studyOrder: 21 },
  { id: 'benxi', adcode: 210500, provinceId: 'liaoning', name: '本溪市', shortName: '本溪', center: { lngLat: [123.766485, 41.294175] }, hasResearch: false, studyOrder: 22 },
  { id: 'yingkou', adcode: 210800, provinceId: 'liaoning', name: '营口市', shortName: '营口', center: { lngLat: [122.235452, 40.667012] }, hasResearch: false, studyOrder: 23 },
  { id: 'fuxin', adcode: 210900, provinceId: 'liaoning', name: '阜新市', shortName: '阜新', center: { lngLat: [121.670323, 42.021619] }, hasResearch: false, studyOrder: 24 },
  { id: 'liaoyang', adcode: 211000, provinceId: 'liaoning', name: '辽阳市', shortName: '辽阳', center: { lngLat: [123.181683, 41.269402] }, hasResearch: false, studyOrder: 25 },
  { id: 'panjin', adcode: 211100, provinceId: 'liaoning', name: '盘锦市', shortName: '盘锦', center: { lngLat: [122.069844, 41.124475] }, hasResearch: false, studyOrder: 26 },
  { id: 'huludao', adcode: 211400, provinceId: 'liaoning', name: '葫芦岛市', shortName: '葫芦岛', center: { lngLat: [120.836689, 40.711134] }, hasResearch: false, studyOrder: 27 },
];

export const LIAONING: Province = {
  id: 'liaoning',
  name: '辽宁省',
  shortName: '辽宁',
  center: { lngLat: [123.0, 41.5] },
  adcode: 210000,
  cityIds: LIAONING_CITIES.map((city) => city.id),
};

/** 计划研究的六个城市，仅用于地图与入口的权重排序。 */
export const STUDY_CITY_IDS = ['shenyang', 'tieling', 'chaoyang', 'jinzhou', 'dandong', 'dalian'] as const;

export const LIAONING_REGIONS: GeoRegion[] = [
  { id: 'central', name: '中部城市群', provinceId: 'liaoning', cityIds: ['shenyang', 'anshan', 'fushun', 'benxi', 'liaoyang', 'tieling', 'yingkou', 'panjin'], description: '以沈阳为中心的平原蔬菜主产与批发集散区' },
  { id: 'western', name: '辽西地区', provinceId: 'liaoning', cityIds: ['jinzhou', 'fuxin', 'chaoyang', 'huludao'], description: '降水偏少、设施农业与旱作并存的区域' },
  { id: 'eastern', name: '辽东地区', provinceId: 'liaoning', cityIds: ['dandong', 'dalian'], description: '沿海与山地交错，港口与外向型供应比重较高' },
];

export function getCity(cityId: string): City | undefined {
  return LIAONING_CITIES.find((city) => city.id === cityId);
}

export function getCityByAdcode(adcode: number): City | undefined {
  return LIAONING_CITIES.find((city) => city.adcode === adcode);
}

export function getRegionForCity(cityId: string): GeoRegion | undefined {
  return LIAONING_REGIONS.find((region) => region.cityIds.includes(cityId));
}
