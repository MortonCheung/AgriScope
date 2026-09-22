import { describe, expect, it } from 'vitest';
import { ROUTES, structuralParent } from './routes';

describe('structural parent (V3 §10 返回结构 fallback)', () => {
  it.each([
    ['/', null],
    [ROUTES.about, ROUTES.root],
    [ROUTES.liaoning, ROUTES.root],
    [ROUTES.provinceResearch, ROUTES.root],
    [ROUTES.city('shenyang'), ROUTES.liaoning],
    [ROUTES.report('shenyang'), ROUTES.city('shenyang')],
    [ROUTES.research('shenyang', 'C5'), ROUTES.city('shenyang')],
    [ROUTES.rainstorm, ROUTES.report('shenyang')],
    [ROUTES.scenarioLab, ROUTES.rainstorm],
  ])('%s 的上一层是 %s', (path, parent) => {
    expect(structuralParent(path)).toBe(parent);
  });

  it('拖尾斜杠不影响判断', () => {
    expect(structuralParent('/cities/shenyang/')).toBe(ROUTES.liaoning);
    expect(structuralParent('/cities/shenyang/report/')).toBe(ROUTES.city('shenyang'));
  });
});
