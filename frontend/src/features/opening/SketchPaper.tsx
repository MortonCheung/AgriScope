import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { OpeningPhase } from './openingPhase';
import type { CameraPose } from '../liaoning/cameraViews';
import {
  DRAFT_COLOR,
  DRAFT_LINE_WIDTH,
  DRAFT_OPACITY,
  GRID_CELLS,
  GRID_OPACITY,
  GRID_TEXTURE_SIZE,
  MAJOR_ALPHA,
  MAJOR_COLOR,
  MAJOR_EVERY,
  MINOR_ALPHA,
  MINOR_COLOR,
  OUTLINE_COLOR,
  OUTLINE_LINE_WIDTH,
  OUTLINE_OPACITY,
  gridRepeatForHalfSpan,
  sketchHalfSpan,
  draftFadeAt,
  gridFadeAt,
} from './sketchMetrics';

/** The Opening-only draft covers the shared camera view with fixed-size grid cells. */
/** 在透明画布上画方格：次要 1px、主要 3px，暖灰。 */
function createGridTexture(repeat: number, renderer?: THREE.WebGLRenderer | null): THREE.CanvasTexture {
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
  texture.repeat.set(repeat, repeat);
  texture.needsUpdate = true;
  return texture;
}

/** 世界坐标：形状的 y 映射到 -z，略微抬高避免与地面 z-fighting。 */
function toLinePoints(rings: THREE.Vector2[][], height: number): [number, number, number][][] {
  return rings.map((ring) => ring.map((point) => [point.x, height, -point.y] as [number, number, number]));
}

export function SketchPaper({ radius, endPose, provinceRings, outlineRings, phase, progress = 0 }: {
  radius: number;
  endPose: CameraPose;
  /** 全省（14 市）边界环：市界。 */
  provinceRings: THREE.Vector2[][];
  /** 辽宁外轮廓环：由边界环配对推出，配对失败时为空数组。 */
  outlineRings: THREE.Vector2[][];
  phase: OpeningPhase;
  /** 组装进度 0→1；用来让图纸渐退并最终完全消失（§15）。 */
  progress?: number;
}) {
  const viewport = useThree((state) => state.size);
  const aspect = viewport.width / Math.max(1, viewport.height);
  const half = useMemo(() => sketchHalfSpan(radius, aspect, endPose), [radius, aspect, endPose]);
  const repeat = gridRepeatForHalfSpan(half, radius);
  /** 各向异性取渲染器的最大值：草稿纸常被斜视，否则远处的线会被 mipmap 抹平。 */
  const gl = useThree((state) => state.gl);
  const texture = useMemo(() => createGridTexture(repeat, gl), [gl, repeat]);
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
