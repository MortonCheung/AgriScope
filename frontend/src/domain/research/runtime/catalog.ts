import { useEffect, useState } from 'react';
import type { V2Article, V2Catalog, V2CatalogCity, V2CatalogModule } from '../v2/types';
import { V2Repository } from '../v2/repository';
import type { TopicExplorer } from '../catalog/types';

/**
 * 运行时研究目录（Frontend V3 §6.3/§6.5）。
 *
 * 与 `catalog/`（编译期内置的**沈阳策展树**：方向 → 研究点 → 可校验引句）不同，
 * 这一层只承载**研究侧已正式导出的模块级索引**：
 *   `data/research` → publishing → `runtime/research/product/<city>`
 *   → `GET /api/research/catalog` → 本模块。
 *
 * 它不做三件事（§45/§46）：
 *   1. **不生成研究点**：没有策展树的城市就只呈现 9 个模块，绝不编造 point/引句；
 *   2. **不补字段**：catalog 与 article.json 里没有的字段一律不存在（例如 `capabilities`、`updated_at`）；
 *   3. **不重算统计**：交互探索只把研究侧导出的表按原列画出来。
 */

export type RuntimeCatalogState =
  | { status: 'loading' }
  | { status: 'ready'; catalog: V2Catalog }
  | { status: 'error'; message: string };

export function useRuntimeCatalog(): RuntimeCatalogState {
  const [state, setState] = useState<RuntimeCatalogState>(() => {
    const cached = V2Repository.peekCatalog();
    return cached ? { status: 'ready', catalog: cached } : { status: 'loading' };
  });

  useEffect(() => {
    if (state.status !== 'loading') return undefined;
    let alive = true;
    V2Repository.getCatalog().then(
      (catalog) => { if (alive) setState({ status: 'ready', catalog }); },
      (error: unknown) => {
        if (!alive) return;
        setState({ status: 'error', message: error instanceof Error ? error.message : '研究总索引读取失败' });
      },
    );
    return () => { alive = false; };
  }, [state.status]);

  return state;
}

export function cityEntry(catalog: V2Catalog, cityId: string): V2CatalogCity | null {
  return catalog.cities.find((city) => city.city === cityId) ?? null;
}

export function moduleEntry(city: V2CatalogCity, moduleId: string): V2CatalogModule | null {
  return city.modules.find((module) => module.module_id === moduleId) ?? null;
}

/** 研究侧 article.json 里 `explorer` 的真实结构（不是前端发明的契约）。 */
export interface ArticleExplorerSeries {
  id?: string;
  table: string;
  x: string;
  y: string;
  group?: string;
  facet?: string;
}

export interface ArticleExplorer {
  status?: string;
  /** NOT_SUPPORTED 时研究侧给出的判定原因（原句，不改写）。 */
  reason?: string;
  selectors?: { key?: string; label?: string; options?: string[] }[];
  metrics?: string[];
  series?: ArticleExplorerSeries[];
  tables?: string[];
  figures?: string[];
  sources?: string[];
  methodology?: string;
  limitations?: string[];
}

/** 读取真实 `explorer`；缺失一律返回 null（沈阳历史载荷就是缺失）。 */
export function readExplorer(article: V2Article): ArticleExplorer | null {
  const raw = (article as V2Article & { explorer?: unknown }).explorer;
  return raw && typeof raw === 'object' ? (raw as ArticleExplorer) : null;
}

/**
 * 把研究侧的 `explorer.series` 映射成既有 `TopicExplorer` 可画的配置。
 *
 * 映射是**一一对应**的：表、分类轴、取值列、分组与分面都直接取研究侧声明的列名，
 * 不加筛选、不做聚合、不生成"哪个窗口影响最大"这类研究解释（§22）。
 */
export function explorerConfigs(article: V2Article, moduleId: string): TopicExplorer[] {
  const explorer = readExplorer(article);
  const series = explorer?.series ?? [];
  return series
    .filter((item) => Boolean(item.table && item.x && item.y))
    .map((item, index) => {
      const columns = [item.group, item.facet].filter((value): value is string => Boolean(value));
      return {
        id: `${moduleId}.${item.id ?? index + 1}`,
        title: `研究侧序列 ${index + 1}`,
        note: `列：x=${item.x} · y=${item.y}${item.group ? ` · group=${item.group}` : ''}${item.facet ? ` · facet=${item.facet}` : ''}`,
        table: item.table,
        filter: {},
        selectors: columns,
        category: item.x,
        focus: item.y,
      };
    });
}

/** 研究侧登记的指标列名（只展示名字，不解释、不计算）。 */
export function explorerMetricNames(article: V2Article): string[] {
  return readExplorer(article)?.metrics ?? [];
}