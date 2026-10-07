import { parseCsv } from '../../../services/csv';
import type { V2Article, V2Manifest, V2Source, V2SyncReport, V2Table } from './types';

export type { V2Table };

/**
 * 研究载荷访问（本轮 §5/§6：**城市无关**）。
 *
 * 关键变化：
 *   1. 路径由 `cityId` 推导，不再把 shenyang 或某个版本号写死：
 *      `/research/<cityId>/manifest.json`、`/articles/<id>.json`、`/tables/<file>`、`/figures/<file>`
 *   2. 文章 id 用 **canonical**（A2），由 compat 层解析到当前载荷 id（A02）。
 *      canonical 存在时优先用它；不存在才回退。研究侧完成正式迁移后，回退自然失效。
 *   3. 推演表与研究树分离（§30）：`/scenario/<cityId>/<file>`。
 *
 * 载荷由 `scripts/sync-shenyang-v2.mjs` 生成，前端**只读**，不做任何拼装或推断。
 * 正式文章树（`/research/<cityId>/index.json`）与 `src/domain/research/catalog` 是同一份内容
 * （完整性校验器逐字节比对），应用直接读 catalog，因此树没有加载态。
 */

export function researchRoot(cityId: string): string {
  return `/research/${cityId}`;
}

export function scenarioRoot(cityId: string): string {
  return `/scenario/${cityId}`;
}

/**
 * canonical → 当前载荷的候选 id（§4）。
 *
 * 这是一层**极薄的兼容**，只存在于 repository 内部：
 *   - 不进入 URL；
 *   - 不进入界面；
 *   - 不成为新的领域契约。
 * 研究侧开始输出 `articles/A1.json` 时，第一个候选直接命中，回退不再被使用。
 */
export function candidateArticleIds(canonicalId: string): string[] {
  const match = /^A(\d+)$/.exec(canonicalId);
  if (!match) return [canonicalId];
  const padded = `A${match[1].padStart(2, '0')}`;
  return padded === canonicalId ? [canonicalId] : [canonicalId, padded];
}

export const assetUrl = {
  figure: (cityId: string, file: string) => `${researchRoot(cityId)}/figures/${file}`,
  table: (cityId: string, file: string) => `${researchRoot(cityId)}/tables/${file}`,
  scenario: (cityId: string, file: string) => `${scenarioRoot(cityId)}/${file}`,
};

/**
 * 载荷读取失败的对外文案（§38）。
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
/** canonical → 实际命中的载荷 id（只探测一次）。 */
const resolvedArticleIds = new Map<string, string>();

export function getManifest(cityId: string): Promise<V2Manifest> {
  return manifestResource.load(`${cityId}:manifest`, () =>
    fetchJson<V2Manifest>(`${researchRoot(cityId)}/manifest.json`, '研究清单'));
}
export function peekManifest(cityId: string): V2Manifest | null {
  return manifestResource.peek(`${cityId}:manifest`);
}

export function getSources(cityId: string): Promise<V2Source[]> {
  return sourcesResource.load(`${cityId}:sources`, () =>
    fetchJson<V2Source[]>(`${researchRoot(cityId)}/sources.json`, '来源清单'));
}
export function peekSources(cityId: string): V2Source[] | null {
  return sourcesResource.peek(`${cityId}:sources`);
}

/**
 * 读取一篇文章。参数是 **canonical id**（A2），内部解析到当前载荷。
 * 解析结果按 city 缓存，因此同一篇文章只会为兼容付一次探测成本。
 */
export async function getArticle(cityId: string, canonicalId: string): Promise<V2Article> {
  const cacheKey = `${cityId}:${canonicalId}`;
  const known = resolvedArticleIds.get(cacheKey);
  if (known) return articleResource.load(`${cacheKey}:${known}`, () =>
    fetchJson<V2Article>(`${researchRoot(cityId)}/articles/${known}.json`, '研究正文'));

  const candidates = candidateArticleIds(canonicalId);
  let lastError: unknown = null;
  for (const payloadId of candidates) {
    try {
      const article = await articleResource.load(`${cacheKey}:${payloadId}`, () =>
        fetchJson<V2Article>(`${researchRoot(cityId)}/articles/${payloadId}.json`, '研究正文'));
      resolvedArticleIds.set(cacheKey, payloadId);
      return article;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('研究正文读取失败');
}

export function peekArticle(cityId: string, canonicalId: string): V2Article | null {
  const known = resolvedArticleIds.get(`${cityId}:${canonicalId}`);
  if (known) return articleResource.peek(`${cityId}:${canonicalId}:${known}`);
  for (const payloadId of candidateArticleIds(canonicalId)) {
    const cached = articleResource.peek(`${cityId}:${canonicalId}:${payloadId}`);
    if (cached) { resolvedArticleIds.set(`${cityId}:${canonicalId}`, payloadId); return cached; }
  }
  return null;
}

export function getSyncReport(cityId: string): Promise<V2SyncReport> {
  return reportResource.load(`${cityId}:report`, () =>
    fetchJson<V2SyncReport>(`${researchRoot(cityId)}/sync-report.json`, '同步报告'));
}
export function peekSyncReport(cityId: string): V2SyncReport | null {
  return reportResource.peek(`${cityId}:report`);
}

async function fetchTable(cityId: string, file: string): Promise<V2Table> {
  const response = await fetch(assetUrl.table(cityId, file));
  if (!response.ok) throw payloadError(response.status, '数据表', assetUrl.table(cityId, file));
  const parsed = parseCsv(await response.text());
  return { file, columns: parsed.columns, rows: parsed.rows };
}

export function getTable(cityId: string, file: string): Promise<V2Table> {
  return tableResource.load(`${cityId}:${file}`, () => fetchTable(cityId, file));
}
export function peekTable(cityId: string, file: string): V2Table | null {
  return tableResource.peek(`${cityId}:${file}`);
}

/** 研究侧的数据来源与参考文献清单（About 的「研究与知识来源」用它，§52）。 */
async function fetchReferences(cityId: string): Promise<string> {
  const url = `${researchRoot(cityId)}/references.md`;
  const response = await fetch(url);
  if (!response.ok) throw payloadError(response.status, '来源与参考文献清单', url);
  return response.text();
}
export function getReferences(cityId: string): Promise<string> {
  return referenceResource.load(`${cityId}:references`, () => fetchReferences(cityId));
}
export function peekReferences(cityId: string): string | null {
  return referenceResource.peek(`${cityId}:references`);
}

/** 推演表（与「研究」不同的产品入口，§30）。 */
async function fetchScenarioTable(cityId: string, file: string): Promise<V2Table> {
  const response = await fetch(assetUrl.scenario(cityId, file));
  if (!response.ok) throw payloadError(response.status, '情景表', assetUrl.scenario(cityId, file));
  const parsed = parseCsv(await response.text());
  return { file, columns: parsed.columns, rows: parsed.rows };
}
export function getScenarioTable(cityId: string, file: string): Promise<V2Table> {
  return tableResource.load(`${cityId}:scenario:${file}`, () => fetchScenarioTable(cityId, file));
}
export function peekScenarioTable(cityId: string, file: string): V2Table | null {
  return tableResource.peek(`${cityId}:scenario:${file}`);
}

export const V2Repository = {
  getManifest, peekManifest,
  getSources, peekSources,
  getArticle, peekArticle,
  getTable, peekTable,
  getScenarioTable, peekScenarioTable,
  getReferences, peekReferences,
  getSyncReport, peekSyncReport,
  assetUrl,
};
