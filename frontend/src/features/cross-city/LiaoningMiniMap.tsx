import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { LIAONING_CITIES } from '../../domain/geography/cities';

/**
 * 轻量 SVG 辽宁地图（跨城页专用，§25 地图联动）。
 *
 * 边界：
 *   · 复用公开几何 `public/geo/liaoning.json`，**不引入 Three.js**，
 *     也不碰 `features/liaoning/**`（省域三维场景是另一条产品线）；
 *   · 只画行政边界并把数据里出现过的城市高亮，不做地形、不做装饰；
 *   · 坐标用等距圆柱投影落到固定 viewBox，纯展示，不参与任何计算。
 *
 * 高亮的判定只来自"这张表的 city 列有哪些真实取值"，不来自前端推断。
 */

interface GeoGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}
interface GeoFeature {
  properties: { name: string; center?: [number, number] };
  geometry: GeoGeometry;
}
interface GeoCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

const VIEW_W = 520;
const VIEW_H = 420;
const PAD = 18;

/** 只为渲染的极简投影：先求整省 bbox，再线性映射到 viewBox。 */
function buildProjector(features: GeoFeature[]) {
  let minLng = Infinity; let maxLng = -Infinity;
  let minLat = Infinity; let maxLat = -Infinity;
  for (const feature of features) {
    for (const point of allRings(feature.geometry).flat()) {
      if (point[0] < minLng) minLng = point[0];
      if (point[0] > maxLng) maxLng = point[0];
      if (point[1] < minLat) minLat = point[1];
      if (point[1] > maxLat) maxLat = point[1];
    }
  }
  const spanLng = maxLng - minLng || 1;
  const spanLat = maxLat - minLat || 1;
  const innerW = VIEW_W - PAD * 2;
  const innerH = VIEW_H - PAD * 2;
  return (lng: number, lat: number): [number, number] => [
    PAD + ((lng - minLng) / spanLng) * innerW,
    PAD + ((maxLat - lat) / spanLat) * innerH,
  ];
}

type Ring = number[][];
function allRings(geometry: GeoGeometry): Ring[] {
  if (geometry.type === 'Polygon') return geometry.coordinates as unknown as Ring[];
  return (geometry.coordinates as unknown as Ring[][]).flat();
}

function featurePath(feature: GeoFeature, project: (lng: number, lat: number) => [number, number]): string {
  const segments: string[] = [];
  for (const ring of allRings(feature.geometry)) {
    ring.forEach((point, index) => {
      const [x, y] = project(point[0], point[1]);
      segments.push(`${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
    });
    segments.push('Z');
  }
  return segments.join(' ');
}

const nameToId = new Map<string, string>();
for (const city of LIAONING_CITIES) {
  nameToId.set(city.name, city.id);
  nameToId.set(city.shortName, city.id);
}

function useLiaoningShapes() {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; shapes: { id: string; name: string; path: string }[] } | { status: 'error' }>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    fetch('/geo/liaoning.json')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<GeoCollection>;
      })
      .then((collection) => {
        if (!alive) return;
        const project = buildProjector(collection.features);
        const shapes = collection.features.map((feature) => ({
          id: nameToId.get(feature.properties.name) ?? feature.properties.name,
          name: feature.properties.name,
          path: featurePath(feature, project),
        }));
        setState({ status: 'ready', shapes });
      })
      .catch(() => { if (alive) setState({ status: 'error' }); });
    return () => { alive = false; };
  }, []);
  return state;
}

export interface LiaoningMiniMapProps {
  /** 当前指标表里真实出现过的城市 id（highlight 判定只看这个）。 */
  highlighted: string[];
  /** 当前聚焦城市 id（联动高亮）。 */
  active?: string | null;
  onSelect?: (cityId: string) => void;
}

export function LiaoningMiniMap({ highlighted, active, onSelect }: LiaoningMiniMapProps) {
  const state = useLiaoningShapes();
  const highlightSet = useMemo(() => new Set(highlighted), [highlighted]);

  if (state.status === 'loading') {
    return <div className="cx-map cx-map--state" aria-busy="true" role="status" aria-label="地图加载中" />;
  }
  if (state.status === 'error') {
    return <p className="ag-caption">行政区划几何未载入，跨城城市高亮暂不可用。</p>;
  }

  const interactive = Boolean(onSelect);

  const onKeyDown = (cityId: string) => (event: KeyboardEvent<SVGGElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect?.(cityId);
  };

  return (
    <figure className="cx-map">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label="辽宁省城市分布与跨城比较高亮">
        {state.shapes.map((shape) => {
          const isHighlighted = highlightSet.has(shape.id);
          const isActive = active === shape.id;
          const clickable = interactive && isHighlighted;
          return (
            <g
              key={shape.id}
              className="cx-map__city"
              data-highlighted={isHighlighted || undefined}
              data-active={isActive || undefined}
              data-clickable={clickable || undefined}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              aria-pressed={clickable ? isActive : undefined}
              aria-label={clickable ? `${shape.name}${isActive ? '（当前聚焦）' : ''}` : undefined}
              onClick={clickable ? () => onSelect?.(shape.id) : undefined}
              onKeyDown={clickable ? onKeyDown(shape.id) : undefined}
            >
              <path d={shape.path} />
              <title>{shape.name}</title>
            </g>
          );
        })}
      </svg>
      <figcaption className="ag-caption">
        高亮城市为当前指标表里真实出现过的城市；「当前聚焦」与下方比较联动。省界来自公开行政区划几何。
      </figcaption>
    </figure>
  );
}