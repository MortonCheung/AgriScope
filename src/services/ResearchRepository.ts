import { adaptArticle, adaptCityIndex, type RawArticle, type RawCityIndex } from '../domain/research/adapters';
import type { CityResearchIndex, ResearchArticle, ResearchPoint, ResearchTable, ResearchTopic } from '../domain/research/types';
import { parseCsv } from './csv';

/**
 * Research Repository：前端读取研究内容的唯一入口。
 * 组件不直接拼 research 目录，只调用这里的具名方法。
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

const indexCache = new Map<string, Promise<CityResearchIndex>>();
const articleCache = new Map<string, Promise<ResearchArticle>>();
const tableCache = new Map<string, Promise<ResearchTable>>();
let manifestPromise: Promise<ResearchManifest> | null = null;

export const ResearchRepository = {
  getManifest(): Promise<ResearchManifest> {
    manifestPromise ??= fetchJson<ResearchManifest>(`${CONTENT_BASE}/shenyang/manifest.json`);
    return manifestPromise;
  },

  getCityIndex(cityId: string): Promise<CityResearchIndex> {
    let cached = indexCache.get(cityId);
    if (!cached) {
      cached = fetchJson<RawCityIndex>(`${CONTENT_BASE}/${cityId}/index.json`).then((raw) => adaptCityIndex(raw, cityId));
      indexCache.set(cityId, cached);
    }
    return cached;
  },

  getResearchArticle(cityId: string, articleId: string): Promise<ResearchArticle> {
    const key = `${cityId}:${articleId}`;
    let cached = articleCache.get(key);
    if (!cached) {
      cached = fetchJson<RawArticle>(`${CONTENT_BASE}/${cityId}/articles/${articleId}.json`).then(adaptArticle);
      articleCache.set(key, cached);
    }
    return cached;
  },

  getResearchTable(src: string): Promise<ResearchTable> {
    let cached = tableCache.get(src);
    if (!cached) {
      cached = fetchText(src).then((text) => {
        const { columns, rows } = parseCsv(text);
        return {
          id: src.split('/').pop() ?? src,
          name: src.split('/').pop() ?? src,
          src,
          columns: columns.map((key) => ({ key, label: key })),
          rows,
        } satisfies ResearchTable;
      });
      tableCache.set(src, cached);
    }
    return cached;
  },

  findPoint(index: CityResearchIndex, pointId: string): ResearchPoint | undefined {
    return index.points.find((point) => point.id === pointId);
  },

  findTopicForPoint(index: CityResearchIndex, pointId: string): ResearchTopic | undefined {
    return index.topics.find((topic) => topic.pointIds.includes(pointId));
  },
};
