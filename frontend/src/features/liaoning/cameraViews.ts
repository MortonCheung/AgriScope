import { CatmullRomCurve3, Vector3 } from 'three';

/** 相机位姿共用一份半径相对定义；模型根节点始终不绕 Y 轴旋转。 */
export interface CameraPose {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
}

export const ENTRY_AZIMUTH_ORBIT_DEGREES = 360;
export const PROVINCE_ROOT_ROTATION = 0;
export const CAMERA_FOV_DEG = 38;
export const OPENING_DURATION_MS = 4800;

/** 位置曲线弧长采样；每个镜头段独立缓入缓出，最后严格接到正式机位。 */
export const OPENING_TIMELINE = [
  { id: 'draft', label: '图纸建立', start: 0, end: 0.04 },
  { id: 'assembly', label: '地块组装与镜头下降', start: 0.04, end: 0.18 },
  { id: 'orbit', label: '环省飞行 · 完整一周', start: 0.18, end: 0.88 },
  { id: 'settle', label: '上升落位', start: 0.88, end: 1 },
] as const;
export type OpeningCameraStage = (typeof OPENING_TIMELINE)[number]['id'];

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const lerp = (from: number, to: number, p: number) => from + (to - from) * p;
const smoothstep = (p: number) => p * p * (3 - 2 * p);
const FINAL_THETA = Math.atan2(3.2, 0.08);
const RING_RADIUS = 2.75;
const RING_HEIGHT = 2.85;
const RING_TARGET_Y = 0.03;

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

/** 草稿在同一方位高角度俯视；完整一周发生在独立的环绕段。 */
export function sketchView(radius: number): CameraPose {
  return {
    position: [Math.cos(FINAL_THETA) * radius * 0.65, radius * 3.9, Math.sin(FINAL_THETA) * radius * 0.65],
    target: [0, 0, 0],
  };
}

/** 城市研究工作台机位；正式省域选城不使用这一整段推近。 */
export function cityView(target: { x: number; z: number }, radius: number): CameraPose {
  return {
    position: [target.x + radius * 0.24, radius * 0.5, target.z + radius * 0.5],
    target: [target.x, 1.6, target.z],
  };
}

/** 保留完整省域的轻微观察偏移；只响应正式 selection，hover 不移动镜头。 */
export function provinceCityView(target: { x: number; z: number }, radius: number): CameraPose {
  const base = provinceView(radius);
  const x = Math.max(-radius, Math.min(radius, target.x)) * 0.12;
  const z = Math.max(-radius, Math.min(radius, target.z)) * 0.12;
  return {
    position: [base.position[0] + x, base.position[1], base.position[2] + z],
    target: [x, base.target[1], z],
  };
}

export function easeInOutCubic(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - ((-2 * p + 2) ** 3) / 2;
}

function radialPoint(horizontal: number, height: number): Vector3 {
  return new Vector3(Math.cos(FINAL_THETA) * horizontal, height, Math.sin(FINAL_THETA) * horizontal);
}

// 所有曲线先在 r=1 的归一化空间中构建；运行时仅缩放，避免逐帧重建曲线与弧长缓存。
const assemblyCurve = new CatmullRomCurve3([
  radialPoint(0.65, 3.9), radialPoint(0.95, 3.83), radialPoint(1.85, 3.3), radialPoint(RING_RADIUS, RING_HEIGHT),
], false, 'centripetal');
const ringCurve = new CatmullRomCurve3(Array.from({ length: 24 }, (_, index) => {
  const angle = (index / 24) * Math.PI * 2;
  const theta = FINAL_THETA + angle;
  const horizontal = RING_RADIUS * (1 + 0.012 * Math.sin(angle));
  return new Vector3(Math.cos(theta) * horizontal, RING_HEIGHT + 0.045 * Math.sin(angle * 2), Math.sin(theta) * horizontal);
}), true, 'centripetal');
const settleCurve = new CatmullRomCurve3([
  radialPoint(RING_RADIUS, RING_HEIGHT), radialPoint(2.93, 2.93), radialPoint(3.12, 3.04),
  new Vector3(...provinceView(1).position),
], false, 'centripetal');
// 充分细的弧长表，令每个镜头段的 getPointAt 与实际路径长度一致。
for (const curve of [assemblyCurve, ringCurve, settleCurve]) {
  curve.arcLengthDivisions = 1200;
  curve.updateArcLengths();
}

export function openingStageForProgress(progress: number): { stage: OpeningCameraStage; localProgress: number } {
  const p = clamp01(progress);
  const segment = OPENING_TIMELINE.find((entry) => p < entry.end) ?? OPENING_TIMELINE[3];
  return { stage: segment.id, localProgress: clamp01((p - segment.start) / (segment.end - segment.start)) };
}

/**
 * 导演时间线：图纸 → 组装 → 360° 曲线环绕 → 上升落位。
 * 传入原始线性时间进度；内部按段缓入缓出，不再在调用方套第二次 easing。
 * Camera Position 与 Target 独立控制，0/1 两端直接返回共享位姿，避免切路由时浮点差异。
 */
export function orbitView(radius: number, progress: number): CameraPose {
  const p = clamp01(progress);
  if (p === 0) return sketchView(radius);
  if (p === 1) return provinceView(radius);
  const { stage, localProgress } = openingStageForProgress(p);
  if (stage === 'draft') return sketchView(radius);
  const u = smoothstep(localProgress);
  const curve = stage === 'assembly' ? assemblyCurve : stage === 'orbit' ? ringCurve : settleCurve;
  const point = curve.getPointAt(u);
  const targetY = stage === 'assembly' ? lerp(0, RING_TARGET_Y, u)
    : stage === 'orbit' ? RING_TARGET_Y : lerp(RING_TARGET_Y, 0.035, u);
  return {
    position: [point.x * radius, point.y * radius, point.z * radius],
    target: [0, targetY * radius, 0],
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

export function azimuthDegrees(pose: CameraPose): number {
  return (Math.atan2(pose.position[2], pose.position[0]) * 180) / Math.PI;
}

/** 累计展开方位角，而非首尾角差；闭合一圈的首尾角差本来就是 0。 */
export function orbitSpanDegrees(radius: number): number {
  let previous = azimuthDegrees(orbitView(radius, 0));
  let span = 0;
  for (let step = 1; step <= 720; step += 1) {
    const next = azimuthDegrees(orbitView(radius, step / 720));
    span += ((next - previous + 540) % 360) - 180;
    previous = next;
  }
  return span;
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

/**
 * Opening 时间轴（Sketch → 环绕）在 `progress ∈ [0, progressLimit]` 内，
 * 地面在屏幕内可见的最大半范围（× 半径）。草稿纸平面的半宽必须 ≥ 它（§13）。
 *
 * `progressLimit` 默认 1（含正式省域机位）；草稿纸只在网格可见的区间需要覆盖，
 * 因此覆盖率断言应传 `GRID_FADE_END`。采样足够密以免错过掠射机位的峰值。
 */
export function maxGroundHalfSpan(aspect: number, progressLimit = 1, radius = 1): number {
  let max = groundReach(sketchView(radius), aspect);
  const steps = 40;
  for (let step = 0; step <= steps; step += 1) {
    const progress = (step / steps) * progressLimit;
    max = Math.max(max, groundReach(orbitView(radius, progress), aspect));
  }
  return max;
}
