import { useMemo, useState } from 'react';
import { columnMeta, valueLabel } from '../../domain/research/v2/metrics';
import type { V2Table } from '../../domain/research/v2/repository';
import { MetricValueView } from '../../components/MetricValueView';
import './data-table.css';

export interface DataTableProps {
  table: V2Table;
  /** 表题：用研究自己声明的东西，不编。 */
  caption?: string;
  /** 可筛的列（研究表里真实存在的分类列）；不传则不给控件。 */
  filterColumn?: string;
  maxRows?: number;
  /** 表下口径注（例如成交量单位口径）。 */
  note?: string;
}

/**
 * 研究表渲染（V5 §36/§74）。
 *
 * 两条硬规则：
 *   1. **绝不显示原始英文 key**：列名一律走受控中文映射，未登记列不渲染并记入 TABLE_SCHEMA_GAPS；
 *   2. 数值一律走 MetricValueView，单位与精度由指标契约决定（§16）。
 *
 * 筛选只是**行的呈现层过滤**，不改变任何研究数字，也不做任何计算。
 */
export function DataTable({ table, caption, filterColumn, maxRows = 24, note }: DataTableProps) {
  const [filter, setFilter] = useState<string>('');

  const columns = useMemo(
    () => table.columns.filter((key) => columnMeta(key) !== null),
    [table.columns],
  );
  const unregistered = useMemo(
    () => table.columns.filter((key) => columnMeta(key) === null),
    [table.columns],
  );
  if (import.meta.env.DEV && unregistered.length > 0) {
    console.info(`未登记的列（需补 COLUMN_META）：${unregistered.join(', ')}（${table.file}）`);
  }

  const filterOptions = useMemo(() => {
    if (!filterColumn || !table.columns.includes(filterColumn)) return [];
    return [...new Set(table.rows.map((row) => row[filterColumn]).filter(Boolean))].sort();
  }, [filterColumn, table.columns, table.rows]);

  const rows = useMemo(() => {
    const filtered = filter ? table.rows.filter((row) => row[filterColumn ?? ''] === filter) : table.rows;
    return filtered.slice(0, maxRows);
  }, [filter, filterColumn, maxRows, table.rows]);

  return (
    <figure className="data-table">
      {(caption || filterOptions.length > 0) && (
        <figcaption className="data-table__head">
          {caption && <span className="data-table__caption">{caption}</span>}
          {filterOptions.length > 0 && (
            <label className="data-table__filter">
              <span>{columnMeta(filterColumn ?? '')?.label ?? filterColumn}</span>
              <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                <option value="">全部</option>
                {filterOptions.map((option) => (
                  <option key={option} value={option}>{valueLabel(filterColumn ?? '', option)}</option>
                ))}
              </select>
            </label>
          )}
        </figcaption>
      )}
      <div className="data-table__scroll">
        <table>
          <thead>
            <tr>
              {columns.map((key) => <th key={key} scope="col">{columnMeta(key)?.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((key) => {
                  const meta = columnMeta(key);
                  return (
                    <td key={key} data-numeric={meta?.valueType === 'number' || undefined}>
                      <MetricValueView metricId={key} value={row[key]} categorical={meta?.valueType === 'text'} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="data-table__foot">
        <span>共 {table.rows.length} 行{filter ? `，当前显示 ${rows.length} 行` : ''}{table.rows.length > maxRows && !filter ? `，仅显示前 ${maxRows} 行` : ''}</span>
        {note && <span className="data-table__note">{note}</span>}
      </div>
    </figure>
  );
}
