import { useMemo, useState } from 'react';
import { AsyncBoundary } from '../../../components/AsyncState';
import type { EvidenceLevelCode } from '../../../domain/research/types';
import { useTable } from '../data/useTable';
import { ChartFrame } from './primitives';

/**
 * 研究表浏览器：让用户真正查看研究过程中使用的具体数据表。
 * 支持排序与关键词过滤，不改变任何数值。
 */
export function TableExplorer({ title, note, source, provenance = 'observed', evidenceLevel, maxRows = 200 }: {
  title: string;
  note?: string;
  source: string;
  provenance?: 'observed' | 'model' | 'scenario';
  evidenceLevel?: EvidenceLevelCode;
  maxRows?: number;
}) {
  const state = useTable(source);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [descending, setDescending] = useState(true);
  const [query, setQuery] = useState('');

  const view = useMemo(() => {
    if (state.status !== 'ready') return null;
    const { columns, rows } = state.data;
    const filtered = query
      ? rows.filter((row) => columns.some((column) => (row[column.key] ?? '').toLowerCase().includes(query.toLowerCase())))
      : rows;
    const sorted = sortKey
      ? [...filtered].sort((a, b) => {
        const left = Number(a[sortKey]);
        const right = Number(b[sortKey]);
        if (Number.isFinite(left) && Number.isFinite(right)) return descending ? right - left : left - right;
        const text = String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''));
        return descending ? -text : text;
      })
      : filtered;
    return { columns, rows: sorted.slice(0, maxRows), total: filtered.length };
  }, [descending, maxRows, query, sortKey, state]);

  return (
    <ChartFrame
      title={title}
      note={note ?? '研究过程中实际使用的数据表。'}
      provenance={provenance}
      lineage={[source.split('/').pop() ?? '']}
      evidenceLevel={evidenceLevel ? `证据 ${evidenceLevel}` : undefined}
      controls={
        <div className="selector">
          <span className="selector__label">筛选</span>
          <div className="selector__options">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入关键词过滤行…"
              aria-label="过滤表格行"
              style={{ minHeight: 34, padding: '0 10px', border: '1px solid var(--ag-rule)', borderRadius: 'var(--ag-radius-sm)', background: 'transparent', font: 'inherit' }}
            />
            {query && <button type="button" className="ag-chip" onClick={() => setQuery('')}>清除</button>}
          </div>
        </div>
      }
    >
      <AsyncBoundary state={state}>
        {() => (view ? (
          <div className="table-explorer">
            <div className="table-explorer__bar">
              <span className="table-explorer__meta">{view.total} 行 · 显示前 {view.rows.length} 行 · {view.columns.length} 列</span>
            </div>
            <div className="table-explorer__scroll">
              <table className="ag-table table-explorer__table">
                <thead>
                  <tr>
                    {view.columns.map((column) => (
                      <th key={column.key} aria-sort={sortKey === column.key ? (descending ? 'descending' : 'ascending') : undefined}>
                        <button type="button" onClick={() => {
                          if (sortKey === column.key) setDescending((value) => !value);
                          else { setSortKey(column.key); setDescending(true); }
                        }}>
                          {column.label}{sortKey === column.key ? (descending ? ' ↓' : ' ↑') : ''}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((row, index) => (
                    <tr key={index}>
                      {view.columns.map((column) => <td key={column.key}>{row[column.key]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null)}
      </AsyncBoundary>
    </ChartFrame>
  );
}
