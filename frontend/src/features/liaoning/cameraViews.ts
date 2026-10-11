import { PerspectiveCamera, Vector3 } from 'three';
import { OPENING_SETTLE_PROGRESS } from '../opening/assemblyMetrics';
import { MOTION_DURATION } from '../../design/motion';
import type { CityWorldBounds } from './liaoningGeometry';

/** 相机位姿共用一份半径相对定义；模型根节点始终不绕 Y 轴旋转。 */
export interface CameraPose {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
}

export const PROVINCE_ROOT_ROTATION = 0;
export const CAMERA_FOV_DEG = 38;
export const OPENING_DURATION_MS = MOTION_DURATION.opening * 1000;

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const lerp = (from: number, to: number, p: number) => from + (to - from) * p;
const smootherstep = (p: number) => p * p * p * (p * (p * 6 - 15) + 10);
const FINAL_THETA = Math.atan2(3.2, 0.08);

/**
 * 保持辽宁全图的响应式取景半径，依据 Canvas 的真实 width/height，而非整页尺寸。
 * 0.875 是全轨迹水平构图的基准比例；真实 GeoJSON 的移动端投影检查锁定这个边界。
 * 只改变摄影机距离，不缩放几何。Opening 与省域共享同一舞台时必须传入相同 aspect。
 */
export function responsiveProvinceRadius(actualRadius: number, aspect: number): number {
  if (!Number.isFinite(actualRadius) || actualRadius <= 0) throw new RangeError('省域几何半径必须为正有限值。');
  const canvasAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 0.875;
  return actualRadius * Math.max(1, 0.875 / canvasAspect);
}

/** 正式沙盘居中，不再为已移除的底部主题区压低 target；窄屏额外 fit 由场景控制。 */
export function provinceView(radius: number): CameraPose {
  return {
    position: [radius * 0.08, radius * 3.1, radius * 3.2],
    target: [0, radius * 0.035, 0],
  };
}

/** 城市研究工作台机位；正式省域选城不使用这一整段推近。 */
export function cityView(target: { x: number; z: number }, radius: number): CameraPose {
  return {
    position: [target.x + radius * 0.24, radius * 0.5, target.z + radius * 0.5],
    target: [target.x, 1.6, target.z],
  };
}

/** Visible rectangle in Canvas pixels, after the two paper strips and Header. */
export interface CityFocusFrame { width: number; height: number; left: number; right: number; top: number; bottom: number }

/**
 * Fit the real city bounds into the visible map stage. A stable azimuth prevents
 * reversals between cities; nearby context and the lifted top face remain visible.
 * The target accounts for the safe rectangle's offset within the full Canvas.
 */
function framedView(bounds: CityWorldBounds, provinceRadius: number, frame: CityFocusFrame, scope: 'city' | 'province'): CameraPose {
  const width = Math.max(1, frame.width), height = Math.max(1, frame.height);
  const left = Math.max(0, Math.min(width - 1, frame.left));
  const right = Math.min(width, Math.max(left + 1, frame.right));
  const top = Math.max(0, Math.min(height - 1, frame.top));
  const bottom = Math.min(height, Math.max(top + 1, frame.bottom));
  const center = new Vector3((bounds.minX + bounds.maxX) / 2, scope === 'city' ? 1.4 : provinceRadius * 0.035, (bounds.minZ + bounds.maxZ) / 2);
  const elevation = scope === 'city' ? 55 * Math.PI / 180 : Math.atan2(3.1 - 0.035, Math.hypot(0.08, 3.2));
  const offset = new Vector3(Math.cos(FINAL_THETA) * Math.cos(elevation), Math.sin(elevation), Math.sin(FINAL_THETA) * Math.cos(elevation));
  const forward = offset.clone().negate();
  const screenRight = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();
  const screenUp = new Vector3().crossVectors(screenRight, forward).normalize();
  const tanV = Math.tan(CAMERA_FOV_DEG * Math.PI / 360), tanH = tanV * width / height;
  const centerX = (left + right) / width - 1;
  const centerY = 1 - (top + bottom) / height;
  const margin = scope === 'city' ? Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 0.1 + provinceRadius * 0.035 : provinceRadius * 0.025;
  const corners: Vector3[] = [];
  for (const x of [bounds.minX - margin, bounds.maxX + margin])
    for (const z of [bounds.minZ - margin, bounds.maxZ + margin])
      for (const y of [0, 3.2]) corners.push(new Vector3(x, y, z));
  const camera = new PerspectiveCamera(CAMERA_FOV_DEG, width / height, 1, 1200);
  const target = new Vector3(), position = new Vector3(), projected = new Vector3();
  const poseAt = (distance: number) => {
    target.copy(center).addScaledVector(screenRight, -centerX * distance * tanH).addScaledVector(screenUp, -centerY * distance * tanV);
    position.copy(target).addScaledVector(offset, distance);
    camera.position.copy(position); camera.lookAt(target); camera.updateMatrixWorld();
  };
  const fits = (distance: number) => {
    poseAt(distance);
    return corners.every(corner => {
      projected.copy(corner).project(camera);
      const x = (projected.x + 1) * width / 2, y = (1 - projected.y) * height / 2;
      return x >= left && x <= right && y >= top && y <= bottom && projected.z > -1 && projected.z < 1;
    });
  };
  let lower = Math.max(14, provinceRadius * (scope === 'city' ? 0.9 : 3)), upper = Math.max(lower, provinceRadius * 5);
  if (!fits(lower)) {
    while (!fits(upper) && upper < 900) upper *= 1.2;
    for (let step = 0; step < 40; step++) {
      const middle = (lower + upper) / 2;
      if (fits(middle)) upper = middle; else lower = middle;
    }
  } else upper = lower;
  poseAt(upper * 1.04);
  return { position: position.toArray() as [number, number, number], target: target.toArray() as [number, number, number] };
}

export const provinceCityView = (bounds: CityWorldBounds, radius: number, frame: CityFocusFrame): CameraPose => framedView(bounds, radius, frame, 'city');
export const provinceStageView = (bounds: CityWorldBounds, radius: number, frame: CityFocusFrame): CameraPose => framedView(bounds, radius, frame, 'province');

/**
 * One continuous push toward the actual paper-window pose, without orbiting.
 * Camera and the last solid settle together; the remaining 224 ms holds that pose.
 * Returning the shared object at the end prevents a route-specific correction.
 */
export function openingView(endPose: CameraPose, progress: number): CameraPose {
  const p = clamp01(progress);
  if (p >= OPENING_SETTLE_PROGRESS) return endPose;
  const u = smootherstep(p / OPENING_SETTLE_PROGRESS);
  const offset = new Vector3(...endPose.position).sub(new Vector3(...endPose.target));
  const distance = offset.length() * lerp(1.85, 1, u);
  const theta = Math.atan2(offset.z, offset.x);
  const elevation = lerp(76 * Math.PI / 180, Math.atan2(offset.y, Math.hypot(offset.x, offset.z)), u);
  const target: [number, number, number] = [endPose.target[0], endPose.target[1] * u, endPose.target[2]];
  return {
    position: [target[0] + Math.cos(theta) * Math.cos(elevation) * distance, target[1] + Math.sin(elevation) * distance, target[2] + Math.sin(theta) * Math.cos(elevation) * distance],
    target,
  };
}

export interface OpeningTimelineClock {
  now: () => number;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (handle: number) => void;
}

/** 可取消的单条 RAF 时间线；已排队的旧回调在中断后也不能完成或继续排帧。 */
export function startOpeningTimeline(
  onProgress: (progress: number) => void,
  onComplete: () => void,
  clock: OpeningTimelineClock = {
    now: () => performance.now(),
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (handle) => cancelAnimationFrame(handle),
  },
): () => void {
  const startedAt = clock.now();
  let frame = 0;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const progress = clamp01((clock.now() - startedAt) / OPENING_DURATION_MS);
    onProgress(progress);
    if (stopped) return;
    if (progress === 1) {
      stopped = true;
      onComplete();
    } else frame = clock.requestFrame(tick);
  };
  frame = clock.requestFrame(tick);
  return () => {
    if (stopped) return;
    stopped = true;
    clock.cancelFrame(frame);
  };
}

type V3 = readonly [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const magnitude = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const normalized = (a: V3): V3 => { const l = magnitude(a) || 1; return scale(a, 1 / l); };

/**
 * 单个机位下，屏幕四角射线与地面（y = 0）交点里离原点的最大水平距离（以省域半径为单位）。
 * 用来证明草稿纸平面的半宽足够覆盖某个屏幕比例下的整幅画面（§13/§59-6）。
 */
export function groundReach(pose: CameraPose, aspect: number, fovDeg: number = CAMERA_FOV_DEG): number {
  const camera = pose.position;
  const forward = normalized(sub(pose.target, camera));
  let right = cross(forward, [0, 1, 0]);
  if (magnitude(right) < 1e-6) right = [1, 0, 0];
  right = normalized(right);
  const up = cross(right, forward);

  const tanV = Math.tan((fovDeg / 2) * (Math.PI / 180));
  const tanH = tanV * aspect;

  let reach = 0;
  for (const signY of [-1, 1]) {
    for (const signX of [-1, 1]) {
      const ray = add(add(forward, scale(up, tanV * signY)), scale(right, tanH * signX));
      // 射线不朝下就永远交不到地面。
      if (ray[1] >= -1e-6) continue;
      const t = (0 - camera[1]) / ray[1];
      const x = camera[0] + ray[0] * t;
      const z = camera[2] + ray[2] * t;
      reach = Math.max(reach, Math.hypot(x, z));
    }
  }
  return reach;
}

/** Largest visible ground radius while the grid is present, in world units. */
export function maxGroundHalfSpan(endPose: CameraPose, aspect: number, progressLimit = 1): number {
  let max = 0;
  const steps = 80;
  for (let step = 0; step <= steps; step += 1) {
    const progress = (step / steps) * progressLimit;
    max = Math.max(max, groundReach(openingView(endPose, progress), aspect));
  }
  return max;
}
