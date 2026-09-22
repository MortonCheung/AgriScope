import { NavigationType } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { getRouteDirection, isSpatialEntry } from './routeTransitions';

describe('route transition direction', () => {
  const research = '/cities/shenyang/research/G1';

  it.each([
    ['/', '/liaoning', 0],
    ['/liaoning', '/cities/shenyang', 0],
    ['/cities/shenyang', research, 1],
    ['/cities/shenyang', '/cities/shenyang/report', 1],
    ['/about', '/scenario-lab', 1],
    ['/scenario-lab', research, 0],
  ])('普通 PUSH 从 %s 到 %s 的方向为 %s', (from, to, direction) => {
    expect(getRouteDirection(from, to, { action: NavigationType.Push })).toBe(direction);
  });

  it('POP 使用观测到的索引变化', () => {
    expect(getRouteDirection(research, '/cities/shenyang', { action: NavigationType.Pop, popDirection: -1 })).toBe(-1);
    expect(getRouteDirection('/cities/shenyang', research, { action: NavigationType.Pop, popDirection: 1 })).toBe(1);
  });

  it('REPLACE 视为横向', () => {
    expect(getRouteDirection(research, '/cities/shenyang/report', { action: NavigationType.Replace })).toBe(0);
  });

  it('共享同一 Canvas 的路由交给相机接管', () => {
    expect(isSpatialEntry('/', '/liaoning')).toBe(true);
    expect(isSpatialEntry('/liaoning', '/cities/shenyang')).toBe(true);
    expect(isSpatialEntry('/cities/shenyang', '/cities/shenyang/report')).toBe(false);
  });
});
