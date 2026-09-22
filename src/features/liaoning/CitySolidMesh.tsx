import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ringsToShapes, type CitySolid } from './liaoningGeometry';
import { SCENE_TOKENS } from '../../design/sceneTokens';
import { MOTION_DURATION } from '../../design/motion';
import { useAnimationFrames } from './useAnimationFrames';

export const SOLID_DEPTH = 1.8;
/** 抬起插值系数与收敛阈值：不收敛到阈值内就持续请求帧。 */
const LIFT_LERP = 0.14;
const LIFT_EPSILON = 0.001;

interface CitySolidMeshProps {
  city: CitySolid;
  emphasis: 'base' | 'study' | 'focus' | 'dim';
  hovered: boolean;
  onHover: (cityId: string | null) => void;
  onSelect: (cityId: string) => void;
  reducedMotion: boolean;
  /** Opening 揭示进度（0–1）所在的引用；每帧读取，避免逐帧触发 React 渲染。 */
  revealRef?: RefObject<number>;
  /** 该城市的揭示延迟（0–1 的进度偏移），用于"边界逐个出现"。 */
  revealDelay?: number;
}

/** 揭示时间轴：先画轮廓，再获得厚度（V2 §61 阶段 1–4）。 */
const OUTLINE_SPAN = 0.45;
const FLAT_SCALE = 0.02;

const FILL: Record<CitySolidMeshProps['emphasis'], THREE.Color> = {
  base: new THREE.Color(SCENE_TOKENS.cityFill.base),
  study: new THREE.Color(SCENE_TOKENS.cityFill.study),
  focus: new THREE.Color(SCENE_TOKENS.cityFill.focus),
  dim: new THREE.Color(SCENE_TOKENS.cityFill.dim),
};

/** 单块城市实体：挤出几何 + 极细分隔线。Hover 只轻微抬升与加深，不爆亮。 */
export function CitySolidMesh({ city, emphasis, hovered, onHover, onSelect, reducedMotion, revealRef, revealDelay = 0 }: CitySolidMeshProps) {
  const group = useRef<THREE.Group>(null);
  const geometry = useMemo(() => {
    const shapes = ringsToShapes(city.rings);
    const extruded = new THREE.ExtrudeGeometry(shapes, { depth: SOLID_DEPTH, bevelEnabled: false, curveSegments: 1 });
    extruded.rotateX(-Math.PI / 2);
    extruded.computeVertexNormals();
    return extruded;
  }, [city.rings]);

  const edges = useMemo(() => {
    const list: THREE.EdgesGeometry[] = [];
    for (const shape of ringsToShapes(city.rings)) {
      const outline = new THREE.EdgesGeometry(new THREE.ShapeGeometry(shape, 1), 28);
      outline.rotateX(-Math.PI / 2);
      list.push(outline);
    }
    return list;
  }, [city.rings]);

  const target = hovered ? SOLID_DEPTH * 0.5 : 0;
  /**
   * 抬起是"由 hover 驱动"的插值。画布是 demand 帧循环：
   * 没有帧就没有插值（第一次常常因为相机还在动而有帧，之后便只剩颜色跳变）。
   * 每次目标变化都重新开一个有限时长的帧窗口。
   */
  const [liftNonce, setLiftNonce] = useState(0);
  useEffect(() => { setLiftNonce((value) => value + 1); }, [target]);
  useAnimationFrames(!reducedMotion && liftNonce > 0, MOTION_DURATION.slow * 2, liftNonce);

  useFrame(() => {
    const mesh = group.current;
    if (!mesh) return;

    // Opening 揭示：先把轮廓画出来，再让平面获得厚度（§61/§65/§66）
    if (revealRef) {
      const reveal = revealRef.current;
      const riseSpan = 1 - OUTLINE_SPAN;
      mesh.scale.y = reveal <= OUTLINE_SPAN
        ? FLAT_SCALE
        : FLAT_SCALE + (1 - FLAT_SCALE) * Math.min(1, (reveal - OUTLINE_SPAN) / riseSpan);
      const drawn = Math.max(0, Math.min(1, (reveal - revealDelay) / OUTLINE_SPAN));
      for (const outline of edges) {
        outline.setDrawRange(0, Math.floor(outline.attributes.position.count * drawn));
      }
    }

    if (reducedMotion) { mesh.position.y = target; return; }
    const delta = target - mesh.position.y;
    if (Math.abs(delta) < LIFT_EPSILON) { mesh.position.y = target; return; }
    mesh.position.y += delta * LIFT_LERP;
  });

  const fill = hovered ? FILL.focus : FILL[emphasis];

  return (
    <group ref={group}>
      <mesh
        geometry={geometry}
        onPointerOver={(event) => { event.stopPropagation(); onHover(city.id); }}
        onPointerOut={() => onHover(null)}
        onClick={(event) => { event.stopPropagation(); onSelect(city.id); }}
      >
        <meshStandardMaterial color={fill} roughness={0.92} metalness={0} flatShading={false} />
      </mesh>
      {edges.map((outline, index) => (
        <lineSegments key={index} geometry={outline}>
          <lineBasicMaterial color={hovered ? SCENE_TOKENS.outlineStrong : SCENE_TOKENS.outline} transparent opacity={hovered ? 0.9 : 1} />
        </lineSegments>
      ))}
    </group>
  );
}
