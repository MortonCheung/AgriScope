import { describe, expect, it } from 'vitest';
import { ROUTES } from './routes';
import { NAV_ITEMS, activeNavItem } from './navItems';

describe('顶部导航 Active 语义（V4 §十四）', () => {
  it.each([
    [ROUTES.liaoning, '辽宁'],
    [ROUTES.city('shenyang'), '辽宁'],
    [ROUTES.city('tieling'), '辽宁'],
    [ROUTES.report('shenyang'), '辽宁'],
    [ROUTES.research('shenyang', 'C5'), '辽宁'],
    [ROUTES.rainstorm, '辽宁'],
    [ROUTES.provinceResearch, '研究'],
    [`${ROUTES.provinceResearch}/anything`, '研究'],
    [ROUTES.scenarioLab, '情景实验'],
    [ROUTES.about, '关于'],
  ])('%s 高亮「%s」', (path, label) => {
    expect(activeNavItem(path)?.label).toBe(label);
  });

  it('「研究」不再被单城市报告点亮（V4 §十三：研究 ≠ 沈阳报告）', () => {
    expect(activeNavItem(ROUTES.report('shenyang'))?.label).not.toBe('研究');
    expect(activeNavItem(ROUTES.research('shenyang', 'C5'))?.label).not.toBe('研究');
  });

  it('一条路径最多点亮一项，且首页不点亮任何项', () => {
    const paths = [
      ROUTES.liaoning,
      ROUTES.city('shenyang'),
      ROUTES.report('shenyang'),
      ROUTES.research('shenyang', 'C5'),
      ROUTES.rainstorm,
      ROUTES.provinceResearch,
      ROUTES.scenarioLab,
      ROUTES.about,
    ];
    for (const path of paths) {
      expect(NAV_ITEMS.filter((item) => item.match(path))).toHaveLength(1);
    }
    expect(activeNavItem(ROUTES.root)).toBeNull();
  });
});
