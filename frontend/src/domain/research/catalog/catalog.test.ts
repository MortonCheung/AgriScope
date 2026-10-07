import { describe, expect, it } from 'vitest';
import {
  getCatalog,
  getPoint,
  getTopic,
  listCatalogCityIds,
  listPoints,
  listTopics,
  researchParent,
  researchIdKind,
  topicOfPoint,
  validateCatalog,
  type CityResearchCatalog,
} from './index';

/**
 * 研究契约测试（本轮 §33）。
 *
 * 分两层：
 *   1. 沈阳契约 —— 8 方向 / 76 点是研究侧冻结的**具体数字**，必须精确匹配；
 *   2. 通用契约 —— 组件不能依赖任何具体数字，用 6 方向与 10 方向的 fixture 证明。
 */

/** 研究侧冻结的每个方向的点位数（§7）。 */
const SHENYANG_POINT_COUNTS: Record<string, number> = {
  A1: 8, A2: 11, A3: 10, A4: 10, A5: 8, A6: 9, A7: 9, A8: 11,
};

describe('沈阳研究契约（§7/§33）', () => {
  const catalog = getCatalog('shenyang') as CityResearchCatalog;

  it('topic 数 = 8，point 数 = 76', () => {
    expect(catalog).not.toBeNull();
    expect(listTopics('shenyang')).toHaveLength(8);
    expect(listPoints('shenyang')).toHaveLength(76);
  });

  it('每个方向的点位数与研究侧冻结值一致', () => {
    const actual: Record<string, number> = {};
    for (const topic of listTopics('shenyang')) actual[topic.id] = topic.points.length;
    expect(actual).toEqual(SHENYANG_POINT_COUNTS);
  });

  it('所有 point id 唯一', () => {
    const ids = listPoints('shenyang').map((point) => point.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每个 point 的 topicId 都存在，且编号前缀与方向一致', () => {
    for (const point of listPoints('shenyang')) {
      expect(getTopic('shenyang', point.topicId), `${point.id} 的 topicId`).not.toBeNull();
      expect(point.id.startsWith(`${point.topicId}.`), `${point.id} 前缀`).toBe(true);
    }
  });

  it('A9 不在研究树里（§29）', () => {
    const topicIds = listTopics('shenyang').map((topic) => topic.id);
    expect(topicIds).not.toContain('A9');
    expect(catalog.reportArticleId).toBe('A9');
    expect(topicIds).not.toContain(catalog.reportArticleId);
  });

  it('结构自检通过，没有遗留问题', () => {
    expect(validateCatalog(catalog)).toEqual([]);
  });

  it('ready 点必须带模块、绑定、分类轴与引用；pending 必须写明缺口', () => {
    for (const point of listPoints('shenyang')) {
      if (point.status === 'ready') {
        expect(point.module, `${point.id} module`).toBeTruthy();
        expect(point.binding, `${point.id} binding`).toBeTruthy();
        expect(point.citations?.length, `${point.id} citations`).toBeGreaterThan(0);
        if (point.binding?.view === 'chart') expect(point.binding.category, `${point.id} category`).toBeTruthy();
        expect(point.binding?.focus, `${point.id} focus`).toBeTruthy();
      }
      if (point.status === 'pending') {
        expect(point.reason, `${point.id} reason`).toBeTruthy();
        expect(point.binding, `${point.id} 不应有绑定`).toBeUndefined();
      }
      if (point.status === 'unsupported') {
        expect(point.citations?.length, `${point.id} 判定原句`).toBeGreaterThan(0);
        expect(point.reason, `${point.id} reason`).toBeTruthy();
      }
    }
  });

  it('三种状态的判定与 §21 一致', () => {
    const counts = listPoints('shenyang').reduce<Record<string, number>>((acc, point) => {
      acc[point.status] = (acc[point.status] ?? 0) + 1;
      return acc;
    }, {});
    // 数字来自研究侧：可交付的 54 个点有真实数据，19 个结构存在但内容未接入，3 个研究侧判定不足。
    expect(counts.ready).toBe(54);
    expect(counts.pending).toBe(19);
    expect(counts.unsupported).toBe(3);
    expect(counts.ready + counts.pending + counts.unsupported).toBe(76);
  });
});

describe('方向页 Explorer 契约（§38/§39）', () => {
  it('A3 声明了滞后窗口与累积暴露两个 Explorer，且都写明 selectors / category / focus', () => {
    const a3 = getTopic('shenyang', 'A3');
    expect(a3?.explorers?.map((explorer) => explorer.id)).toEqual(['lag-window', 'accumulation']);
    for (const explorer of a3?.explorers ?? []) {
      expect(explorer.title, `${explorer.id} title`).toBeTruthy();
      expect(explorer.category, `${explorer.id} category`).toBeTruthy();
      expect(explorer.focus, `${explorer.id} focus`).toBeTruthy();
      expect(Array.isArray(explorer.selectors)).toBe(true);
      expect(explorer.selectors?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('两个 Explorer 都指向研究侧真实的表与列（滞后窗口 window_key·beta / 累积暴露 cum_days·beta_per_sd）', () => {
    const explorers = getTopic('shenyang', 'A3')?.explorers ?? [];
    expect(explorers.find((explorer) => explorer.id === 'lag-window')).toMatchObject({
      table: 'A03_lag_windows.csv', category: 'window_key', focus: 'beta',
    });
    expect(explorers.find((explorer) => explorer.id === 'accumulation')).toMatchObject({
      table: 'A03_accumulation.csv', category: 'cum_days', focus: 'beta_per_sd',
    });
  });

  it('结构自检能抓出缺字段的 explorer', () => {
    const catalog = getCatalog('shenyang') as CityResearchCatalog;
    const broken = structuredClone(catalog);
    const target = broken.topics.find((topic) => topic.id === 'A3');
    if (target?.explorers?.[0]) target.explorers[0].category = '';
    expect(validateCatalog(broken).some((problem) => problem.includes('explorer'))).toBe(true);
  });

  it('没有 explorers 的方向仍然自洽（通用契约不要求 explorer）', () => {
    const a1 = getTopic('shenyang', 'A1');
    expect(a1?.explorers ?? []).toEqual([]);
  });
});

describe('研究 id 解析（§5/§10）', () => {
  it('能区分方向与研究点', () => {
    expect(researchIdKind('shenyang', 'A2')).toBe('topic');
    expect(researchIdKind('shenyang', 'A2.2')).toBe('point');
    expect(researchIdKind('shenyang', 'A9')).toBeNull();
    expect(researchIdKind('shenyang', 'nope')).toBeNull();
  });

  it('研究点能找回所属方向', () => {
    expect(topicOfPoint('shenyang', 'A4.8')?.id).toBe('A4');
    expect(getPoint('shenyang', 'A8.11')?.topicId).toBe('A8');
  });

  it('^ 的层级：点 → 方向，方向 → 城市', () => {
    expect(researchParent('shenyang', 'A2.2')).toEqual({ to: 'topic', id: 'A2' });
    expect(researchParent('shenyang', 'A2')).toEqual({ to: 'city', id: 'shenyang' });
  });
});

describe('通用契约不依赖具体方向数量（§33.6）', () => {
  const makeCatalog = (topicCount: number, pointsPerTopic: number): CityResearchCatalog => ({
    schemaVersion: 'fixture-1.0',
    cityId: 'fixture',
    cityCode: 'FX',
    topics: Array.from({ length: topicCount }, (_, topicIndex) => {
      const topicId = `A${topicIndex + 1}`;
      return {
        id: topicId,
        title: `方向 ${topicIndex + 1}`,
        articleId: topicId,
        articleTitle: `文章 ${topicIndex + 1}`,
        order: topicIndex + 1,
        points: Array.from({ length: pointsPerTopic }, (_, pointIndex) => ({
          id: `${topicId}.${pointIndex + 1}`,
          topicId,
          articleId: topicId,
          title: `研究点 ${topicIndex + 1}.${pointIndex + 1}`,
          status: 'pending' as const,
          reason: 'fixture',
        })),
      };
    }),
  });

  it('6 个方向的目录结构自洽', () => {
    const catalog = makeCatalog(6, 5);
    expect(validateCatalog(catalog)).toEqual([]);
    expect(catalog.topics).toHaveLength(6);
    expect(catalog.topics.flatMap((topic) => topic.points)).toHaveLength(30);
  });

  it('10 个方向的目录结构自洽', () => {
    const catalog = makeCatalog(10, 9);
    expect(validateCatalog(catalog)).toEqual([]);
    expect(catalog.topics).toHaveLength(10);
  });

  it('结构自检能抓出编号与引用错误', () => {
    const broken = makeCatalog(3, 2);
    broken.topics[1].points[0].topicId = 'A1';
    broken.topics[2].id = 'A3';
    broken.topics[2].articleId = 'A2';
    const problems = validateCatalog(broken);
    expect(problems.some((p) => p.includes('topicId'))).toBe(true);
    expect(problems.some((p) => p.includes('articleId'))).toBe(true);
  });

  it('fixture 目录可用同一套解析函数读取（不依赖沈阳的数字）', () => {
    const catalog = makeCatalog(10, 4);
    const points = catalog.topics.flatMap((topic) => topic.points);
    expect(points).toHaveLength(40);
    // 编号前缀规则对任意方向数量都成立。
    for (const point of points) expect(point.id.startsWith(`${point.topicId}.`)).toBe(true);
  });
});

describe('注册表', () => {
  it('沈阳已注册', () => {
    expect(listCatalogCityIds()).toContain('shenyang');
  });

  it('未注册的城市返回空结构，而不是抛错', () => {
    expect(getCatalog('nowhere')).toBeNull();
    expect(listTopics('nowhere')).toEqual([]);
    expect(listPoints('nowhere')).toEqual([]);
  });
});
