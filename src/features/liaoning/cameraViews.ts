/**
 * 相机位姿的唯一来源（V5 §60/§62）。
 *
 * 关键约束：Opening 的**最后一帧**必须与正式省域的机位**完全相同**，
 * 所以两边都调用同一个 `provinceView()`，不写"差不多"的近似值。
 */

export interface CameraPose {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
}

/** 正式省域沙盘机位：/liaoning 与 Opening 终点共用。 */
export function provinceView(radius: number): CameraPose {
  return { position: [radius * 0.04, radius * 1.08, radius * 1.36], target: [0, 2, 0] };
}

/** 草稿态机位：接近垂直俯视，能看全整张图纸。 */
export function sketchView(radius: number): CameraPose {
  return { position: [0, radius * 3.4, radius * 0.55], target: [0, 0, 0] };
}

/** 城市推近机位：省域推近与城市路由共用同一组数值，切路由时相机不跳。 */
export function cityView(target: { x: number; z: number }, radius: number): CameraPose {
  return {
    position: [target.x + radius * 0.24, radius * 0.5, target.z + radius * 0.5],
    target: [target.x, 1.6, target.z],
  };
}

const horizontal = (position: readonly [number, number, number]) => Math.hypot(position[0], position[2]);

/** 进度自带 easing：这里用平滑的 S 曲线，避免相机起步/收尾生硬。 */
export function easeInOutCubic(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - ((-2 * p + 2) ** 3) / 2;
}

/**
 * 组装期的螺旋环绕（V5 §60）：
 * 半径与高度从草稿位姿线性插值到省域位姿，同时在方位角上绕行**整整一圈**，
 * 让"运动本身就是叙事"，而不是模型动完镜头再动。
 */
export function orbitView(radius: number, progress: number): CameraPose {
  const from = sketchView(radius);
  const to = provinceView(radius);
  const p = progress < 0 ? 0 : progress > 1 ? 1 : progress;

  const fromRadius = horizontal(from.position);
  const toRadius = horizontal(to.position);
  const orbitRadius = fromRadius + (toRadius - fromRadius) * p;
  const height = from.position[1] + (to.position[1] - from.position[1]) * p;

  const finalTheta = Math.atan2(to.position[2], to.position[0]);
  const theta = finalTheta - Math.PI * 2 * (1 - p);

  const target: readonly [number, number, number] = [
    from.target[0] + (to.target[0] - from.target[0]) * p,
    from.target[1] + (to.target[1] - from.target[1]) * p,
    from.target[2] + (to.target[2] - from.target[2]) * p,
  ];

  return {
    position: [Math.cos(theta) * orbitRadius, height, Math.sin(theta) * orbitRadius],
    target,
  };
}
