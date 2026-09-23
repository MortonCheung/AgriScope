/**
 * 相机位姿的唯一来源（本轮 §24）。
 *
 * 三条硬约束：
 *   1. Opening 的**最后一帧**必须与正式省域的机位**完全相同** —— 两边调用同一个
 *      `provinceView()`，不写"差不多"的近似值；
 *   2. 组装期的相机方位变化是 **118°**，不是整整一圈（§24 参考 iTeach 的 entryShot：
 *      空间感来自"方位变化 + 距离变化 + target 变化"，360° 会让人眩晕、像模型自己在转）；
 *   3. **省域根节点全程 rotation = 0**，转的是相机，不是模型。
 */

export interface CameraPose {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
}

/**
 * 组装期相机的总方位变化（度）。
 * 取自参考实现 `src/scene/entryShot.ts` 的 `ENTRY_AZIMUTH_ORBIT_DEGREES = 118`。
 */
export const ENTRY_AZIMUTH_ORBIT_DEGREES = 118;

/**
 * 省域根节点的旋转：全过程保持 0（§24）。
 * 写成一个具名常量，是为了让"模型不转"这件事可被测试与复查，而不是靠肉眼看代码。
 */
export const PROVINCE_ROOT_ROTATION = 0;

/** 正式省域沙盘机位：/liaoning 与 Opening 终点共用。 */
export function provinceView(radius: number): CameraPose {
  return { position: [radius * 0.04, radius * 1.08, radius * 1.36], target: [0, 2, 0] };
}

/**
 * 草稿态机位：接近垂直俯视，能看全整张图纸。
 *
 * 方位角 = 省域方位角 − 118°，这样从草稿到省域的**方位变化恰好是 118°**：
 * 起点仍然是高角度俯视（高度 3.4r 对水平 0.55r，视仰角约 81°），
 * 只是站在另一个方位上，于是镜头会"明显向侧方飞行"而不是原地旋转。
 */
export function sketchView(radius: number): CameraPose {
  const to = provinceView(radius);
  const startTheta = Math.atan2(to.position[2], to.position[0])
    - (ENTRY_AZIMUTH_ORBIT_DEGREES * Math.PI) / 180;
  const horizontalRadius = radius * 0.55;
  return {
    position: [
      Math.cos(startTheta) * horizontalRadius,
      radius * 3.4,
      Math.sin(startTheta) * horizontalRadius,
    ],
    target: [0, 0, 0],
  };
}

/** 城市推近机位：省域推近与城市路由共用同一组数值，切路由时相机不跳。 */
export function cityView(target: { x: number; z: number }, radius: number): CameraPose {
  return {
    position: [target.x + radius * 0.24, radius * 0.5, target.z + radius * 0.5],
    target: [target.x, 1.6, target.z],
  };
}

/** 进度自带 easing：这里用平滑的 S 曲线，避免相机起步/收尾生硬。 */
export function easeInOutCubic(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - ((-2 * p + 2) ** 3) / 2;
}

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const horizontal = (position: readonly [number, number, number]) => Math.hypot(position[0], position[2]);
const lerp = (from: number, to: number, p: number) => from + (to - from) * p;

/**
 * 组装期的相机轨迹（§24）。
 *
 * 一条进度同时驱动四件事：方位角（118°）、水平半径、高度、target。
 * 于是"镜头在空间里绕辽宁飞过去"和"行政区一直在落"是同一件事，
 * 不会出现"地图先落完、镜头再明显动"。
 */
export function orbitView(radius: number, progress: number): CameraPose {
  const from = sketchView(radius);
  const to = provinceView(radius);
  const p = clamp01(progress);

  const fromTheta = Math.atan2(from.position[2], from.position[0]);
  const toTheta = Math.atan2(to.position[2], to.position[0]);
  const theta = lerp(fromTheta, toTheta, p);

  const orbitRadius = lerp(horizontal(from.position), horizontal(to.position), p);
  const height = lerp(from.position[1], to.position[1], p);

  return {
    position: [Math.cos(theta) * orbitRadius, height, Math.sin(theta) * orbitRadius],
    target: [
      lerp(from.target[0], to.target[0], p),
      lerp(from.target[1], to.target[1], p),
      lerp(from.target[2], to.target[2], p),
    ],
  };
}

/** 位姿的方位角（度），供测试与调试核对"总变化是不是 118°"。 */
export function azimuthDegrees(pose: CameraPose): number {
  return (Math.atan2(pose.position[2], pose.position[0]) * 180) / Math.PI;
}

/** 从草稿到省域，相机在方位上实际走过的角度（度）。 */
export function orbitSpanDegrees(radius: number): number {
  const span = azimuthDegrees(provinceView(radius)) - azimuthDegrees(sketchView(radius));
  return ((span % 360) + 360) % 360;
}
