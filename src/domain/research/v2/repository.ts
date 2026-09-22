import { parseCsv } from '../../../services/csv';
import type { V2Article, V2Manifest, V2Source, V2SyncReport } from './types';

/**
 * 沈阳 v2 载荷访问（V5 Phase 3 产物）。
 *
 * 与 v4 的 ResearchRepository 同样的两层缓存：pending 去重 + resolved 允许同步命中，
 * 因此切换研究条目不会再闪一次加载态。
 *
 * 载荷由 `scripts/sync-shenyang-v2.mjs` 生成，前端**只读**，不做任何拼装或推断。
 */
const BASE = '/research/shenyang/v2';

export interface V2Table {
  file: string;
  columns: string[];
  rows: Record<string, string>[];
}

/**
 * 载荷读取失败的对外文案（V5 §38）。
 *
 * 错误同样可能出现在界面上，所以只说明「哪一类研究资源没取到」，
 * **不带 URL、不带文件名**。具体地址只在开发期通过 `cause` 附带，
 * 生产构建里查不到任何路径字符串。
 */
function payloadError(status: number, label: string, detail: string): Error {
  const error = new Error(`研究资源读取失败：${label}（HTTP ${status}）`);
  error.name = 'PayloadError';
  error.cause = import.meta.env.DEV ? detail : undefined;
  return error;
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw payloadError(response.status, label, url);
  return (await response.json()) as T;
}

function createResource<T>() {
  const pending = new Map<string, Promise<T>>();
  const resolved = new Map<string, T>();
  return {
    peek(key: string): T | null {
      return resolved.get(key) ?? null;
    },
    load(key: string, loader: () => Promise<T>): Promise<T> {
      const existing = pending.get(key);
      if (existing) return existing;
      const promise = loader().then(
        (value) => { resolved.set(key, value); return value; },
        (error: unknown) => { pending.delete(key); throw error; },
      );
      pending.set(key, promise);
      return promise;
    },
  };
}

const manifestResource = createResource<V2Manifest>();
const sourcesResource = createResource<V2Source[]>();
const articleResource = createResource<V2Article>();
const tableResource = createResource<V2Table>();
const reportResource = createResource<V2SyncReport>();
const referenceResource = createResource<string>();

/** 图片与表格的 URL：表格走 fetch（有 .csv），图片直接给 <img src>。 */
export const v2AssetUrl = {
  figure: (file: string) => `${BASE}/figures/${file}`,
  table: (file: string) => `${BASE}/tables/${file}`,
};

export function getManifest(): Promise<V2Manifest> {
  return manifestResource.load('manifest', () => fetchJson<V2Manifest>(`${BASE}/manifest.json`, '研究清单'));
}
export function peekManifest(): V2Manifest | null {
  return manifestResource.peek('manifest');
}

export function getSources(): Promise<V2Source[]> {
  return sourcesResource.load('sources', () => fetchJson<V2Source[]>(`${BASE}/sources.json`, '来源清单'));
}
export function peekSources(): V2Source[] | null {
  return sourcesResource.peek('sources');
}

export function getArticle(id: string): Promise<V2Article> {
  return articleResource.load(id, () => fetchJson<V2Article>(`${BASE}/articles/${id}.json`, '研究正文'));
}
export function peekArticle(id: string): V2Article | null {
  return articleResource.peek(id);
}

export function getSyncReport(): Promise<V2SyncReport> {
  return reportResource.load('report', () => fetchJson<V2SyncReport>(`${BASE}/sync-report.json`, '同步报告'));
}
export function peekSyncReport(): V2SyncReport | null {
  return reportResource.peek('report');
}

async function fetchTable(file: string): Promise<V2Table> {
  const response = await fetch(v2AssetUrl.table(file));
  if (!response.ok) throw payloadError(response.status, '数据表', v2AssetUrl.table(file));
  const parsed = parseCsv(await response.text());
  return { file, columns: parsed.columns, rows: parsed.rows };
}

export function getTable(file: string): Promise<V2Table> {
  return tableResource.load(file, () => fetchTable(file));
}
export function peekTable(file: string): V2Table | null {
  return tableResource.peek(file);
}

/** 研究侧的数据来源与参考文献清单（About 的「研究与知识来源」用它，§52）。 */
async function fetchReferences(): Promise<string> {
  const response = await fetch(`${BASE}/references.md`);
  if (!response.ok) throw payloadError(response.status, '来源与参考文献清单', `${BASE}/references.md`);
  return response.text();
}
export function getReferences(): Promise<string> {
  return referenceResource.load('references', fetchReferences);
}
export function peekReferences(): string | null {
  return referenceResource.peek('references');
}

/** 研究条目（A01–A08）与正式报告（A09）的分界来自 manifest，不写死在前端。 */
export const RESEARCH_NOTE_IDS = ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08'] as const;
export const REPORT_ARTICLE_ID = 'A09';

export const V2Repository = {
  getManifest, peekManifest,
  getSources, peekSources,
  getArticle, peekArticle,
  getTable, peekTable,
  getReferences, peekReferences,
  getSyncReport, peekSyncReport,
  v2AssetUrl,
};
