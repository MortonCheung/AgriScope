import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { OpeningPhase } from './openingPhase';
import {
  DRAFT_COLOR,
  DRAFT_LINE_WIDTH,
  DRAFT_OPACITY,
  GRID_CELLS,
  GRID_OPACITY,
  GRID_REPEAT,
  GRID_TEXTURE_SIZE,
  MAJOR_ALPHA,
  MAJOR_COLOR,
  MAJOR_EVERY,
  MINOR_ALPHA,
  MINOR_COLOR,
  OUTLINE_COLOR,
  OUTLINE_LINE_WIDTH,
  OUTLINE_OPACITY,
  PLANE_HALF_SPAN,
  draftFadeAt,
  gridFadeAt,
} from './sketchMetrics';

/**
 * 草稿纸（本轮 §12–§15 重做）。
 *
 * 之前的问题：
 *   1. 方格 Plane 只有 `radius × 1.35`，用户能明显看到"方格区域 | 非方格区域"的分界线；
 *   2. 组装结束后网格与手稿仍留 `GRID_RESIDUAL / DRAFT_RESIDUAL` 的痕迹，
 *      于是正式省域页也带着草稿感 —— 而草稿纸只应属于 Opening。
 *
 * 现在的做法：
 *   · **网格**：大面积 Plane（`半径 × 6`，覆盖所有目标屏幕比例下 Sketch 与 Province
 *     机位能看到的地面），配 `RepeatWrapping` 的固定世界尺寸方格纹理 ——
 *     平面放大但格子尺寸不变，远处一直是连续的方格纸，永远看不到 Plane 边界；
 *   · **手稿线**用 drei 的 `Line`（屏幕像素线宽），缩到多远都保持可读；
 *   · 层级严格是：minor grid < major grid < 市界 < 辽宁外轮廓；
 *   · 随组装进度，网格在 0.15→0.60 淡出、手稿/外轮廓在 0.15→0.82 淡出，
 *     0.82 之后只剩正在落定的 3D 辽宁（§15）；组件本身也只在 Opening 路由挂载。
 *
 * 所有数值策略都在 `sketchMetrics.ts`，单独单测覆盖。
 */

/** 在透明画布上画方格：次要 1px、主要 3px，暖灰。 */
function createGridTexture(renderer?: THREE.WebGLRenderer | null): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = GRID_TEXTURE_SIZE;
  canvas.height = GRID_TEXTURE_SIZE;
  const context = canvas.getContext('2d');
  if (context) {
    context.clearRect(0, 0, GRID_TEXTURE_SIZE, GRID_TEXTURE_SIZE);
    const cell = GRID_TEXTURE_SIZE / GRID_CELLS;

    context.strokeStyle = MINOR_COLOR;
    context.globalAlpha = MINOR_ALPHA;
    context.lineWidth = 1;
    for (let index = 0; index <= GRID_CELLS; index += 1) {
      if (index % MAJOR_EVERY === 0) continue;
      // +0.5 让 1px 线落在像素中心，避免被抗锯齿摊成两条淡线（Safari 尤其明显）。
      const position = Math.round(index * cell) + 0.5;
      context.beginPath();
      context.moveTo(position, 0);
      context.lineTo(position, GRID_TEXTURE_SIZE);
      context.moveTo(0, position);
      context.lineTo(GRID_TEXTURE_SIZE, position);
      context.stroke();
    }

    context.strokeStyle = MAJOR_COLOR;
    context.globalAlpha = MAJOR_ALPHA;
    context.lineWidth = 3;
    for (let index = 0; index <= GRID_CELLS; index += MAJOR_EVERY) {
      const position = index * cell;
      context.beginPath();
      context.moveTo(position, 0);
      context.lineTo(position, GRID_TEXTURE_SIZE);
      context.moveTo(0, position);
      context.lineTo(GRID_TEXTURE_SIZE, position);
      context.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 1;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  // 平面放大靠平铺，而不是把纹理拉伸：格子世界尺寸恒定，看不到边界（§13）。
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(GRID_REPEAT, GRID_REPEAT);
  texture.needsUpdate = true;
  return texture;
}

/** 世界坐标：形状的 y 映射到 -z，略微抬高避免与地面 z-fighting。 */
function toLinePoints(rings: THREE.Vector2[][], height: number): [number, number, number][][] {
  return rings.map((ring) => ring.map((point) => [point.x, height, -point.y] as [number, number, number]));
}

export function SketchPaper({ radius, provinceRings, outlineRings, phase, progress = 0 }: {
  radius: number;
  /** 全省（14 市）边界环：市界。 */
  provinceRings: THREE.Vector2[][];
  /** 辽宁外轮廓环：由边界环配对推出，配对失败时为空数组。 */
  outlineRings: THREE.Vector2[][];
  phase: OpeningPhase;
  /** 组装进度 0→1；用来让图纸渐退并最终完全消失（§15）。 */
  progress?: number;
}) {
  const half = radius * PLANE_HALF_SPAN;
  /** 各向异性取渲染器的最大值：草稿纸常被斜视，否则远处的线会被 mipmap 抹平。 */
  const gl = useThree((state) => state.gl);
  const texture = useMemo(() => createGridTexture(gl), [gl]);
  useEffect(() => () => texture.dispose(), [texture]);

  const draftLines = useMemo(() => toLinePoints(provinceRings, 0.004), [provinceRings]);
  const outlineLines = useMemo(() => toLinePoints(outlineRings, 0.006), [outlineRings]);

  const gridFade = gridFadeAt(progress);
  const draftFade = draftFadeAt(progress);
  /** 实体落定后手稿线不再需要：实体自身的边线已精确描出同一轮廓。 */
  const showDraft = phase !== 'ready' && draftFade > 0;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} renderOrder={-2}>
        <planeGeometry args={[half * 2, half * 2]} />
        <meshBasicMaterial
          map={texture}
          transparent
          opacity={GRID_OPACITY * gridFade}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {showDraft && draftLines.map((points, index) => (
        <Line
          key={`boundary-${index}`}
          points={points}
          color={DRAFT_COLOR}
          lineWidth={DRAFT_LINE_WIDTH}
          transparent
          opacity={DRAFT_OPACITY * draftFade}
          depthWrite={false}
        />
      ))}

      {showDraft && outlineLines.map((points, index) => (
        <Line
          key={`outline-${index}`}
          points={points}
          color={OUTLINE_COLOR}
          lineWidth={OUTLINE_LINE_WIDTH}
          transparent
          opacity={OUTLINE_OPACITY * draftFade}
          depthWrite={false}
        />
      ))}
    </group>
  );
}
