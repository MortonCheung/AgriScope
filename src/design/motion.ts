/**
 * AgriScope Motion Token。
 *
 * 动画必须服务数据解释：删掉它用户是否更难理解数据或空间关系？
 * 若答案是否定的，就不应该存在。
 */
export const MOTION_DURATION = {
  fast: 0.18,
  normal: 0.28,
  slow: 0.44,
  route: 0.42,
  /** 相机在空间中的移动/推近 */
  camera: 0.82,
  /** 图表沿时间绘制、事件标注逐条出现 */
  chartReveal: 1.2,
  /** 开场 */
  opening: 2.1,
} as const;

export const MOTION_EASE = {
  out: [0.16, 1, 0.3, 1] as const,
  standard: [0.22, 0.61, 0.36, 1] as const,
} as const;

export const MOTION_SPRING = {
  direct: { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 },
  soft: { type: 'spring', stiffness: 300, damping: 34, mass: 1 },
} as const;

export type MotionKey = keyof typeof MOTION_DURATION;

/** 统一处理 prefers-reduced-motion：降级为瞬时，而不是换个动画。 */
export function motionDuration(key: MotionKey, reducedMotion: boolean): number {
  return reducedMotion ? 0 : MOTION_DURATION[key];
}

export const CHART_REVEAL_STAGGER = 0.06;
