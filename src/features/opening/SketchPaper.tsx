import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { OpeningPhase } from './openingPhase';

/**
 * 草稿纸（本轮 §23，取代只调 opacity 的做法）。
 *
 * 之前的问题：网格与手稿都用 1px 的 `LineBasicMaterial`，
 * Safari 里几乎看不见 —— 属于"盯着看 3 秒才发现有线"。
 *
 * 现在的做法：
 *   · **网格**用 `CanvasTexture` 画在 2048² 画布上，贴到一块 Plane 上，
 *     由绘制阶段的线宽直接控制粗细，配 mipmap + 各向异性，远处也不会消失；
 *   · **手稿线**改用 drei 的 `Line`（Line2 / LineSegments2），
 *     线宽是**屏幕像素**而不是世界单位，缩到多远都保持可读；
 *   · 层级严格是：minor grid < major grid < 市界 < 辽宁外轮廓。
 *
 * §63 仍然成立：随着组装进度，网格与手稿一起渐退到极淡痕迹，
 * 形成"实体建立在自己的研究草图上"。
 */

const GRID_TEXTURE_SIZE = 2048;
/** 画布上的网格划分：次要格 96 格，主要格每 8 格一条。 */
const GRID_CELLS = 96;
const MAJOR_EVERY = 8;

const MINOR_COLOR = '#b9b1a6';
const MAJOR_COLOR = '#a49a8d';
const DRAFT_COLOR = '#8f8577';
const OUTLINE_COLOR = '#6f6659';

/** 材质总透明度；画布内部的 alpha 比例保证 minor < major。 */
const GRID_OPACITY = 0.34;
const MINOR_ALPHA = 0.33;
const MAJOR_ALPHA = 0.62;

/** 屏幕像素线宽：市界 1.1、外轮廓 2.2（层级分明且都看得见）。 */
const DRAFT_LINE_WIDTH = 1.1;
const OUTLINE_LINE_WIDTH = 2.2;

const DRAFT_OPACITY = 0.5;
const OUTLINE_OPACITY = 0.62;
const PAPER_SCALE = 1.35;
/** 组装结束后的残留比例（§63）。 */
const GRID_RESIDUAL = 0.18;
const DRAFT_RESIDUAL = 0.15;

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
  /** 组装进度 0→1；用来让图纸渐退（§63）。 */
  progress?: number;
}) {
  const half = radius * PAPER_SCALE;
  /** 各向异性取渲染器的最大值：草稿纸常被斜视，否则远处的线会被 mipmap 抹平。 */
  const gl = useThree((state) => state.gl);
  const texture = useMemo(() => createGridTexture(gl), [gl]);
  useEffect(() => () => texture.dispose(), [texture]);

  const draftLines = useMemo(() => toLinePoints(provinceRings, 0.004), [provinceRings]);
  const outlineLines = useMemo(() => toLinePoints(outlineRings, 0.006), [outlineRings]);

  /** 组装期间渐退，落定后留下极淡痕迹（§63）。 */
  const p = progress < 0 ? 0 : progress > 1 ? 1 : progress;
  const gridFade = 1 - (1 - GRID_RESIDUAL) * p;
  const draftFade = 1 - (1 - DRAFT_RESIDUAL) * p;
  /** 实体落定后手稿线不再需要：实体自身的边线已精确描出同一轮廓。 */
  const showDraft = phase !== 'ready';

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
