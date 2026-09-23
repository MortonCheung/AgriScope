import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { OUTLINE_COVERAGE_LIMIT, buildLiaoningSolidModel, provinceOutline } from './liaoningGeometry';

/**
 * 辽宁外轮廓（本轮 §23）。
 *
 * 外轮廓不是手描的，而是从"14 个地级市拼成全省"这件事推出来的：
 * 只被一个多边形用到的边就是省界。用例分两层：
 *   · 算法本身（合成方块，结论可手算）；
 *   · 真实省界数据（同一份 public/geo/liaoning.json）。
 */

const square = (x: number, y: number, size: number): THREE.Vector2[] => [
  new THREE.Vector2(x, y),
  new THREE.Vector2(x + size, y),
  new THREE.Vector2(x + size, y + size),
  new THREE.Vector2(x, y + size),
];

/** 真实省界数据：与运行时读的是同一份文件。 */
const geoRaw = import.meta.glob('../../../public/geo/liaoning.json', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

describe('provinceOutline 的算法行为', () => {
  it('两块共享一条边的方块 → 外轮廓恰是合并后的长方形', () => {
    const { rings, coverage } = provinceOutline([square(0, 0, 10), square(10, 0, 10)]);
    expect(rings).toHaveLength(1);
    // 合并矩形周长 60，两条方块周长合计 80 → 外轮廓占 0.75
    expect(coverage).toBeCloseTo(0.75, 5);
    const xs = rings[0].map((point) => point.x);
    const ys = rings[0].map((point) => point.y);
    expect(Math.min(...xs)).toBeCloseTo(0, 5);
    expect(Math.max(...xs)).toBeCloseTo(20, 5);
    expect(Math.min(...ys)).toBeCloseTo(0, 5);
    expect(Math.max(...ys)).toBeCloseTo(10, 5);
  });

  it('互不相邻的方块：每条边都算外轮廓', () => {
    expect(provinceOutline([square(0, 0, 4), square(20, 0, 4)]).coverage).toBeCloseTo(1, 5);
  });

  it('端点量化后仍能配对（相邻边界顶点不完全一致也认得出）', () => {
    const left = square(0, 0, 10);
    const right = [
      new THREE.Vector2(10.01, 0.01),
      new THREE.Vector2(20, 0),
      new THREE.Vector2(20, 10),
      new THREE.Vector2(9.99, 10.01),
    ];
    expect(provinceOutline([left, right], 0.05).coverage).toBeLessThan(1);
  });
});

describe('真实省界数据上的模型', () => {
  const raw = Object.values(geoRaw)[0];

  it('同一份省界数据：14 个地级市，当前只有沈阳已发布研究', () => {
    expect(raw, '缺少 public/geo/liaoning.json').toBeTruthy();
    const model = buildLiaoningSolidModel(JSON.parse(raw));
    expect(model.cities).toHaveLength(14);
    expect(model.cities.filter((city) => city.hasResearch).map((city) => city.id)).toEqual(['shenyang']);
    expect(model.provinceRings.length).toBeGreaterThanOrEqual(14);
    expect(model.radius).toBeGreaterThan(0);
  });

  it('能推出可用的辽宁外轮廓（覆盖率在线内，因此这一层会被渲染）', () => {
    const model = buildLiaoningSolidModel(JSON.parse(raw));
    expect(model.provinceOutlineRings.length).toBeGreaterThan(0);
    const { coverage } = provinceOutline(model.provinceRings);
    expect(coverage).toBeGreaterThan(0);
    expect(coverage).toBeLessThanOrEqual(OUTLINE_COVERAGE_LIMIT);
  });

  it('外轮廓比全部边界短得多，说明内部市界被正确消掉', () => {
    const model = buildLiaoningSolidModel(JSON.parse(raw));
    const outlinePoints = model.provinceOutlineRings.reduce((sum, ring) => sum + ring.length, 0);
    const allPoints = model.provinceRings.reduce((sum, ring) => sum + ring.length, 0);
    expect(outlinePoints).toBeLessThan(allPoints * 0.6);
  });
});
