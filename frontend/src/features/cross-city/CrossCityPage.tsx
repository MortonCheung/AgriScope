import { useMemo, useState } from 'react';
import type { V2Table } from '../../domain/research/v2/repository';
import { assetUrl } from '../../domain/research/v2/repository';
import { columnMeta } from '../../domain/research/v2/metrics';
import { ROUTES } from '../../app/routes';
import { TransitionLink } from '../../app/pageNavigation';
import { MetricValueView } from '../../components/MetricValueView';
import { DataTable } from '../research-v2/DataTable';
import { V2Figure } from '../research-v2/Figure';
import { MarkdownBlocks } from '../research-v2/blocks';
import { renderInline, stripListPrefix } from '../research-v2/markdown';
import { useArticle, useTable } from '../research-v2/useV2';
import { LIAONING_CITIES } from '../../domain/geography/cities';
import { LiaoningMiniMap } from './LiaoningMiniMap';
import {
  COMPARABILITY_LABEL,
  COMPARABILITY_TONE,
  CROSS_CITY_METRICS,
  FREQ_LABEL,
  FREQ_PAIR_LABEL,
  PRICE_SCALE_REGISTRY,
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
      <figcaption className="ag-caption">
        {meta?.label} 按研究表内的城市顺序排列，未按数值排序，不构成排名。点选城市与左侧地图联动。
      </figcaption>
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
        <span className="data-table__caption">市场季节同步（城际配对，研究侧原始表）</span>
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
        <span className="data-table__note">同频率对（如朝阳—锦州，均为日度）口径一致，可直接比较；频率不同（日度 × 周度）粒度不一，不可直接比较。</span>
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
      <p className="ag-body-secondary">{metric.basis}</p>

      {table.status === 'loading' && <div className="cx-detail__skeleton" aria-hidden role="status" aria-label="数据表加载中" />}
      {table.status === 'error' && <p className="ag-body" role="alert">该指标的数据表读取失败；不展示占位内容。</p>}

      {table.status === 'ready' && (
        <>
          {metric.id === 'seasonal-pairs' ? (
            <PairSyncTable table={table.data} />
          ) : (
            <>
              {metric.kind === 'city' && (
                <ComparisonBars table={table.data} column={metric.valueColumn} activeCity={activeCity} onSelectCity={onSelectCity} />
              )}
              <DataTable table={table.data} caption="研究侧原始表（跨城，列名取自研究导出）" filterColumn={metric.kind === 'crop' ? 'crop' : undefined} />
            </>
          )}
        </>
      )}
    </div>
  );
}

export function CrossCityPage() {
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
    <main className="ag-page">
      <div className="ag-container cross-city">
        <header className="ag-section__head">
          <p className="ag-label">跨城市研究 · A10</p>
          <h1 className="ag-hero">{article?.title ?? '辽宁六城农业市场与风险比较研究'}</h1>
          <p className="ag-lead">
            在统一方法下比较六城的生产结构与市场同步性。六城价格口径不同，本页只做结构化与相对化比较，
            不做价格水平比较。
          </p>
          <p className="cx-back">
            <TransitionLink className="research-center__city-link" to={ROUTES.researchCenter}>← 返回研究中心</TransitionLink>
          </p>
        </header>

        {/* §25.1 硬红线：价格口径与"禁止排行" */}
        <section className="cx-redline" aria-label="价格口径红线">
          <p className="cx-redline__title">价格口径红线</p>
          <p className="ag-body">
            六城价格层级不同（批发 / 市场均价 / 超市 / 产地），研究侧明确「<strong>不做价格水平比较</strong>」。
            因此本页<strong>不提供六城菜价排行</strong>，价格水平的跨城对比一律标为「不可直接比较」。
          </p>
          <ul className="cx-scales">
            {PRICE_SCALE_REGISTRY.map((item) => (
              <li key={item.city}><span className="cx-scales__city">{item.city}</span><span className="cx-scales__scale">{item.scale}</span></li>
            ))}
          </ul>
          <p className="ag-caption">口径登记用于说明"为什么不可比"，不作为任何数值来源，也不参与比较计算。</p>
        </section>

        {/* 指标切换 + 地图联动 + 指标详情 */}
        <section className="ag-section" aria-labelledby="cx-compare">
          <div className="ag-section__head">
            <h2 className="ag-section-title" id="cx-compare">辽宁六城比较</h2>
            <p className="ag-body-secondary">切换指标查看对应研究表；每个对比都标注可比较性。切换项全部来自 A10 真实导出的表与列。</p>
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
              <p className="ag-caption">
                可比性图例：可直接比较 · 探索性比较 · 不可直接比较。领先/滞后类结论仅作探索性，不写成明确市场传导。
              </p>
            </div>
            <MetricDetail metric={metric} activeCity={activeResolved} onSelectCity={setActiveCity} />
          </div>
        </section>

        {/* 研究侧配图 + 研究结论原文 */}
        <section className="ag-section" aria-labelledby="cx-source">
          <div className="ag-section__head">
            <h2 className="ag-section-title" id="cx-source">研究侧呈现</h2>
            <p className="ag-body-secondary">以下为 A10 的真实图与结论原文，前端不改写。</p>
          </div>
          <V2Figure src={assetUrl.figure(CITY_ID, 'cross_city_overview.png')} alt="A10 跨城研究总览图" index={1} />
          {article && (
            <div className="cx-conclusion">
              <h3 className="ag-section-title">结论（A10 原文）</h3>
              <MarkdownBlocks source={article.conclusion} />
            </div>
          )}
          {article && article.limitations.length > 0 && (
            <div className="cx-conclusion">
              <h3 className="ag-section-title">研究局限（A10 原文）</h3>
              <ul className="cx-limits">
                {article.limitations.map((item, index) => <li key={index}>{renderInline(stripListPrefix(item), `cx-lim-${index}`)}</li>)}
              </ul>
            </div>
          )}
          <p className="cx-back">
            另见 <TransitionLink className="research-center__city-link" to={`${ROUTES.researchCenter}?view=synthesis`}>六城综合研究专题 →</TransitionLink>
          </p>
        </section>
      </div>
    </main>
  );
}