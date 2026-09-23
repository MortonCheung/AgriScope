import { useMemo, useState } from 'react';
import { columnMeta, formatMetricValue } from '../../../domain/research/v2/metrics';
import './estimate-chart.css';

export interface EstimateChartProps {
  rows: Record<string, string>[];
  /** 分类轴：用哪一列做 x（必须是研究表里的分类列）。 */
  categoryKey: string;
  /** 数值轴：用哪一列做点估计（必须是研究表里的数值列）。 */
  valueKey: string;
  /** 置信区间列（研究表里有才传）。 */
  ciLowKey?: string;
  ciHighKey?: string;
  /** 单位沿用指标契约；取不到就不写单位（见 §11：不写「无量纲」）。 */
  ciCaption?: string;
}

const PAD = { top: 18, right: 26, bottom: 54, left: 74 } as const;
const HEIGHT = 300;
const MIN_SLOT = 34;

function niceTick(value: number): string {
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
  if (abs >= 10) return value.toFixed(1);
  if (abs >= 1) return value.toFixed(2);
  if (abs >= 0.01) return value.toFixed(3);
  return value.toExponential(1);
}

function buildTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) return [min];
  const span = max - min;
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}

/**
 * 估计值与置信区间图（本轮 §17）。
 *
 * 只做一件事：把研究表里**已经算好的数字**画出来。
 * 不在浏览器里重跑模型、不算 p 值、不做任何统计推断。
 *
 * 布局约束（§87）：读数行永远存在且高度固定，hover 不会改变任何盒子尺寸。
 */
export function EstimateChart({ rows, categoryKey, valueKey, ciLowKey, ciHighKey, ciCaption }: EstimateChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  const meta = columnMeta(valueKey);
  const valueLabel = meta?.label ?? valueKey;
  const categoryLabel = columnMeta(categoryKey)?.label ?? categoryKey;

  const points = useMemo(() => {
    return rows
      .map((row) => ({
        category: row[categoryKey] ?? '',
        value: Number(row[valueKey]),
        low: ciLowKey ? Number(row[ciLowKey]) : undefined,
        high: ciHighKey ? Number(row[ciHighKey]) : undefined,
      }))
      .filter((point) => point.category !== '' && Number.isFinite(point.value));
  }, [categoryKey, ciHighKey, ciLowKey, rows, valueKey]);

  const scale = useMemo(() => {
    const values: number[] = [];
    for (const point of points) {
      values.push(point.value);
      if (point.low !== undefined && Number.isFinite(point.low)) values.push(point.low);
      if (point.high !== undefined && Number.isFinite(point.high)) values.push(point.high);
    }
    if (values.length === 0) return { min: -1, max: 1 };
    let min = Math.min(...values, 0);
    let max = Math.max(...values, 0);
    if (min === max) { min -= 1; max += 1; }
    const pad = (max - min) * 0.08;
    return { min: min - pad, max: max + pad };
  }, [points]);

  const width = Math.max(420, PAD.left + PAD.right + points.length * MIN_SLOT);
  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const slot = points.length > 0 ? plotWidth / points.length : plotWidth;
  const toY = (value: number) => PAD.top + ((scale.max - value) / (scale.max - scale.min)) * plotHeight;
  const ticks = buildTicks(scale.min, scale.max);

  const active = hover !== null ? points[hover] : null;
  const hasCi = Boolean(ciLowKey && ciHighKey);

  /**
   * 读数行的"最宽一条"（§87）。
   *
   * 读数行必须**永远占同样的高度**。若让它随着 hover 到的内容改变高度，
   * 每次指针移上去都会把下方内容顶动（实测 24px → 24.91px，整页 scrollHeight 一起涨）。
   * 所以让最宽的一条读数默默撑住行高，真正要显示的那条浮在它上面。
   */
  const readoutLength = (item: (typeof points)[number]) => {
    const ci = hasCi && item.low !== undefined && item.high !== undefined
      ? formatMetricValue(item.low, meta).length + formatMetricValue(item.high, meta).length
      : 0;
    return item.category.length + formatMetricValue(item.value, meta).length + ci;
  };
  const widest = points.reduce<(typeof points)[number] | null>(
    (best, item) => (best === null || readoutLength(item) > readoutLength(best) ? item : best),
    null,
  );

  return (
    <div className="estimate-chart">
      <div className="estimate-chart__head">
        <p className="estimate-chart__title">{valueLabel} · 按{categoryLabel}</p>
        <p className="estimate-chart__unit">
          {meta?.unit ? `${valueLabel} / ${meta.unit}` : valueLabel}
          {hasCi ? ciCaption ?? '（含置信区间）' : ''}
        </p>
      </div>

      <div className="estimate-chart__scroll">
        <svg viewBox={`0 0 ${width} ${HEIGHT}`} width={width} height={HEIGHT} role="img"
          aria-label={`${valueLabel} 按${categoryLabel}的估计值与区间`}>
          {ticks.map((tick, index) => (
            <g key={index}>
              <line x1={PAD.left} x2={width - PAD.right} y1={toY(tick)} y2={toY(tick)}
                className={tick === 0 ? 'estimate-chart__zero' : 'estimate-chart__grid'} />
              <text x={PAD.left - 8} y={toY(tick)} textAnchor="end" dominantBaseline="middle" className="estimate-chart__tick">
                {niceTick(tick)}
              </text>
            </g>
          ))}

          {points.map((point, index) => {
            const cx = PAD.left + slot * (index + 0.5);
            const cy = toY(point.value);
            const isActive = hover === index;
            return (
              <g key={`${point.category}-${index}`}
                onPointerEnter={() => setHover(index)}
                onPointerLeave={() => setHover(null)}
                style={{ animationDelay: `${Math.min(index, 24) * 14}ms` }}
                className={isActive ? 'estimate-chart__mark is-active' : 'estimate-chart__mark'}>
                {/* 命中区域：让 hover 更容易触发，且不改变任何布局 */}
                <rect x={cx - slot / 2} y={PAD.top} width={slot} height={plotHeight} className="estimate-chart__hit" />
                {hasCi && point.low !== undefined && point.high !== undefined
                  && Number.isFinite(point.low) && Number.isFinite(point.high) && (
                  <line x1={cx} x2={cx} y1={toY(point.high)} y2={toY(point.low)} className="estimate-chart__ci" />
                )}
                <circle cx={cx} cy={cy} r={isActive ? 4.5 : 3.2} className="estimate-chart__dot" />
                <text x={cx} y={HEIGHT - PAD.bottom + 16} textAnchor="middle" className="estimate-chart__cat">
                  {point.category.length > 6 ? `${point.category.slice(0, 6)}…` : point.category}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* 读数行：高度由"最宽一条"撑住，hover 不会让页面跳动（§87）。
          空闲时不写操作提示 —— 界面不靠"告诉我怎么用"才可用（§84）。 */}
      <div className="estimate-chart__readout" data-empty={active ? undefined : true}>
        {widest && (
          <span className="estimate-chart__readout-ghost" aria-hidden>
            <span className="estimate-chart__readout-cat">{widest.category}</span>
            <span className="estimate-chart__readout-value">{formatMetricValue(widest.value, meta)}</span>
            {hasCi && widest.low !== undefined && widest.high !== undefined && (
              <span className="estimate-chart__readout-ci">
                {formatMetricValue(widest.low, meta)} – {formatMetricValue(widest.high, meta)}
              </span>
            )}
          </span>
        )}
        {active && (
          <span className="estimate-chart__readout-live">
            <span className="estimate-chart__readout-cat">{active.category}</span>
            <span className="estimate-chart__readout-value">{formatMetricValue(active.value, meta)}</span>
            {hasCi && active.low !== undefined && active.high !== undefined && (
              <span className="estimate-chart__readout-ci">
                {formatMetricValue(active.low, meta)} – {formatMetricValue(active.high, meta)}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
