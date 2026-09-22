import { adaptArticle, adaptCityIndex, type RawArticle, type RawCityIndex } from '../domain/research/adapters';
import type { CityResearchIndex, ResearchArticle, ResearchPoint, ResearchTable, ResearchTopic } from '../domain/research/types';
import { parseCsv } from './csv';

/**
 * Research Repository：前端读取研究内容的唯一入口。
 * 组件不直接拼 research 目录，只调用这里的具名方法。
 *
 * 缓存分两层（V4 §四十四/§四十五）：
 *   - pending：进行中的 Promise，避免同一个资源被并发请求多次；
 *   - resolved：**已完成的值**，让组件可以同步取到数据（`peek*`）。
 * 第二层是消除"刷新感"的关键：切换研究点时正文若已在内存里，
 * 就不该先渲染一帧加载态再替换。
 *
 * 加载失败**不写入** pending 缓存，否则一次网络抖动会被永久固化，
 * 之后的重试都会直接拿到同一个 rejection。
 */

export interface ResearchManifest {
  counters: Record<string, number>;
  figures: string[];
  tables: string[];
  geo: Record<string, string>;
}

const CONTENT_BASE = '/research';

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`加载失败 ${response.status}：${url}`);
  return (await response.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`加载失败 ${response.status}：${url}`);
  return response.text();
}

interface Resource<T> {
  peek(key: string): T | null;
  load(key: string, loader: () => Promise<T>): Promise<T>;
}

function createResource<T>(): Resource<T> {
  const pending = new Map<string, Promise<T>>();
  const resolved = new Map<string, T>();
  return {
    peek(key) {
      return resolved.get(key) ?? null;
    },
    load(key, loader) {
      const existing = pending.get(key);
      if (existing) return existing;
      const promise = loader().then(
        (value) => {
          resolved.set(key, value);
          return value;
        },
        (error: unknown) => {
          pending.delete(key);
          throw error;
        },
      );
      pending.set(key, promise);
      return promise;
    },
  };
}

const indexResource = createResource<CityResearchIndex>();
const articleResource = createResource<ResearchArticle>();
const tableResource = createResource<ResearchTable>();
const manifestResource = createResource<ResearchManifest>();

const MANIFEST_KEY = 'shenyang';

/** 预取每批篇数（V4 §四十五）：十几篇内容很小，但不要一次占满首屏带宽。 */
const PREFETCH_BATCH = 3;

function runWhenIdle(task: () => void): void {
  const idle = (window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (typeof idle === 'function') idle(task, { timeout: 2000 });
  else window.setTimeout(task, 0);
}

export function getResearchArticle(cityId: string, articleId: string): Promise<ResearchArticle> {
  return articleResource.load(
    `${cityId}:${articleId}`,
    () => fetchJson<RawArticle>(`${CONTENT_BASE}/${cityId}/articles/${articleId}.json`).then(adaptArticle),
  );
}

/**
 * 进入城市后，在后台把该城全部研究原文取进内存（V4 §四十五）。
 * 因此 G1 → G2 这类切换不应再出现任何整块加载态。
 */
function prefetchArticles(cityId: string, articleIds: string[]): void {
  const queue = [...new Set(articleIds)];
  const pump = () => {
    const batch = queue.splice(0, PREFETCH_BATCH);
    if (batch.length === 0) return;
    Promise.all(batch.map((id) => getResearchArticle(cityId, id).catch(() => null)))
      .then(() => { if (queue.length > 0) runWhenIdle(pump); });
  };
  runWhenIdle(pump);
}

export function getCityIndex(cityId: string): Promise<CityResearchIndex> {
  return indexResource.load(cityId, () =>
    fetchJson<RawCityIndex>(`${CONTENT_BASE}/${cityId}/index.json`).then((raw) => {
      const index = adaptCityIndex(raw, cityId);
      prefetchArticles(
        cityId,
        index.points.map((point) => point.articleId).filter((id): id is string => Boolean(id)),
      );
      return index;
    }),
  );
}

export function getResearchTable(src: string): Promise<ResearchTable> {
  return tableResource.load(src, () =>
    fetchText(src).then((text) => {
      const { columns, rows } = parseCsv(text);
      return {
        id: src.split('/').pop() ?? src,
        name: src.split('/').pop() ?? src,
        src,
        columns: columns.map((key) => ({ key, label: key })),
        rows,
      } satisfies ResearchTable;
    }),
  );
}

export function getManifest(): Promise<ResearchManifest> {
  return manifestResource.load(MANIFEST_KEY, () => fetchJson<ResearchManifest>(`${CONTENT_BASE}/shenyang/manifest.json`));
}

export const ResearchRepository = {
  getManifest,
  getCityIndex,
  getResearchArticle,
  getResearchTable,

  /** 同步读取已缓存的城市索引；未命中返回 null。 */
  peekCityIndex(cityId: string): CityResearchIndex | null {
    return indexResource.peek(cityId);
  },

  /** 同步读取已缓存的研究原文；未命中返回 null。 */
  peekResearchArticle(cityId: string, articleId: string): ResearchArticle | null {
    return articleResource.peek(`${cityId}:${articleId}`);
  },

  /** 同步读取已缓存的研究表；未命中返回 null。 */
  peekResearchTable(src: string): ResearchTable | null {
    return tableResource.peek(src);
  },

  findPoint(index: CityResearchIndex, pointId: string): ResearchPoint | undefined {
    return index.points.find((point) => point.id === pointId);
  },

  findTopicForPoint(index: CityResearchIndex, pointId: string): ResearchTopic | undefined {
    return index.topics.find((topic) => topic.pointIds.includes(pointId));
  },
};
