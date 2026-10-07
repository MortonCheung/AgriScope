import { useMemo, useState } from 'react';
import type { TopicExplorer as TopicExplorerConfig } from '../../domain/research/catalog';
import { buildDisplayFilter, defaultSelectorValues, filterRows } from '../../domain/research/v2/selectors';
import { useTable } from './useV2';
import { EstimateChart } from './interactive/EstimateChart';
import { SelectorRow } from './interactive/Selectors';

/**
 * 方向页的横向 Explorer（本轮 §38/§39）。
 *
 * 只做**已有结果之间的可视比较**：同一张研究表里，把同一个分类轴的不同取值并排看
 * （例如滞后窗口 当日 / 1–3 日 / 4–7 日 / 8–14 日，或累积暴露 1 / 3 / 7 / 14 日）。
 *
 * 三条边界：
 *   · 不新增分析：数值直接来自研究表，前端不重算、不补；
 *   · 不做研究解释：不生成"哪个窗口影响最大"这类结论（标题/说明只描述在比较什么）；
 *   · 分类轴的每个取值必须唯一 —— 由 catalog 里的 `selectors` 保证，并由
 *     `verify-research-integrity.mjs` 在构建前机械校验（§36）。
 */
export function TopicExplorer({ cityId, explorer }: { cityId: string; explorer: TopicExplorerConfig }) {
  const table = useTable(cityId, explorer.table);
  const selectors = useMemo(() => explorer.selectors ?? [], [explorer.selectors]);
  const [picked, setPicked] = useState<Record<string, string>>({});

  const staticRows = useMemo(
    () => (table.status === 'ready' ? filterRows(table.data.rows, explorer.filter) : []),
    [explorer.filter, table],
  );
  const defaults = useMemo(() => defaultSelectorValues(staticRows, selectors), [selectors, staticRows]);
  const selected = useMemo(() => {
    const merged: Record<string, string> = {};
    for (const column of selectors) merged[column] = picked[column] ?? defaults[column];
    return merged;
  }, [defaults, picked, selectors]);

  if (table.status === 'error') return null;
  if (table.status === 'loading') {
    return (
      <section className="module module--explorer" data-explorer={explorer.id}>
        <div className="module__head"><h4 className="module__title">{explorer.title}</h4></div>
        <div className="module__skeleton" aria-hidden />
      </section>
    );
  }

  const rows = filterRows(table.data.rows, buildDisplayFilter(explorer, selected));
  if (rows.length === 0) return null;

  const hasCi = table.data.columns.includes('ci_low') && table.data.columns.includes('ci_high');

  return (
    <section className="module module--explorer" data-explorer={explorer.id}>
      <div className="module__head">
        <h4 className="module__title">{explorer.title}</h4>
      </div>
      {explorer.note && <p className="module__note">{explorer.note}</p>}

      <SelectorRow
        selectors={selectors}
        rows={staticRows}
        selected={selected}
        onChange={(column, value) => setPicked((current) => ({ ...current, [column]: value }))}
      />

      <EstimateChart
        rows={rows}
        categoryKey={explorer.category}
        valueKey={explorer.focus}
        ciLowKey={hasCi ? 'ci_low' : undefined}
        ciHighKey={hasCi ? 'ci_high' : undefined}
      />
    </section>
  );
}
