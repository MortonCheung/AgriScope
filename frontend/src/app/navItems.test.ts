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

describe('导航 Active 语义（V3 §4）', () => {
  it('辽宁农业态势高亮省域入口', () => {
    expect(labelOf('/liaoning')).toBe('辽宁农业态势');
  });

  it('决策中心覆盖全局入口、城市决策页与情景推演', () => {
    expect(labelOf('/decision')).toBe('决策中心');
    expect(labelOf('/cities/shenyang/decision')).toBe('决策中心');
    expect(labelOf('/scenario-lab')).toBe('决策中心');
  });

  it('研究中心覆盖研究中心首页、报告、城市与城市研究、关于', () => {
    expect(labelOf('/research')).toBe('研究中心');
    expect(labelOf('/reports')).toBe('研究中心');
    expect(labelOf('/reports/shenyang')).toBe('研究中心');
    expect(labelOf('/cities/shenyang')).toBe('研究中心');
    expect(labelOf('/cities/shenyang/research/A03')).toBe('研究中心');
    expect(labelOf('/about')).toBe('研究中心');
  });

  it('城市决策页不得被研究中心抢走高亮', () => {
    expect(labelOf('/cities/shenyang/decision')).not.toBe('研究中心');
  });

  it('首页不高亮任何一项', () => {
    expect(labelOf('/')).toBeNull();
  });

  it('任一时刻最多只有一项高亮', () => {
    for (const path of PATHS) {
      const matched = NAV_ITEMS.filter((item) => item.match(path));
      expect(matched.length, path).toBeLessThanOrEqual(1);
    }
  });

  it('一级导航冻结为 辽宁农业态势 / 决策中心 / 研究中心', () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual(['辽宁农业态势', '决策中心', '研究中心']);
  });
});
