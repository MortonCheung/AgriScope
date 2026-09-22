import * as THREE from 'three';
import { getCityByAdcode } from '../../domain/geography/cities';

/**
 * 辽宁省 3D 沙盘几何。
 *
 * 直接用 GeoJSON + Shape + ExtrudeGeometry 生成行政区域，
 * 不做发光地图 / 霓虹边界 / 科技网格——目标是"实体研究沙盘"。
 * 投影为局部等距圆柱：经度按中心纬度压缩，保证比例不失真。
 */

const DEG2RAD = Math.PI / 180;

interface GeoFeature {
  properties: { adcode?: number; name?: string };
  geometry: { type: string; coordinates: unknown } | null;
}

export interface GeoCollection { features: GeoFeature[] }

export interface CitySolid {
  id: string;
  name: string;
  shortName: string;
  hasResearch: boolean;
  /** 外环集合（已投影、已居中、世界单位） */
  rings: THREE.Vector2[][];
  /** 面积重心，用于标签与相机取景 */
  centroid: THREE.Vector2;
  /** 包围盒半径，用于取景与缩放 */
  radius: number;
}

export interface LiaoningSolidModel {
  cities: CitySolid[];
  radius: number;
  centroid: THREE.Vector2;
}

function toPolygons(geometry: { type: string; coordinates: unknown }): number[][][][] {
  if (geometry.type === 'Polygon') return [geometry.coordinates as number[][][]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as number[][][][];
  return [];
}

function simplify(points: THREE.Vector2[], tolerance: number): THREE.Vector2[] {
  if (points.length < 4) return points;
  const result: THREE.Vector2[] = [points[0]];
  for (const point of points.slice(1)) {
    if (point.distanceTo(result[result.length - 1]) >= tolerance) result.push(point);
  }
  return result.length >= 3 ? result : points;
}

export function buildLiaoningSolidModel(collection: GeoCollection, scale = 11, simplifyTolerance = 0.05): LiaoningSolidModel {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  const collect = (value: unknown) => {
    if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number') {
      minLng = Math.min(minLng, value[0]); maxLng = Math.max(maxLng, value[0]);
      minLat = Math.min(minLat, value[1]); maxLat = Math.max(maxLat, value[1]);
      return;
    }
    if (Array.isArray(value)) value.forEach(collect);
  };
  for (const feature of collection.features) {
    if (feature.geometry) collect(feature.geometry.coordinates);
  }
  const centerLng = (minLng + maxLng) / 2;
  const centerLat = (minLat + maxLat) / 2;
  const cosLat = Math.cos(centerLat * DEG2RAD);
  const project = (lng: number, lat: number) => new THREE.Vector2(
    (lng - centerLng) * cosLat * scale,
    (lat - centerLat) * scale,
  );

  const cities: CitySolid[] = [];
  for (const feature of collection.features) {
    const adcode = feature.properties?.adcode;
    if (typeof adcode !== 'number' || !feature.geometry) continue;
    const registered = getCityByAdcode(adcode);
    if (!registered) continue;

    const rings: THREE.Vector2[][] = [];
    for (const polygon of toPolygons(feature.geometry)) {
      const outer = polygon[0];
      if (!Array.isArray(outer) || outer.length < 3) continue;
      const projected = simplify(outer.map(([lng, lat]) => project(lng, lat)), simplifyTolerance);
      if (projected.length >= 3) rings.push(projected);
    }
    if (rings.length === 0) continue;

    const box = new THREE.Box2();
    const sum = new THREE.Vector2();
    let count = 0;
    for (const ring of rings) {
      for (const point of ring) { box.expandByPoint(point); sum.add(point); count += 1; }
    }
    const centroid = count > 0 ? sum.divideScalar(count) : box.getCenter(new THREE.Vector2());
    const size = box.getSize(new THREE.Vector2());
    cities.push({
      id: registered.id,
      name: registered.name,
      shortName: registered.shortName,
      hasResearch: registered.hasResearch,
      rings,
      centroid,
      radius: Math.max(size.x, size.y) / 2,
    });
  }

  const overall = new THREE.Box2();
  for (const city of cities) for (const ring of city.rings) for (const point of ring) overall.expandByPoint(point);
  const overallSize = overall.getSize(new THREE.Vector2());
  return {
    cities,
    radius: Math.max(overallSize.x, overallSize.y) / 2,
    centroid: overall.getCenter(new THREE.Vector2()),
  };
}

/** 由外环生成可挤出的 Shape。 */
export function ringsToShapes(rings: THREE.Vector2[][]): THREE.Shape[] {
  return rings.map((ring) => new THREE.Shape(ring));
}
