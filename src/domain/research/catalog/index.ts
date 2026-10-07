import shenyangTree from './shenyang-tree.json';
import type { CityResearchCatalog, ResearchPoint, ResearchTopic } from './types';

export * from './types';

/**
 * 城市研究目录（V5 §5）。
 *
 * 目录是**结构**，随前端发布；内容是研究侧导出（payload），两者分开。
 * 组件一律通过这里的函数取结构，绝不自己写死城市、方向数量或点位。
 */
const CATALOGS: Record<string, CityResearchCatalog> = {
  shenyang: shenyangTree as CityResearchCatalog,
};

export function listCatalogCityIds(): string[] {
  return Object.keys(CATALOGS);
}

export function getCatalog(cityId: string): CityResearchCatalog | null {
  return CATALOGS[cityId] ?? null;
}

export function hasCatalog(cityId: string): boolean {
  return cityId in CATALOGS;
}

export function listTopics(cityId: string): ResearchTopic[] {
  const catalog = getCatalog(cityId);
  if (!catalog) return [];
  return [...catalog.topics].sort((a, b) => a.order - b.order);
}

export function listPoints(cityId: string): ResearchPoint[] {
  return listTopics(cityId).flatMap((topic) => topic.points);
}

export function getTopic(cityId: string, topicId: string): ResearchTopic | null {
  return listTopics(cityId).find((topic) => topic.id === topicId) ?? null;
}

export function getPoint(cityId: string, pointId: string): ResearchPoint | null {
  return listPoints(cityId).find((point) => point.id === pointId) ?? null;
}

export function isTopicId(cityId: string, researchId: string): boolean {
  return getTopic(cityId, researchId) !== null;
}

export function isPointId(cityId: string, researchId: string): boolean {
  return getPoint(cityId, researchId) !== null;
}

/** 一个 researchId 是"点"还是"方向"。 */
export function researchIdKind(cityId: string, researchId: string): 'point' | 'topic' | null {
  if (isPointId(cityId, researchId)) return 'point';
  if (isTopicId(cityId, researchId)) return 'topic';
  return null;
}

/** 研究点所属方向（A2.2 → A2）。 */
export function topicOfPoint(cityId: string, pointId: string): ResearchTopic | null {
  const point = getPoint(cityId, pointId);
  return point ? getTopic(cityId, point.topicId) : null;
}

/** 城市综合报告的文章 id（A9）。它不属于研究树（§29）。 */
export function reportArticleId(cityId: string): string | null {
  return getCatalog(cityId)?.reportArticleId ?? null;
}

/**
 * `^` 的层级（V5 §10）：
 *   A2.2 → A2 → 城市页；A2 → 城市页。
 * 报告与推演由各自模块处理，这里只管研究树内部。
 */
export function researchParent(cityId: string, researchId: string): { to: 'topic' | 'city'; id: string } {
  const kind = researchIdKind(cityId, researchId);
  if (kind === 'point') {
    const point = getPoint(cityId, researchId);
    return { to: 'topic', id: point?.topicId ?? '' };
  }
  return { to: 'city', id: cityId };
}

/**
 * 结构自检（§21/§33）。返回问题列表，空数组表示契约自洽。
 *
 * 与沈阳的具体数字无关：8 方向 / 76 点是**沈阳契约**，
 * 由测试单独断言，通用校验器只检查"结构是否自洽"。
 */
export function validateCatalog(catalog: CityResearchCatalog): string[] {
  const problems: string[] = [];
  if (!catalog.schemaVersion) problems.push('缺少 schemaVersion');
  if (!catalog.cityId) problems.push('缺少 cityId');

  const topicIds = new Set<string>();
  const pointIds = new Set<string>();

  for (const topic of catalog.topics) {
    if (topicIds.has(topic.id)) problems.push(`方向 id 重复：${topic.id}`);
    topicIds.add(topic.id);
    if (topic.articleId !== topic.id) problems.push(`方向 ${topic.id} 的 articleId 应为 ${topic.id}`);
    if (topic.points.length === 0) problems.push(`方向 ${topic.id} 没有任何研究点`);
    if (!topic.title) problems.push(`方向 ${topic.id} 缺少标题`);
    if (!topic.order) problems.push(`方向 ${topic.id} 缺少 order`);

    // §38/§39：方向页 Explorer 也必须结构自洽（表 / 分类轴 / 取值列 / selectors 都要写全）。
    for (const explorer of topic.explorers ?? []) {
      if (!explorer.id) problems.push(`方向 ${topic.id} 的 explorer 缺少 id`);
      if (!explorer.title) problems.push(`方向 ${topic.id} 的 explorer ${explorer.id} 缺少标题`);
      if (!explorer.table) problems.push(`方向 ${topic.id} 的 explorer ${explorer.id} 缺少表`);
      if (!explorer.category) problems.push(`方向 ${topic.id} 的 explorer ${explorer.id} 缺少分类轴`);
      if (!explorer.focus) problems.push(`方向 ${topic.id} 的 explorer ${explorer.id} 缺少取值列`);
      if (!Array.isArray(explorer.selectors)) problems.push(`方向 ${topic.id} 的 explorer ${explorer.id} 缺少 selectors（哪怕是空数组也要写）`);
    }

    for (const point of topic.points) {
       if (pointIds.has(point.id)) problems.push(`研究点 id 重复：${point.id}`);
      pointIds.add(point.id);
      // §33.4：点位 id 的前缀必须与所属方向一致（A4.8 → A4）。
      if (!point.id.startsWith(`${topic.id}.`)) {
        problems.push(`研究点 ${point.id} 的前缀与方向 ${topic.id} 不一致`);
      }
      if (point.topicId !== topic.id) problems.push(`研究点 ${point.id} 的 topicId 应为 ${topic.id}`);
      if (point.articleId !== topic.articleId) problems.push(`研究点 ${point.id} 的 articleId 应为 ${topic.articleId}`);
      if (!point.title) problems.push(`研究点 ${point.id} 缺少标题`);

      if (point.status === 'pending') {
        // §21：pending 结构存在但没有内容，必须写明缺口，且不得带数据绑定。
        if (!point.reason) problems.push(`研究点 ${point.id} 是 pending，必须写明原因`);
        if (point.binding) problems.push(`研究点 ${point.id} 是 pending，不应带数据绑定`);
      }
      if (point.status === 'ready') {
        // §21：ready 必须有可验证的引用与绑定。
        if (!point.binding) problems.push(`研究点 ${point.id} 是 ready，必须带数据绑定`);
        if (!point.citations?.length) problems.push(`研究点 ${point.id} 是 ready，必须带研究侧引用`);
        if (!point.module) problems.push(`研究点 ${point.id} 是 ready，必须指定交互模块`);
        if (point.binding) {
          if (point.binding.view === 'chart' && !point.binding.category) {
            problems.push(`研究点 ${point.id} 用图呈现，必须给出分类轴`);
          }
          if (point.binding.view === 'table' && point.binding.category) {
            problems.push(`研究点 ${point.id} 用表呈现，不应再给分类轴`);
          }
          if (!point.binding.filter) problems.push(`研究点 ${point.id} 的绑定缺少 filter（哪怕是空对象也要写）`);
        }
      }
      if (point.status === 'unsupported') {
        // §21：unsupported 允许没有图表，但判定必须来自研究侧。
        if (!point.citations?.length) problems.push(`研究点 ${point.id} 是 unsupported，必须带研究侧判定原句`);
        if (!point.reason) problems.push(`研究点 ${point.id} 是 unsupported，必须写明研究侧判定`);
      }
      for (const citation of point.citations ?? []) {
        if (!citation.quote.trim()) problems.push(`研究点 ${point.id} 的引用为空`);
        if (!Number.isFinite(citation.section)) problems.push(`研究点 ${point.id} 的引用缺少章节号`);
      }
    }
  }

  // §29：城市综合报告不属于研究树。
  if (catalog.reportArticleId && topicIds.has(catalog.reportArticleId)) {
    problems.push(`综合报告 ${catalog.reportArticleId} 不得出现在研究树中`);
  }
  return problems;
}
