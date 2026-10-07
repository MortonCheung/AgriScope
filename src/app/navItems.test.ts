import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, activeNavItem } from './navItems';

const labelOf = (path: string) => activeNavItem(path)?.label ?? null;

const PATHS = [
  '/liaoning',
  '/cities/shenyang',
  '/cities/shenyang/research/A03',
  '/reports',
  '/reports/shenyang',
  '/reports/liaoning',
  '/scenario-lab',
  '/about',
  '/',
];

describe('导航 Active 语义（V5 §23）', () => {
  it('研究高亮 /liaoning 与 /cities/*', () => {
    expect(labelOf('/liaoning')).toBe('研究');
    expect(labelOf('/cities/shenyang')).toBe('研究');
    expect(labelOf('/cities/shenyang/research/A03')).toBe('研究');
  });

  it('报告高亮 /reports 与 /reports/*', () => {
    expect(labelOf('/reports')).toBe('报告');
    expect(labelOf('/reports/shenyang')).toBe('报告');
    expect(labelOf('/reports/liaoning')).toBe('报告');
  });

  it('报告前缀不得抢走城市路径的高亮（§23 明确除外）', () => {
    expect(labelOf('/cities/shenyang')).not.toBe('报告');
    expect(labelOf('/cities/shenyang/research/A03')).not.toBe('报告');
  });

  it('推演与关于各自独立', () => {
    expect(labelOf('/scenario-lab')).toBe('推演');
    expect(labelOf('/about')).toBe('关于');
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

  it('导航顺序冻结为 研究 / 报告 / 推演 / 关于', () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual(['研究', '报告', '推演', '关于']);
  });
});
