import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion, type Transition } from 'motion/react';
import { columnMeta, formatMetricValue, valueLabel as controlledValueLabel } from '../../../domain/research/v2/metrics';
import { SelectControl } from '../../../components/controls/SelectControl';
import { useChartFocus } from './useChartFocus';
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
  /** The host can provide the same heading without repeating it inside the chart. */
  showTitle?: boolean;
}

const PAD = { top: 18, right: 26, bottom: 54, left: 74 } as const;
const HEIGHT = 300;
const MIN_SLOT = 34;

/** Empty research cells are missing observations, never zero-valued results. */
export function researchNumber(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number' || typeof value === 'string' && value.trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

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

/** A range is offered only for an actual time axis with valid source categories. */
export function researchTimeValues(categories: string[], key: string): string[] {
  const values = [...new Set(categories)];
  if (values.length < 2) return [];
  if (key === 'month') {
    if (values.some(value => !/^(0?[1-9]|1[0-2])$/.test(value))) return [];
    return values.sort((a, b) => Number(a) - Number(b));
  }
  if (key === 'year' || key === 'test_year') {
    if (values.some(value => !/^\d{4}$/.test(value))) return [];
    return values.sort((a, b) => Number(a) - Number(b));
  }
  if (key === 'date') {
    if (values.some(value => !/^\d{4}-\d{2}-\d{2}$/.test(value)
      || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) return [];
    return values.sort();
  }
  return [];
}

/**
 * 估计值与置信区间图（本轮 §17）。
 *
 * 只做一件事：把研究表里**已经算好的数字**画出来。
 * 不在浏览器里重跑模型、不算 p 值、不做任何统计推断。
 *
 * 布局约束（§87）：读数行永远存在且高度固定，hover 不会改变任何盒子尺寸。
 */
export function EstimateChart({ rows, categoryKey, valueKey, ciLowKey, ciHighKey, ciCaption, showTitle = true }: EstimateChartProps) {
  const [inspection, setInspection] = useState<{ key: string; pinned: boolean } | null>(null);
  const [showEstimate, setShowEstimate] = useState(true);
  const [showInterval, setShowInterval] = useState(true);
  const [range, setRange] = useState<{ identity: string; start: string; end: string } | null>(null);
  const focus = useChartFocus();
  const titleId = useId();
  const tooltipId = useId();
  const reducedMotion = Boolean(useReducedMotion());
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(HEIGHT);
  const [scrollLeft, setScrollLeft] = useState(0);

  /**
   * 数据切换的 morph（本轮 §46）。
   *
   * 切换 selector 时，图**不 unmount 再淡入**：沿用同一个 DOM 节点，
   * 让点 / 区间 / 命中区平滑移动到新值（约 280ms）。减少动效时立即切换。
   */
  const morph: Transition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.28, ease: [0.16, 1, 0.3, 1] };

  /**
   * 图必须响应**真实容器宽度**（本轮 §41/§42）。
   *
   * 过去宽度写死 `max(420, PAD + n*34)`，10 个类别只有约 440px，而中栏有 700–900px，
   * 图只用了一半页面。现在观察父级滚动容器的宽度（**不观察 SVG 自己**，避免
   * ResizeObserver feedback loop），让图至少铺满容器；类别太多才退化为水平滚动。
   * jsdom 没有 ResizeObserver，退回 window resize 监听即可。
   */
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const measure = () => {
      setContainerWidth(element.clientWidth);
      setContainerHeight(element.clientHeight || HEIGHT);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [focus.expanded]);

  const meta = columnMeta(valueKey);
  const valueLabel = meta?.label ?? valueKey;
  const categoryLabel = columnMeta(categoryKey)?.label ?? categoryKey;

  const sourcePoints = useMemo(() => {
    const seen = new Map<string, number>();
    return rows
      .map((row) => ({
        category: row[categoryKey] ?? '',
        value: researchNumber(row[valueKey]),
        low: ciLowKey ? researchNumber(row[ciLowKey]) : undefined,
        high: ciHighKey ? researchNumber(row[ciHighKey]) : undefined,
      }))
      .filter((point): point is { category: string; value: number; low: number | undefined; high: number | undefined } => point.category !== '' && point.value !== undefined)
      .map((point) => {
        /* 分类取值**允许重复**：跨城序列的分类轴是 city_b，同一城市可在不同配对/作物里
           合法地出现多条（例：西红柿 朝阳→锦州 与 大连→锦州 都含锦州）。
           这里为每个取值记下它在序列内的出现序号，拼成唯一 key，不丢任何真实数据行。 */
        const occurrence = seen.get(point.category) ?? 0;
        seen.set(point.category, occurrence + 1);
        return { ...point, key: `${point.category}#${occurrence}` };
      });
  }, [categoryKey, ciHighKey, ciLowKey, rows, valueKey]);

  const timeValues = useMemo(() => researchTimeValues(sourcePoints.map(point => point.category), categoryKey), [categoryKey, sourcePoints]);
  const rangeIdentity = `${categoryKey}:${valueKey}`;
  const start = range?.identity === rangeIdentity && timeValues.includes(range.start) ? range.start : timeValues[0];
  const end = range?.identity === rangeIdentity && timeValues.includes(range.end) ? range.end : timeValues.at(-1);
  const startIndex = timeValues.indexOf(start ?? '');
  const endIndex = timeValues.indexOf(end ?? '');
  const validRange = startIndex <= endIndex;
  const points = useMemo(() => {
    if (!timeValues.length || !validRange) return sourcePoints;
    const visible = new Set(timeValues.slice(startIndex, endIndex + 1));
    return sourcePoints.filter(point => visible.has(point.category));
  }, [endIndex, sourcePoints, startIndex, timeValues, validRange]);

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

  /** 分类轴所需的最小宽度；容器更宽时铺满容器，更窄时才允许水平滚动（§42）。 */
  const requiredWidth = PAD.left + PAD.right + points.length * MIN_SLOT;
  const width = Math.max(containerWidth, requiredWidth, 320);
  const height = focus.expanded ? Math.max(240, containerHeight) : HEIGHT;
  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;
  const slot = points.length > 0 ? plotWidth / points.length : plotWidth;
  const toY = (value: number) => PAD.top + ((scale.max - value) / (scale.max - scale.min)) * plotHeight;
  const ticks = buildTicks(scale.min, scale.max);

  const activeIndex = inspection ? points.findIndex(point => point.key === inspection.key) : -1;
  const inspected = activeIndex >= 0 ? points[activeIndex] : null;
  const active = inspected && (showEstimate || showInterval && inspected.low !== undefined && inspected.high !== undefined) ? inspected : null;
  const hasCi = sourcePoints.some(point => point.low !== undefined && point.high !== undefined);
  const visibleInterval = points.some(point => point.low !== undefined && point.high !== undefined);
  const canInspect = showEstimate || showInterval && visibleInterval;
  const tooltipWidth = Math.min(220, Math.max(0, containerWidth - 16));
  const tooltipX = active ? Math.max(tooltipWidth / 2 + 8, Math.min(containerWidth - tooltipWidth / 2 - 8,
    PAD.left + slot * (activeIndex + 0.5) - scrollLeft)) : 0;
  const tooltipY = active ? Math.min(height - 106, Math.max(8, toY(active.value) > 104 ? toY(active.value) - 98 : toY(active.value) + 14)) : 0;

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
    <div className="estimate-chart-shell" style={{ height: focus.placeholderHeight }}>
    <dialog open ref={focus.dialogRef} className="estimate-chart" data-expanded={focus.expanded || undefined}
      role={focus.expanded ? 'dialog' : 'group'} aria-modal={focus.expanded || undefined} aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); focus.close(); }}
      onClick={event => {
        if (!focus.expanded || event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) focus.close();
      }}>
      <div className="estimate-chart__head">
        <p id={titleId} className={showTitle ? 'estimate-chart__title' : 'ag-sr-only'}>{valueLabel} · 按{categoryLabel}</p>
        <p className="estimate-chart__unit">
          {meta?.unit ? `${valueLabel} / ${meta.unit}` : valueLabel}
          {hasCi ? ciCaption ?? '（含置信区间）' : ''}
        </p>
        {focus.canExpand && <button type="button" ref={focus.triggerRef} className="estimate-chart__expand"
          aria-label="放大图表" aria-haspopup="dialog" aria-expanded={focus.expanded}
          hidden={focus.expanded} onClick={focus.open}>
          <svg aria-hidden viewBox="0 0 20 20" width="18" height="18"><path d="M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5"/></svg>
        </button>}
        <button type="button" ref={focus.closeRef} className="estimate-chart__close" aria-label="关闭放大"
          hidden={!focus.expanded} onClick={focus.close}>×</button>
      </div>

      {timeValues.length > 1 && <div className="estimate-chart__range">
        <SelectControl label={`${categoryLabel}起点`} value={validRange ? start! : timeValues[0]}
          options={timeValues.map((value, index) => ({ value, label: controlledValueLabel(categoryKey, value), disabled: validRange && index > endIndex }))}
          onChange={value => setRange({ identity: rangeIdentity, start: value, end: validRange ? end! : timeValues.at(-1)! })}/>
        <SelectControl label={`${categoryLabel}终点`} value={validRange ? end! : timeValues.at(-1)!}
          options={timeValues.map((value, index) => ({ value, label: controlledValueLabel(categoryKey, value), disabled: validRange && index < startIndex }))}
          onChange={value => setRange({ identity: rangeIdentity, start: validRange ? start! : timeValues[0], end: value })}/>
        <button type="button" className="estimate-chart__reset" disabled={!validRange || startIndex === 0 && endIndex === timeValues.length - 1}
          onClick={() => setRange(null)}>全部</button>
      </div>}

      <div className="estimate-chart__legend" aria-label="图例">
        <button type="button" aria-pressed={showEstimate} onClick={() => setShowEstimate(value => !value)}>
          <span className="estimate-chart__legend-dot" aria-hidden/>{valueLabel}
        </button>
        {hasCi && <button type="button" aria-pressed={showInterval} onClick={() => setShowInterval(value => !value)}>
          <span className="estimate-chart__legend-ci" aria-hidden/>置信区间
        </button>}
      </div>

      <div className="estimate-chart__plot">
      <div className="estimate-chart__scroll" ref={scrollRef} onScroll={event => setScrollLeft(event.currentTarget.scrollLeft)}>
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="group"
          aria-label={`${valueLabel} 按${categoryLabel}的估计值${hasCi ? '与区间' : ''}`}>
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
            const isActive = active?.key === point.key;
            /** 分类取值走受控中文映射（§38）：w0 → 当日、exposure → 中文变量名；没有映射就保留原值。 */
            const label = controlledValueLabel(categoryKey, point.category);
            const hasInterval = hasCi && point.low !== undefined && point.high !== undefined
              && Number.isFinite(point.low) && Number.isFinite(point.high);
            const visible = showEstimate || showInterval && hasInterval;
            return (
              /* key 用「分类取值 + 该取值出现序号」：分类取值本身可能重复（见上），
                 单用它会让同一城市（如锦州）的两条真实记录撞 key；追加序号既唯一，
                 又让同分类同序号的节点在切换 selector 时身份不变，能 morph 而不是重放淡入（§46）。 */
              <g key={point.key}
                role="button" tabIndex={visible ? 0 : -1} aria-label={`${label} ${formatMetricValue(point.value, meta)}`} aria-pressed={isActive}
                aria-disabled={!visible || undefined} aria-describedby={isActive && canInspect ? tooltipId : undefined}
                onFocus={() => { if (visible) setInspection({ key: point.key, pinned: true }); }}
                onClick={() => { if (visible) setInspection({ key: point.key, pinned: true }); }}
                onKeyDown={event => { if (visible && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setInspection({ key: point.key, pinned: true }); } }}
                onPointerEnter={() => { if (visible) setInspection({ key: point.key, pinned: false }); }}
                onPointerLeave={() => setInspection(current => current?.key === point.key && !current.pinned ? null : current)}
                style={{ animationDelay: `${Math.min(index, 24) * 14}ms` }}
                className={isActive ? 'estimate-chart__mark is-active' : 'estimate-chart__mark'}>
                {/* 命中区域：让 hover 更容易触发，且不改变任何布局；位置随 morph 一起移动 */}
                <motion.rect
                  initial={false}
                  animate={{ x: cx - slot / 2, y: PAD.top, width: slot, height: plotHeight }}
                  transition={morph}
                  className="estimate-chart__hit"
                />
                {hasInterval && showInterval && (
                  <motion.line
                    initial={false}
                    animate={{ x1: cx, x2: cx, y1: toY(point.high as number), y2: toY(point.low as number) }}
                    transition={morph}
                    className="estimate-chart__ci"
                  />
                )}
                {showEstimate && <motion.circle
                  initial={false}
                  animate={{ cx, cy, r: isActive ? 4.5 : 3.2 }}
                  transition={morph}
                  className="estimate-chart__dot"
                />}
                <motion.text
                  initial={false}
                  animate={{ x: cx }}
                  transition={morph}
                  y={height - PAD.bottom + 16}
                  textAnchor="middle"
                  className="estimate-chart__cat"
                >
                  {label.length > 6 ? `${label.slice(0, 6)}…` : label}
                </motion.text>
              </g>
            );
          })}
        </svg>
      </div>
      {active && canInspect && <div id={tooltipId} role="tooltip" className="estimate-chart__tooltip"
        style={{ left: tooltipX, top: tooltipY }}>
        <span>{controlledValueLabel(categoryKey, active.category)}</span>
        <strong>{formatMetricValue(active.value, meta)}</strong>
        {hasCi && active.low !== undefined && active.high !== undefined && <small>
          置信区间 {formatMetricValue(active.low, meta)} – {formatMetricValue(active.high, meta)}
        </small>}
      </div>}
      {!canInspect && <p className="estimate-chart__hidden-note" role="status">已隐藏图形，可通过图例恢复。</p>}
      </div>

      {/* 图的文本摘要（§38）：同一条数据关系对读屏用户也要可读，不靠图形本身。 */}
      {points.length > 0 && (
        <p className="ag-sr-only">
          {valueLabel} 按{categoryLabel}：
          {points.map((point, index) => {
            const interval = hasCi && point.low !== undefined && point.high !== undefined
              && Number.isFinite(point.low) && Number.isFinite(point.high)
              ? `（区间 ${formatMetricValue(point.low, meta)} – ${formatMetricValue(point.high, meta)}）`
              : '';
            return `${index > 0 ? '；' : ''}${controlledValueLabel(categoryKey, point.category)} ${formatMetricValue(point.value, meta)}${interval}`;
          })}
        </p>
      )}

      {/* 读数行：高度由"最宽一条"撑住，hover 不会让页面跳动（§87）。
          空闲时不写操作提示 —— 界面不靠"告诉我怎么用"才可用（§84）。 */}
      <div className="estimate-chart__readout" data-empty={active && canInspect ? undefined : true}>
        {widest && (
          <span className="estimate-chart__readout-ghost" aria-hidden>
            <span className="estimate-chart__readout-cat">{controlledValueLabel(categoryKey, widest.category)}</span>
            <span className="estimate-chart__readout-value">{formatMetricValue(widest.value, meta)}</span>
            {hasCi && widest.low !== undefined && widest.high !== undefined && (
              <span className="estimate-chart__readout-ci">
                {formatMetricValue(widest.low, meta)} – {formatMetricValue(widest.high, meta)}
              </span>
            )}
          </span>
        )}
        {active && canInspect && (
          <span className="estimate-chart__readout-live">
            <span className="estimate-chart__readout-cat">{controlledValueLabel(categoryKey, active.category)}</span>
            <span className="estimate-chart__readout-value">{formatMetricValue(active.value, meta)}</span>
            {hasCi && active.low !== undefined && active.high !== undefined && (
              <span className="estimate-chart__readout-ci">
                {formatMetricValue(active.low, meta)} – {formatMetricValue(active.high, meta)}
              </span>
            )}
          </span>
        )}
      </div>
    </dialog>
    </div>
  );
}
