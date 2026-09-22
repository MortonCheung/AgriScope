import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { CitySolid } from '../liaoning/liaoningGeometry';
import type { OpeningPhase } from './openingPhase';

/**
 * 草稿纸（V5 §23–§25、§55、§56、§63）。
 *
 * 视觉约定：
 *   - 暖白纸面上叠一层**暖灰方格**，不是蓝色工程网格、不是科技网格、不发光；
 *   - 对比度按 §55 的调试区间调高（minor 0.10–0.13、major 0.18–0.22），
 *     否则第一眼看不到"这是一张草图"；
 *   - 手稿边界**明显比 Grid 更深更粗**（§56），第一眼就要看出"草稿纸上画着辽宁"；
 *   - 不做泛黄、做旧、污渍、撕边：这是当代研究草稿，不是历史档案。
 *
 * §63：随着组装进度，Grid 与手稿都**渐退**（grid → 0.18、draft → 0.15），
 * 只留极淡痕迹，形成"实体建立在自己的研究草图上"。
 */

const MINOR_COLOR = '#b9b1a6';
const MAJOR_COLOR = '#a49a8d';
const MINOR_OPACITY = 0.11;
const MAJOR_OPACITY = 0.2;
const DRAFT_OPACITY = 0.42;
const MAJOR_EVERY = 4;
const PAPER_SCALE = 1.35;
/** 组装结束后的残留比例（§63）。 */
const GRID_RESIDUAL = 0.18;
const DRAFT_RESIDUAL = 0.15;

function makeGeometry(positions: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

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

export function SketchPaper({ radius, cities, phase, progress = 0 }: {
  radius: number;
  cities: CitySolid[];
  phase: OpeningPhase;
  /** 组装进度 0→1；用来让图纸渐退（§63）。 */
  progress?: number;
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

  /** 组装期间渐退，落定后留下极淡痕迹（§63）。 */
  const p = progress < 0 ? 0 : progress > 1 ? 1 : progress;
  const gridFade = 1 - (1 - GRID_RESIDUAL) * p;
  const draftFade = 1 - (1 - DRAFT_RESIDUAL) * p;
  /** 实体落定后手稿线不再需要：实体自身的边线已精确描出同一轮廓。 */
  const showDraft = phase !== 'ready';

  return (
    <group>
      <lineSegments geometry={minor}>
        <lineBasicMaterial color={MINOR_COLOR} transparent opacity={MINOR_OPACITY * gridFade} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={major}>
        <lineBasicMaterial color={MAJOR_COLOR} transparent opacity={MAJOR_OPACITY * gridFade} depthWrite={false} />
      </lineSegments>
      {showDraft && (
        <lineSegments geometry={draft}>
          <lineBasicMaterial color={MAJOR_COLOR} transparent opacity={DRAFT_OPACITY * draftFade} depthWrite={false} />
        </lineSegments>
      )}
    </group>
  );
}
