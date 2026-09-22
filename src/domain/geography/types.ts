/** 地理领域：省 / 市 / 地理区域。前端只使用内部 id 与展示名，不绑定外部目录。 */

export type ProvinceId = 'liaoning';

export interface GeoPoint {
  /** [经度, 纬度] */
  lngLat: [number, number];
}

export interface City {
  /** 前端内部 id，例如 'shenyang' */
  id: string;
  /** 行政区划代码，与辽宁省 GeoJSON 的 adcode 对齐 */
  adcode: number;
  provinceId: ProvinceId;
  name: string;
  shortName: string;
  /** 省域几何中心，用于 3D 地图标注 */
  center: GeoPoint;
  /** 是否已具备完整研究内容（当前仅沈阳） */
  hasResearch: boolean;
  /** 研究专题的展示顺序权重，数值越小越靠前 */
  studyOrder: number;
}

export interface GeoRegion {
  id: string;
  name: string;
  provinceId: ProvinceId;
  cityIds: string[];
  description: string;
}

export interface Province {
  id: ProvinceId;
  name: string;
  shortName: string;
  center: GeoPoint;
  /** GeoJSON 中的行政区划前缀，用于对齐要素 */
  adcode: number;
  cityIds: string[];
}
