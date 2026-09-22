import { describe, expect, it } from 'vitest';
import { ROUTES, structuralParent } from './routes';

describe('ROUTES（V5 §21）', () => {
  it('一级入口是 研究 / 报告 / 推演 / 关于', () => {
    expect(ROUTES.researchHome).toBe('/liaoning');
    expect(ROUTES.reports).toBe('/reports');
    expect(ROUTES.scenario).toBe('/scenario-lab');
    expect(ROUTES.about).toBe('/about');
  });

  it('研究条目与报告分属不同路径空间', () => {
    expect(ROUTES.researchNote('shenyang', 'A03')).toBe('/cities/shenyang/research/A03');
    expect(ROUTES.city('shenyang')).toBe('/cities/shenyang');
    expect(ROUTES.cityReport('shenyang')).toBe('/reports/shenyang');
    expect(ROUTES.provinceReport).toBe('/reports/liaoning');
  });

  it('旧路径只是 Redirect 目标，不再作为正式入口（§22）', () => {
    expect(ROUTES.legacyProvinceResearch).toBe('/research');
    expect(ROUTES.legacyCityReport('shenyang')).toBe('/cities/shenyang/report');
    expect(ROUTES.legacyRainstorm).toBe('/shenyang-rainstorm');
  });
});

describe('structuralParent（V5 §24）', () => {
  it('研究条目 → 城市 → 辽宁 → 首页', () => {
    expect(structuralParent('/cities/shenyang/research/A03')).toBe('/cities/shenyang');
    expect(structuralParent('/cities/shenyang')).toBe('/liaoning');
    expect(structuralParent('/liaoning')).toBe('/');
  });

  it('报告 → 报告目录；综合报告也回到报告目录', () => {
    expect(structuralParent('/reports/shenyang')).toBe('/reports');
    expect(structuralParent('/reports/liaoning')).toBe('/reports');
    expect(structuralParent('/reports')).toBe('/');
  });

  it('推演与关于回到首页', () => {
    expect(structuralParent('/scenario-lab')).toBe('/');
    expect(structuralParent('/about')).toBe('/');
  });

  it('首页没有上一级', () => {
    expect(structuralParent('/')).toBeNull();
  });
});
