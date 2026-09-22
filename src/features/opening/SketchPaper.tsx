import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { CitySolid } from '../liaoning/liaoningGeometry';
import type { OpeningPhase } from './openingPhase';

/**
 * 草稿纸（V4 §二十三–§二十五、§三十二）。
 *
 * 视觉约定：
 *   - 暖白纸面上叠一层**非常浅的暖灰方格**，不是蓝色工程网格、不是科技网格、不发光；
 *   - Minor grid 透明度 0.045、Major grid 0.085（规范区间 0.035–0.055 / 0.07–0.10）；
 *   - 不做泛黄、做旧、污渍、撕边——这是**当代研究草稿**，不是历史档案。
 *
 * 手稿边界：把各市外环以平面细线画在纸面上。行政区落下后它们仍然留在下面，
 * 实体像落在自己的设计图上，这正是「草稿 → 研究对象」的隐喻（§三十二）。
 */

/** 暖灰：不是蓝、不是纯灰，带一点纸的温度。 */
const MINOR_COLOR = '#b9b1a6';
const MAJOR_COLOR = '#a49a8d';
const MINOR_OPACITY = 0.055;
const MAJOR_OPACITY = 0.1;
/** 手稿边界：比网格重一点，但仍然远轻于实体自身的边线。 */
const DRAFT_OPACITY = 0.18;
/** 每 N 格一条主格线。 */
const MAJOR_EVERY = 4;
/** 纸面比省域半径略大，读起来是"一张图纸"，而不是无限地板。 */
const PAPER_SCALE = 1.35;

function makeGeometry(positions: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

/** 只生成某一档的格线（主/次互斥），避免两套线重叠处过深。 */
function gridGeometry(half: number, step: number, major: boolean): THREE.BufferGeometry {
  const positions: number[] = [];
  let index = 0;
  for (let value = -half; value <= half + 1e-6; value += step, index += 1) {
    if (major ? index % MAJOR_EVERY !== 0 : index % MAJOR_EVERY === 0) continue;
    positions.push(value, 0, -half, value, 0, half);
    positions.push(-half, 0, value, half, 0, value);
  }
  return makeGeometry(positions);
}

export function SketchPaper({ radius, cities, phase }: {
  radius: number;
  cities: CitySolid[];
  phase: OpeningPhase;
}) {
  const half = radius * PAPER_SCALE;
  const step = radius / 16;

  const minor = useMemo(() => gridGeometry(half, step, false), [half, step]);
  const major = useMemo(() => gridGeometry(half, step, true), [half, step]);

  const draft = useMemo(() => {
    const positions: number[] = [];
    for (const city of cities) {
      for (const ring of city.rings) {
        for (let i = 0; i < ring.length; i += 1) {
          const a = ring[i];
          const b = ring[(i + 1) % ring.length];
          // 与世界坐标一致：形状的 y 映射到 -z。
          positions.push(a.x, 0.004, -a.y, b.x, 0.004, -b.y);
        }
      }
    }
    return makeGeometry(positions);
  }, [cities]);

  useEffect(() => () => { minor.dispose(); major.dispose(); draft.dispose(); }, [minor, major, draft]);

  /**
   * 手稿边界在实体落定后不再需要：实体自身的边线已经精确描出同一轮廓，
   * 两条线贴在一起会 z-fighting。落地前它们正是"下落的落点提示"。
   */
  const showDraft = phase !== 'ready';

  return (
    <group>
      <lineSegments geometry={minor}>
        <lineBasicMaterial color={MINOR_COLOR} transparent opacity={MINOR_OPACITY} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={major}>
        <lineBasicMaterial color={MAJOR_COLOR} transparent opacity={MAJOR_OPACITY} depthWrite={false} />
      </lineSegments>
      {showDraft && (
        <lineSegments geometry={draft}>
          <lineBasicMaterial color={MAJOR_COLOR} transparent opacity={DRAFT_OPACITY} depthWrite={false} />
        </lineSegments>
      )}
    </group>
  );
}
