import { NavigationType } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { getRouteDirection, isSpatialEntry, isWorkspaceNavigation } from './routeTransitions';

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

  it('同城工作台切点或业务任务不重新演出整页转场', () => {
    expect(isWorkspaceNavigation('/cities/shenyang/research/A2.2', '/cities/shenyang/research/A3')).toBe(true);
    expect(isWorkspaceNavigation('/cities/shenyang', '/cities/shenyang/research/A2')).toBe(true);
    expect(isWorkspaceNavigation('/cities/shenyang/decision', '/cities/shenyang/research/A2')).toBe(true);
    expect(isWorkspaceNavigation('/cities/shenyang/research/A2', '/cities/dandong/research/A2')).toBe(false);
    expect(isWorkspaceNavigation('/liaoning', '/cities/shenyang/decision')).toBe(false);
  });

  it.each(['shenyang','tieling','chaoyang','jinzhou','dandong','dalian'])('正式%s报告与本城工作区双向无整页转场', city => {
    const report = `/reports/${city}`;
    for (const path of [`/cities/${city}`, `/cities/${city}/decision`, `/cities/${city}/research/A2`]) {
      expect(isWorkspaceNavigation(report, path)).toBe(true);
      expect(isWorkspaceNavigation(path, report)).toBe(true);
    }
    expect(isWorkspaceNavigation(report, '/reports')).toBe(false);
    expect(isWorkspaceNavigation(report, '/reports/liaoning')).toBe(false);
    expect(isWorkspaceNavigation(report, '/cities/unknown/decision')).toBe(false);
  });
  it('城市目录与未知城市不冒充同城工作台', () => {
    expect(isWorkspaceNavigation('/reports/shenyang','/cities/dandong/decision')).toBe(false);
    expect(isWorkspaceNavigation('/reports/unknown','/cities/unknown/decision')).toBe(false);
  });
});
