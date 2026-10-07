import { describe, expect, it } from 'vitest';
import {
  ROUTES,
  canonicalResearchId,
  isLegacyPayloadResearchId,
  parseResearchPath,
  structuralParent,
} from './routes';

describe('ROUTES（本轮 §9）', () => {
  it('一级入口是 研究 / 报告 / 推演 / 关于', () => {
    expect(ROUTES.researchHome).toBe('/liaoning');
    expect(ROUTES.reports).toBe('/reports');
    expect(ROUTES.scenario).toBe('/scenario-lab');
    expect(ROUTES.about).toBe('/about');
  });

  it('方向与研究点共用一条 research 路径', () => {
    expect(ROUTES.research('shenyang', 'A2')).toBe('/cities/shenyang/research/A2');
    expect(ROUTES.research('shenyang', 'A2.2')).toBe('/cities/shenyang/research/A2.2');
    expect(ROUTES.city('shenyang')).toBe('/cities/shenyang');
    expect(ROUTES.cityReport('shenyang')).toBe('/reports/shenyang');
    expect(ROUTES.provinceReport).toBe('/reports/liaoning');
  });

  it('URL 里不出现载荷编号（A01）', () => {
    expect(ROUTES.research('shenyang', 'A1')).not.toContain('A01');
    expect(parseResearchPath('/cities/shenyang/research/A2.2')).toEqual({ cityId: 'shenyang', researchId: 'A2.2' });
    expect(parseResearchPath('/cities/shenyang/research/A2')).toEqual({ cityId: 'shenyang', researchId: 'A2' });
    expect(parseResearchPath('/cities/shenyang')).toBeNull();
  });

  it('旧路径只是 Redirect 目标，不再作为正式入口', () => {
    expect(ROUTES.legacyProvinceResearch).toBe('/research');
    expect(ROUTES.legacyCityReport('shenyang')).toBe('/cities/shenyang/report');
    expect(ROUTES.legacyRainstorm).toBe('/shenyang-rainstorm');
  });
});

describe('canonicalResearchId：载荷编号归一（本轮 §4）', () => {
  it('A01 → A1，A01.3 → A1.3', () => {
    expect(canonicalResearchId('A01')).toBe('A1');
    expect(canonicalResearchId('A08')).toBe('A8');
    expect(canonicalResearchId('A01.3')).toBe('A1.3');
    expect(canonicalResearchId('A08.11')).toBe('A8.11');
  });

  it('canonical 编号原样返回', () => {
    expect(canonicalResearchId('A2')).toBe('A2');
    expect(canonicalResearchId('A2.2')).toBe('A2.2');
    expect(canonicalResearchId('X9')).toBe('X9');
  });

  it('能判断是否需要重定向', () => {
    expect(isLegacyPayloadResearchId('A01')).toBe(true);
    expect(isLegacyPayloadResearchId('A1')).toBe(false);
    expect(isLegacyPayloadResearchId('A02.11')).toBe(true);
  });
});

describe('structuralParent：两级层级（本轮 §10）', () => {
  it('研究点 → 方向 → 城市 → 辽宁 → 首页', () => {
    expect(structuralParent('/cities/shenyang/research/A2.2')).toBe('/cities/shenyang/research/A2');
    expect(structuralParent('/cities/shenyang/research/A2')).toBe('/cities/shenyang');
    expect(structuralParent('/cities/shenyang')).toBe('/liaoning');
    expect(structuralParent('/liaoning')).toBe('/');
  });

  it('不再把所有 /research/* 直接跳城市', () => {
    // 旧行为会把 A2.2 直接跳到 /cities/shenyang，跳过"方向"这一层。
    expect(structuralParent('/cities/shenyang/research/A3.9')).not.toBe('/cities/shenyang');
    expect(structuralParent('/cities/shenyang/research/A8.11')).toBe('/cities/shenyang/research/A8');
  });

  it('旧编号写法也能推出正确的上一层', () => {
    expect(structuralParent('/cities/shenyang/research/A03.9')).toBe('/cities/shenyang/research/A3');
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
