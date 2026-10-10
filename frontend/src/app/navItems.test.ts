import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, activeNavItem } from './navItems';

const labelOf = (path: string) => activeNavItem(path)?.label ?? null;

const PATHS = [
  '/liaoning',
  '/decision',
  '/cities/shenyang',
  '/cities/shenyang/decision',
  '/cities/shenyang/research/A03',
  '/research',
  '/reports',
  '/reports/shenyang',
  '/reports/liaoning',
  '/scenario-lab',
  '/about',
  '/',
];

describe('四入口的 Active 语义', () => {
  it('辽宁农业态势高亮省域入口', () => {
    expect(labelOf('/liaoning')).toBe('主页');
  });

  it('决策中心覆盖全局入口、城市决策页与情景推演', () => {
    expect(labelOf('/decision')).toBe('决策');
    expect(labelOf('/cities/shenyang/decision')).toBe('决策');
    expect(labelOf('/scenario-lab')).toBe('决策');
  });

  it('研究中心覆盖研究中心首页、报告、城市与城市研究、关于', () => {
    expect(labelOf('/research')).toBe('报告');
    expect(labelOf('/reports')).toBe('报告');
    expect(labelOf('/reports/shenyang')).toBe('报告');
    expect(labelOf('/cities/shenyang')).toBe('报告');
    expect(labelOf('/cities/shenyang/research/A03')).toBe('报告');
    expect(labelOf('/about')).toBe('关于');
  });

  it('城市决策页不得被研究中心抢走高亮', () => {
    expect(labelOf('/cities/shenyang/decision')).not.toBe('报告');
  });

  it('开场归主页且导航仍可见', () => {
    expect(labelOf('/')).toBe('主页');
  });

  it('任一时刻最多只有一项高亮', () => {
    for (const path of PATHS) {
      const matched = NAV_ITEMS.filter((item) => item.match(path));
      expect(matched.length, path).toBeLessThanOrEqual(1);
    }
  });

  it('一级导航按用户指定的四个任务排列', () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual(['主页', '决策', '报告', '关于']);
  });
});
