import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ringsToShapes, type CitySolid } from './liaoningGeometry';
import { CITY_COLOR_TOKENS, SCENE_TOKENS } from '../../design/sceneTokens';
import { isStudyCity } from '../../domain/geography/cities';
import { MOTION_DURATION } from '../../design/motion';
import { useAnimationFrames } from './useAnimationFrames';
import type { OpeningPhase } from '../opening/openingPhase';

export const SOLID_DEPTH = 1.8;
/** 抬起插值系数与收敛阈值：不收敛到阈值内就持续请求帧。 */
const LIFT_LERP = 0.14;
const LIFT_EPSILON = 0.001;
/** 颜色插值系数：hover 不改材质、只让当前色缓慢逼近目标色（V3 §43）。 */
const COLOR_LERP = 0.1;
/** 描边透明度插值系数（hover 增强 / 降权用）。 */
const LINE_LERP = 0.14;
const LINE_EPSILON = 0.004;
/** 下落起始倾角（V4 §三十）：±2°。 */
const DROP_TILT_DEG = 2;
/** 单块区块在组装时间轴上占的下降时长；配合错峰窗口让最后一批在 0.90 落定（V5 §59）。 */
export const DROP_SPAN = 0.25;
/** 边线相对实体底面的抬升量，用于避开共面 z-fighting。 */
const EDGE_LIFT = 0.012;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** 位置：单调缓出。刻意**不做过冲**，否则区块会短暂穿进纸面（§三十 只允许极轻过冲）。 */
function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** 姿态：允许极轻过冲后回稳，读作"落地"而不是弹球（§三十）。 */
function easeOutBack(t: number): number {
  const c1 = 1.15;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

export interface CitySolidMeshProps {
  city: CitySolid;
  emphasis: 'base' | 'study' | 'focus' | 'dim';
  /** 是否为当前城市上下文（全局选择器 / 上一次点击）。 */
  selected: boolean;
  hovered: boolean;
  onHover: (cityId: string | null) => void;
  onSelect: (cityId: string) => void;
  reducedMotion: boolean;
  /** Opening 阶段（V4 §二十七/§三十）。非 opening 路由一律按完成态处理。 */
  phase: OpeningPhase;
  /** 组装时间轴（0–1）所在的引用；每帧读取，避免逐帧触发 React 渲染。 */
  assemblyRef: RefObject<number>;
  /** 该区块的下落延迟（0–1 的时间轴偏移），按"到沈阳的距离"确定性生成（§二十九）。 */
  dropDelay: number;
  /** 下落起始高度（世界单位），按省域与城市比例决定，不用固定值（§三十）。 */
  dropHeight: number;
}

/** 描边透明度：hover 增强、选中次之、其他城市降权。 */
const LINE_OPACITY = { hover: 1, selected: 1, base: 0.6, dim: 0.28 } as const;

/**
 * 单块城市实体：挤出几何 + 极细分隔线。
 *
 * 层次（V4 §三十/§三十二/§三十四）：
 *   外层 drop group —— 组装时承载"从空间落下"的位移、倾角与淡入；
 *   内层 lift group —— 承载 hover / selected 抬起，与下落互不干扰。
 * 两层的存在让同一块 Mesh 从 Opening 一直沿用到正式沙盘，切路由时不重挂。
 */
export function CitySolidMesh({
  city, emphasis, selected, hovered, onHover, onSelect, reducedMotion,
  phase, assemblyRef, dropDelay, dropHeight,
}: CitySolidMeshProps) {
  const dropGroup = useRef<THREE.Group>(null);
  const liftGroup = useRef<THREE.Group>(null);
  /** 首帧直接落到目标色，避免挂载时从初值淡入。 */
  const seeded = useRef(false);
  const interactive = isStudyCity(city.id);
  const fills = useMemo(() => {
    const base = new THREE.Color(isStudyCity(city.id) ? CITY_COLOR_TOKENS[city.id] : SCENE_TOKENS.cityFill.base);
    return { base, focus: base.clone().multiplyScalar(0.94), dim: base.clone().lerp(new THREE.Color(SCENE_TOKENS.paper), 0.6) };
  }, [city.id]);

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
      /**
       * 边线抬升一点点，避免与实体底面共面导致 z-fighting（抬升量小于实体厚度的 1%）。
       * 注意：海岸上那排明暗梳齿来自挤出侧立面在掠射角下的光照，是既有几何与光照的结果，
       * 与本行无关，也不在本次改动范围内。
       */
      outline.translate(0, SOLID_DEPTH + EDGE_LIFT, 0);
      list.push(outline);
    }
    return list;
  }, [city.rings]);

  /**
   * 材质自持：组装时要同时改透明度和颜色，因此不能让 JSX 每次重建材质。
   */
  const surface = useMemo(() => new THREE.MeshStandardMaterial({
    color: SCENE_TOKENS.cityFill.base, roughness: 0.92, metalness: 0, transparent: false, opacity: 1,
  }), []);
  const line = useMemo(() => new THREE.LineBasicMaterial({
    color: SCENE_TOKENS.outline, transparent: true, opacity: LINE_OPACITY.base,
  }), []);

  useEffect(() => () => { geometry.dispose(); edges.forEach((edge) => edge.dispose()); surface.dispose(); line.dispose(); },
    [edges, geometry, line, surface]);

  // ---- 目标值：hover 抬起 > selected 抬起 > 静止 ----
  const targetLift = interactive && hovered ? SOLID_DEPTH * 0.6 : interactive && selected ? SOLID_DEPTH * 0.48 : 0;
  const lineTarget: number = hovered
    ? LINE_OPACITY.hover
    : emphasis === 'dim'
      ? LINE_OPACITY.dim
      : selected
        ? LINE_OPACITY.selected
        : LINE_OPACITY.base;

  // Interaction preserves each city's identity; risk never recolors the map.
  const targetFill = interactive && (hovered || selected) ? fills.focus : emphasis === 'dim' ? fills.dim : fills.base;

  /**
   * 抬起、换色、描边都不再由某一帧决定：画布是 demand 帧循环，
   * 没有帧就没有插值，因此每次目标变化都重新开一个有限时长的帧窗口。
   */
  const [motionNonce, setMotionNonce] = useState(0);
  useEffect(() => { setMotionNonce((value) => value + 1); }, [targetLift, emphasis, lineTarget, targetFill]);
  useAnimationFrames(!reducedMotion && motionNonce > 0, MOTION_DURATION.slow * 3, motionNonce);

  useFrame(() => {
    const drop = dropGroup.current;
    if (!drop) return;

    // 草稿阶段只有图纸：行政区实体先不出场（V4 §二十五）。
    if (phase === 'sketch') {
      drop.visible = false;
      return;
    }
    drop.visible = true;

    // ---- 组装：从空间落到自己的位置上（§三十） ----
    /**
     * 透明只在淡入期间开启：常驻 transparent 会让互贴的挤出侧面进入透明排序，
     * 海岸线上会出现梳齿状伪影。落定后立即回到不透明，画面与 /liaoning 完全一致。
     */
    const fading = phase === 'assembling' && !reducedMotion;
    if (surface.transparent !== fading) { surface.transparent = fading; surface.needsUpdate = true; }

    if (fading) {
      const t = clamp01((assemblyRef.current - dropDelay) / DROP_SPAN);
      const fall = easeOutCubic(t);
      const pose = easeOutBack(t);
      drop.position.y = Math.max(0, dropHeight * (1 - fall));
      const tilt = THREE.MathUtils.degToRad(DROP_TILT_DEG) * (1 - pose);
      drop.rotation.x = tilt;
      drop.rotation.z = -tilt;
      surface.opacity = t;
      line.opacity = t;
    } else {
      drop.position.y = 0;
      drop.rotation.x = 0;
      drop.rotation.z = 0;
      surface.opacity = 1;
      // 描边透明度向目标收敛（hover 增强 / 其他城市降权）。
      if (reducedMotion) line.opacity = lineTarget;
      else {
        const lineDelta = lineTarget - line.opacity;
        line.opacity = Math.abs(lineDelta) < LINE_EPSILON ? lineTarget : line.opacity + lineDelta * LINE_LERP;
      }
    }

    // ---- 颜色插值：不再瞬间换色（§43）。首帧直接落位，避免挂载淡入。 ----
    if (!seeded.current || reducedMotion) { surface.color.copy(targetFill); seeded.current = true; }
    else surface.color.lerp(targetFill, COLOR_LERP);

    // ---- hover / selected 抬起（内层，与下落互不干扰） ----
    const lift = liftGroup.current;
    if (!lift) return;
    if (reducedMotion) { lift.position.y = targetLift; return; }
    const delta = targetLift - lift.position.y;
    if (Math.abs(delta) < LIFT_EPSILON) { lift.position.y = targetLift; return; }
    lift.position.y += delta * LIFT_LERP;
  });

  return (
    <group ref={dropGroup} name={city.id} userData={{ cityId: city.id }}>
      <group ref={liftGroup}>
        <mesh
          geometry={geometry}
          material={surface}
          // Every visible solid blocks objects behind it. Removing non-study
          // handlers lets Fiber raycast through e.g. Fushun into Tieling.
          onPointerOver={(event) => { event.stopPropagation(); if (interactive && phase === 'ready') onHover(city.id); }}
          onPointerOut={interactive ? () => onHover(null) : undefined}
          onClick={(event) => { event.stopPropagation(); if (interactive && phase === 'ready') onSelect(city.id); }}
        />
        {edges.map((outline, index) => (
          <lineSegments key={index} geometry={outline} material={line} />
        ))}
      </group>
    </group>
  );
}
