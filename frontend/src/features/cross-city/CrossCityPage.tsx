import { useMemo, useState } from 'react';
import type { V2Table } from '../../domain/research/v2/repository';
import { assetUrl } from '../../domain/research/v2/repository';
import { columnMeta } from '../../domain/research/v2/metrics';
import { ROUTES } from '../../app/routes';
import { usePageNavigate } from '../../app/pageNavigation';
import { WorkbenchLayout, WorkbenchMain, WorkbenchRail } from '../../components/workbench/WorkbenchLayout';
import { ReportNavigation } from '../report/ReportNavigation';
import { productText } from '../report/productContent';
import { MetricValueView } from '../../components/MetricValueView';
import { DataTable } from '../research-v2/DataTable';
import { V2Figure } from '../research-v2/Figure';
import { MarkdownBlocks } from '../research-v2/blocks';
import { useArticle, useTable } from '../research-v2/useV2';
import { LIAONING_CITIES } from '../../domain/geography/cities';
import { LiaoningMiniMap } from './LiaoningMiniMap';
import {
  COMPARABILITY_LABEL,
  COMPARABILITY_TONE,
  CROSS_CITY_METRICS,
  FREQ_LABEL,
  FREQ_PAIR_LABEL,
  findMetric,
  pairComparability,
  type CrossCityMetric,
} from './comparability';
import './cross-city.css';

/**
 * 跨城比较专用页（Frontend V3 §25 / §25.1）。
 *
 * 定位：把 A10 的**结构化跨城比较**做成一个能切换指标的视图，而不是文章阅读器。
 * 三条不可越过的东西：
 *   1. 六城价格口径不同（批发 / 市场均价 / 超市 / 产地 …），**绝不产出菜价排行**；
 *   2. 每个对比都标出可比较性（可直接比较 / 探索性比较 / 不可直接比较），
 *      判定只按研究侧真实列与研究原文；
 *   3. 领先/滞后只写"探索性"，不写成"明确市场传导"。
 *
 * 数据全部来自 `/api/research/cross_city/*`（A10 / 真实导出表），前端不重算、不改写。
 */

const CITY_ID = 'cross_city';
const shortNameToId = new Map(LIAONING_CITIES.map((city) => [city.shortName, city.id]));

function ComparabilityBadge({ value }: { value: ReturnType<typeof pairComparability> | CrossCityMetric['comparability'] }) {
  return (
    <span className="ag-badge" data-tone={COMPARABILITY_TONE[value]}>
      {COMPARABILITY_LABEL[value]}
    </span>
  );
}

/** 城市维度的横向比较条（SVG 自建；按表内原始顺序，不排序＝不构成排名）。 */
function ComparisonBars({ table, column, activeCity, onSelectCity }: {
  table: V2Table;
  column: string;
  activeCity: string | null;
  onSelectCity: (cityId: string) => void;
}) {
  const meta = columnMeta(column);
  const rows = useMemo(() => table.rows
    .map((row) => ({ label: row.city ?? '', raw: row[column] ?? '' }))
    .filter((row) => row.raw !== '')
    .map((row) => ({ label: row.label, id: shortNameToId.get(row.label) ?? row.label, value: Number(row.raw) })),
  [column, table.rows]);
  if (rows.length === 0) return null;

  const values = rows.map((row) => row.value).filter(Number.isFinite);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const zeroPct = ((0 - min) / span) * 100;

  return (
    <figure className="cx-bars">
      <ul className="cx-bars__list">
        {rows.map((row) => {
          const pct = ((row.value - min) / span) * 100;
          const left = Math.min(zeroPct, pct);
          const width = Math.max(Math.abs(pct - zeroPct), 0.4);
          const isActive = activeCity === row.id;
          return (
            <li key={row.id}>
              <button
                type="button"
                className="cx-bars__row"
                data-active={isActive || undefined}
                aria-pressed={isActive}
                onClick={() => onSelectCity(row.id)}
              >
                <span className="cx-bars__label">{row.label}</span>
                <span className="cx-bars__track">
                  <svg viewBox="0 0 100 1" preserveAspectRatio="none" aria-hidden focusable="false">
                    <rect x={left} y={0} width={width} height={1} />
                  </svg>
                </span>
                <span className="cx-bars__value"><MetricValueView metricId={column} value={row.value} /></span>
              </button>
            </li>
          );
        })}
      </ul>
      <figcaption className="ag-caption">{meta?.label}</figcaption>
    </figure>
  );
}

/**
 * 季节同步的城际配对表（专用渲染）。
 *
 * 为什么不用通用 DataTable：这张表有 `freq_a` / `freq_b` / `freq_pair` 三个**英文枚举列**
 * （D / W / same / mixed）。研究侧的受控中文映射在 `domain/**`（本轮不在可改范围），
 * 因此在这里按列本地映射成中文，并逐行标出可比性 —— 既不泄漏英文枚举，也不改 domain 契约。
 */
function PairSyncTable({ table }: { table: V2Table }) {
  const visible = ['crop', 'city_a', 'city_b', 'seasonal_corr', 'n_months', 'freq_a', 'freq_b', 'freq_pair']
    .filter((column) => table.columns.includes(column));

  const renderCell = (column: string, row: Record<string, string>) => {
    const raw = row[column] ?? '';
    if (column === 'freq_a' || column === 'freq_b') return FREQ_LABEL[raw] ?? raw;
    if (column === 'freq_pair') return FREQ_PAIR_LABEL[raw] ?? raw;
    if (column === 'crop' || column === 'city_a' || column === 'city_b') return raw;
    return <MetricValueView metricId={column} value={raw} />;
  };

  return (
    <figure className="data-table cx-pairs">
      <figcaption className="data-table__head">
        <span className="data-table__caption">市场季节同步</span>
      </figcaption>
      <div className="data-table__scroll">
        <table>
          <thead>
            <tr>
              {visible.map((column) => <th key={column} scope="col">{columnMeta(column)?.label}</th>)}
              <th scope="col">可比较性</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) => (
              <tr key={index}>
                {visible.map((column) => (
                  <td key={column} data-numeric={columnMeta(column)?.valueType === 'number' || undefined}>
                    {renderCell(column, row)}
                  </td>
                ))}
                <td><ComparabilityBadge value={pairComparability(row.freq_pair)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="data-table__foot">
        <span>共 {table.rows.length} 行</span>
      </div>
    </figure>
  );
}

function MetricDetail({ metric, activeCity, onSelectCity }: {
  metric: CrossCityMetric;
  activeCity: string | null;
  onSelectCity: (cityId: string) => void;
}) {
  const table = useTable(CITY_ID, metric.table);

  return (
    <div className="cx-detail">
      <div className="cx-detail__head">
        <h3 className="ag-section-title">{metric.label}</h3>
        <ComparabilityBadge value={metric.comparability} />
      </div>
      <p className="ag-body-secondary">{productText(metric.basis)}</p>

      {table.status === 'loading' && <div className="cx-detail__skeleton" aria-hidden role="status" aria-label="数据表加载中" />}
      {table.status === 'error' && <p className="ag-body" role="alert">该指标读取失败，请稍后重试。</p>}

      {table.status === 'ready' && (
        <>
          {metric.id === 'seasonal-pairs' ? (
            <PairSyncTable table={table.data} />
          ) : (
            <>
              {metric.kind === 'city' && (
                <ComparisonBars table={table.data} column={metric.valueColumn} activeCity={activeCity} onSelectCity={onSelectCity} />
              )}
              <DataTable table={table.data} caption={metric.label} filterColumn={metric.kind === 'crop' ? 'crop' : undefined} />
            </>
          )}
        </>
      )}
    </div>
  );
}

export function CrossCityContent() {
  const [metricId, setMetricId] = useState<string>(CROSS_CITY_METRICS[0].id);
  const [activeCity, setActiveCity] = useState<string | null>(null);
  const metric = findMetric(metricId);

  const articleState = useArticle(CITY_ID, 'A10');
  const article = articleState.status === 'ready' ? articleState.data : null;

  /** 高亮城市只取当前指标表里真实出现过（数值非空）的城市。 */
  const table = useTable(CITY_ID, metric.table);
  const highlighted = useMemo(() => {
    if (table.status !== 'ready' || !table.data.columns.includes('city')) return [];
    return [...new Set(table.data.rows
      .filter((row) => (row[metric.valueColumn] ?? '') !== '')
      .map((row) => shortNameToId.get(row.city ?? '') ?? row.city ?? ''))].filter(Boolean);
  }, [metric.valueColumn, table]);

  const activeResolved = activeCity && highlighted.includes(activeCity) ? activeCity : (highlighted[0] ?? null);

  return (
      <div className="cross-city">
        <header className="ag-section__head">
          <p className="ag-label">六城比较</p>
          <h1 className="ag-hero">{article?.title ?? '辽宁六城农业市场与风险比较研究'}</h1>
        </header>

        {/* 指标切换 + 地图联动 + 指标详情 */}
        <section className="ag-section" aria-labelledby="cx-compare">
          <div className="ag-section__head">
            <h2 className="ag-section-title" id="cx-compare">辽宁六城比较</h2>
          </div>

          <div className="cx-switch" role="group" aria-label="指标切换">
            {CROSS_CITY_METRICS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="ag-chip"
                data-active={item.id === metric.id || undefined}
                aria-pressed={item.id === metric.id}
                onClick={() => setMetricId(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="cx-grid">
            <div className="cx-mapcol">
              <LiaoningMiniMap highlighted={highlighted} active={activeResolved} onSelect={setActiveCity} />
            </div>
            <MetricDetail metric={metric} activeCity={activeResolved} onSelectCity={setActiveCity} />
          </div>
        </section>

        {/* 研究侧配图 + 研究结论原文 */}
        <section className="ag-section" aria-labelledby="cx-source">
          <div className="ag-section__head">
            <h2 className="ag-section-title" id="cx-source">研究结果</h2>
          </div>
          <V2Figure src={assetUrl.figure(CITY_ID, 'cross_city_overview.png')} alt="A10 跨城研究总览图" index={1} />
          {article && (
            <div className="cx-conclusion">
              <h3 className="ag-section-title">结论</h3>
              <MarkdownBlocks source={productText(article.conclusion)} />
            </div>
          )}
        </section>
      </div>

  );
}

export function CrossCityPage() {
  const navigate = usePageNavigate();
  return <WorkbenchLayout className="report-workbench report-index-workbench" resetKey="cross-city" contentKey="cross-city" sidebarLabel="报告目录" railLabel="报告依据" onEscape={() => navigate(ROUTES.reports)} sidebar={close => <ReportNavigation close={close} />}>
    <WorkbenchMain><CrossCityContent /></WorkbenchMain><WorkbenchRail>{null}</WorkbenchRail>
  </WorkbenchLayout>;
}
