import { describe, expect, it } from 'vitest';
import {
  ROUTES,
  canonicalResearchId,
  isLegacyPayloadResearchId,
  parseResearchPath,
  structuralParent,
} from './routes';

describe('ROUTES（本轮 §9 / V3 §4）', () => {
  it('一级入口是 辽宁农业态势 / 决策中心 / 研究中心', () => {
    expect(ROUTES.liaoning).toBe('/liaoning');
    expect(ROUTES.decisionCenter).toBe('/decision');
    expect(ROUTES.researchCenter).toBe('/research');
  });

  it('报告 / 推演 / 关于 仍可达，只是不再是一级入口', () => {
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
  it('研究点 → 方向 → 城市 → 选城地图 → 全省终点', () => {
    expect(structuralParent('/cities/shenyang/research/A2.2')).toBe('/cities/shenyang/research/A2');
    expect(structuralParent('/cities/shenyang/research/A2')).toBe('/cities/shenyang');
    expect(structuralParent('/cities/shenyang')).toBe('/liaoning?city=shenyang');
    expect(structuralParent('/liaoning')).toBeNull();
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
    expect(structuralParent('/reports')).toBe('/liaoning');
  });

  it('推演与关于回到首页', () => {
    expect(structuralParent('/scenario-lab')).toBe('/liaoning');
    expect(structuralParent('/about')).toBe('/liaoning');
  });

  it('决策中心与研究中心回到首页', () => {
    expect(structuralParent('/decision')).toBe('/liaoning');
    expect(structuralParent('/research')).toBe('/liaoning');
  });

  it('全省主页没有上一级，明确开场路径仍保留', () => {
    expect(structuralParent('/liaoning')).toBeNull();
    expect(structuralParent('/liaoning/')).toBeNull();
    expect(structuralParent('/')).toBeNull();
  });

  it('选城主页回全省，决策直接回本城地图，不误进报告', () => {
    expect(structuralParent('/liaoning', '?city=dandong')).toBe('/liaoning');
    expect(structuralParent('/cities/chaoyang/decision', '?city=shenyang&horizon=30')).toBe('/liaoning?city=chaoyang');
    expect(structuralParent('/cities/unknown/decision')).toBe('/liaoning');
  });

  it('点到方向再到城市，保留有效经营条件而移除下级定位', () => {
    const search = '?city=dandong&crop=黄瓜&horizon=30&as_of=2026-10-06&research=A1.1&mode=article&plan=old';
    const parent = structuralParent('/cities/shenyang/research/A2.2', search)!;
    const [path, query] = parent.split('?');
    expect(path).toBe('/cities/shenyang/research/A2');
    expect(Object.fromEntries(new URLSearchParams(query))).toEqual({ city: 'shenyang', crop: '黄瓜', horizon: '30', as_of: '2026-10-06' });
    expect(structuralParent('/cities/shenyang', '?research=A2.2')).toBe('/cities/shenyang/research/A2');
    expect(structuralParent('/cities/shenyang', '?research=A2')).toBe('/cities/shenyang');
  });
});


describe('final delivery six-city structural navigation', () => {
  it.each(['shenyang','tieling','chaoyang','jinzhou','dandong','dalian'])('%s follows one level without entering Opening', city => {
    expect(structuralParent(`/reports/${city}`)).toBe('/reports');
    expect(structuralParent(`/cities/${city}/decision`)).toBe(`/liaoning?city=${city}`);
    expect(structuralParent(`/cities/${city}`)).toBe(`/liaoning?city=${city}`);
    expect(structuralParent(`/cities/${city}/research/A6`)).toBe(`/cities/${city}`);
    expect(structuralParent('/liaoning', `?city=${city}`)).toBe('/liaoning');
    expect(structuralParent('/reports')).toBe('/liaoning');
    expect(structuralParent('/liaoning')).toBeNull();
  });
  it('unknown and trailing-slash routes never fall back to Opening', () => {
    expect(structuralParent('/about/')).toBe('/liaoning');
    expect(structuralParent('/reports/')).toBe('/liaoning');
    expect(structuralParent('/unknown')).toBe('/liaoning');
  });
});
