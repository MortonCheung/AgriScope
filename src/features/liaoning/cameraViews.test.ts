import { describe, expect, it } from 'vitest';
import {
  ENTRY_AZIMUTH_ORBIT_DEGREES,
  PROVINCE_ROOT_ROTATION,
  azimuthDegrees,
  orbitSpanDegrees,
  orbitView,
  provinceView,
  sketchView,
} from './cameraViews';

/**
 * Opening 相机（本轮 §24/§33.11–13）。
 *
 * 三条要求都能机械判定：
 *   11. 省域根节点 rotation 全程为 0；
 *   12. 起点 / 中点 / 终点的 position 明显不同；
 *   13. 总方位变化约 118°，不是 360°。
 */

const RADIUS = 100;

/** 逐分量比较：orbitView 用极坐标重算，末位浮点会与直接写出的位姿有微小差异。 */
function expectSamePose(actual: ReturnType<typeof orbitView>, expected: ReturnType<typeof orbitView>) {
  actual.position.forEach((value, index) => expect(value).toBeCloseTo(expected.position[index], 9));
  actual.target.forEach((value, index) => expect(value).toBeCloseTo(expected.target[index], 9));
}

describe('相机位姿的边界条件', () => {
  it('第 0 帧等于草稿机位，第 1 帧等于正式省域机位', () => {
    expectSamePose(orbitView(RADIUS, 0), sketchView(RADIUS));
    expectSamePose(orbitView(RADIUS, 1), provinceView(RADIUS));
  });

  it('进度会被夹在 0–1，越界不会造出奇怪的机位', () => {
    expectSamePose(orbitView(RADIUS, -3), sketchView(RADIUS));
    expectSamePose(orbitView(RADIUS, 4), provinceView(RADIUS));
  });
});

describe('总方位变化（§33.13）', () => {
  it('恰是 118°，不是 360°', () => {
    expect(ENTRY_AZIMUTH_ORBIT_DEGREES).toBe(118);
    expect(orbitSpanDegrees(RADIUS)).toBeCloseTo(118, 4);
    expect(orbitSpanDegrees(RADIUS)).not.toBeCloseTo(360, 0);
  });

  it('方位角在整段里单调推进，不会绕回去', () => {
    let previous = azimuthDegrees(orbitView(RADIUS, 0));
    for (let step = 1; step <= 20; step += 1) {
      const current = azimuthDegrees(orbitView(RADIUS, step / 20));
      expect(current).toBeGreaterThanOrEqual(previous - 1e-6);
      previous = current;
    }
  });
});

describe('起点 / 中点 / 终点明显不同（§33.12）', () => {
  const start = orbitView(RADIUS, 0);
  const middle = orbitView(RADIUS, 0.5);
  const end = orbitView(RADIUS, 1);

  const distance = (a: { position: readonly [number, number, number] }, b: { position: readonly [number, number, number] }) =>
    Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1], a.position[2] - b.position[2]);

  it('三个位姿两两相距可观（不是"原地小抖动"）', () => {
    expect(distance(start, middle)).toBeGreaterThan(RADIUS * 0.5);
    expect(distance(middle, end)).toBeGreaterThan(RADIUS * 0.5);
    expect(distance(start, end)).toBeGreaterThan(RADIUS * 0.5);
  });

  it('高度一路下降，距离一路靠近，target 也在移动', () => {
    expect(start.position[1]).toBeGreaterThan(middle.position[1]);
    expect(middle.position[1]).toBeGreaterThan(end.position[1]);
    const horizontal = (pose: typeof start) => Math.hypot(pose.position[0], pose.position[2]);
    expect(horizontal(start)).toBeLessThan(horizontal(end));
    expect(start.target[1]).toBeLessThan(end.target[1]);
  });

  it('草稿机位仍然是高角度俯视（看得到整张纸）', () => {
    const start_ = sketchView(RADIUS);
    const elevation = Math.atan2(start_.position[1], Math.hypot(start_.position[0], start_.position[2]));
    expect((elevation * 180) / Math.PI).toBeGreaterThan(75);
  });
});

describe('模型本身不转（§33.11）', () => {
  it('省域根节点的 rotation 常量是 0', () => {
    expect(PROVINCE_ROOT_ROTATION).toBe(0);
  });

  it('位姿只有 position 与 target，没有任何旋转自由度', () => {
    const pose = orbitView(RADIUS, 0.37);
    expect(Object.keys(pose).sort()).toEqual(['position', 'target']);
  });
});
