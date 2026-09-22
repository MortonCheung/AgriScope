import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { CHART_TOKENS } from '../../../design/chartTokens';
import { MOTION_DURATION } from '../../../design/motion';
import { SourceCitation } from '../../../components/SourceCitation';

/**
 * 轻量 SVG 图表原语。全部支持真实交互（悬停读数 / 联动），
 * 不用静态图片假装交互；也不引入额外图表依赖。
 */

export interface XYPoint { x: number; y: number }

export interface XYSeries {
  id: string;
  label: string;
  points: XYPoint[];
  color: string;
  dash?: string;
  width?: number;
  /** 是否用点标记 */
  dots?: boolean;
}

export interface XYBand {
  id: string;
  upper: XYPoint[];
  lower: XYPoint[];
  color: string;
  opacity?: number;
}

export interface XYMarker { x: number; label: string; color?: string; dash?: string }

export interface XYChartProps {
  height?: number;
  series: XYSeries[];
  bands?: XYBand[];
  markers?: XYMarker[];
  zeroLine?: boolean;
  yTicks?: number;
  xTickFormat?: (value: number) => string;
  yTickFormat?: (value: number) => string;
  highlightX?: number | null;
  onHoverX?: (value: number | null) => void;
  /** 悬停时用于说明当前 x 的文案 */
  describeX?: (value: number) => string;
  yLabel?: string;
  ariaLabel: string;
  /** 沿时间轴逐渐绘制曲线，事件标注按真实顺序出现（时间序列动画）。 */
  reveal?: boolean;
}

const WIDTH = 760;
const PAD = { left: 52, right: 18, top: 18, bottom: 34 };

function extent(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1];
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) { if (value < min) min = value; if (value > max) max = value; }
  if (min === max) return [min - 1, max + 1];
  return [min, max];
}

function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) return [min];
  const step = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(step));
  const normalized = step / magnitude;
  const niceStep = (normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1) * magnitude;
  const start = Math.ceil(min / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let value = start; value <= max + niceStep / 1000 && ticks.length < 24; value += niceStep) ticks.push(Number(value.toFixed(10)));
  return ticks;
}

export function XYChart({
  height = 300, series, bands = [], markers = [], zeroLine = false, yTicks = 4,
  xTickFormat = (value) => String(value), yTickFormat = (value) => String(Number(value.toFixed(2))),
  highlightX = null, onHoverX, describeX, yLabel, ariaLabel, reveal = false,
}: XYChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const reducedMotion = Boolean(useReducedMotion());
  const [revealProgress, setRevealProgress] = useState(reveal ? 0 : 1);
  const revealKey = useMemo(() => series.map((entry) => `${entry.id}:${entry.points.length}`).join('|'), [series]);

  useEffect(() => {
    if (!reveal || reducedMotion) { setRevealProgress(1); return; }
    setRevealProgress(0);
    const started = performance.now();
    const duration = MOTION_DURATION.chartReveal * 1000;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      setRevealProgress(progress);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reveal, reducedMotion, revealKey]);

  const xs = useMemo(() => series.flatMap((entry) => entry.points.map((point) => point.x)), [series]);
  const ys = useMemo(() => series.flatMap((entry) => entry.points.map((point) => point.y)), [series]);
  const [xMin, xMax] = extent(xs);
  const [rawYMin, rawYMax] = useMemo(() => {
    const bandY = bands.flatMap((band) => [...band.upper.map((point) => point.y), ...band.lower.map((point) => point.y)]);
    const all = [...ys, ...bandY, ...(zeroLine ? [0] : [])];
    return extent(all);
  }, [bands, ys, zeroLine]);
  const padding = (rawYMax - rawYMin) * 0.12 || 1;
  const yMin = rawYMin - padding;
  const yMax = rawYMax + padding;

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const sx = (value: number) => PAD.left + (xMax === xMin ? innerW / 2 : ((value - xMin) / (xMax - xMin)) * innerW);
  const sy = (value: number) => PAD.top + innerH - ((value - yMin) / (yMax - yMin)) * innerH;

  const yTickValues = useMemo(() => niceTicks(yMin, yMax, yTicks), [yMin, yMax, yTicks]);
  const xTickValues = useMemo(() => {
    if (xs.length === 0) return [];
    const unique = [...new Set(xs)].sort((a, b) => a - b);
    if (unique.length <= 8) return unique;
    const step = Math.max(1, Math.floor(unique.length / 7));
    return unique.filter((_, index) => index % step === 0);
  }, [xs]);

  const linePath = (points: XYPoint[]) => points.map((point, index) => `${index === 0 ? 'M' : 'L'}${sx(point.x).toFixed(2)},${sy(point.y).toFixed(2)}`).join(' ');

  // 时间序列动画：只在 x ≤ 当前揭示位置的部分可见，标注按真实顺序出现。
  const revealLimit = revealProgress >= 1 ? xMax : xMin + (xMax - xMin) * revealProgress;
  const slicePoints = (points: XYPoint[]) => {
    const boundary = points.findIndex((point) => point.x > revealLimit);
    return boundary === -1 ? points : points.slice(0, Math.min(points.length, boundary + 1));
  };
  const visibleSeries = series.map((entry) => ({ ...entry, points: slicePoints(entry.points) }));
  const visibleBands = bands.map((band) => ({ ...band, upper: slicePoints(band.upper), lower: slicePoints(band.lower) }));
  const visibleMarkers = markers.filter((marker) => marker.x <= revealLimit);

  const hovered = hover ?? highlightX;
  const activeX = hovered ?? null;
  const readout = activeX !== null ? describeX?.(activeX) : undefined;

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="chart__svg"
        role="img"
        aria-label={ariaLabel}
        onPointerLeave={() => { setHover(null); onHoverX?.(null); }}
        onPointerMove={(event) => {
          if (!onHoverX) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          const xValue = xMin + ratio * (xMax - xMin);
          setHover(xValue);
          onHoverX?.(xValue);
        }}
      >
        {yTickValues.map((tick) => (
          <g key={`y-${tick}`}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={sy(tick)} y2={sy(tick)} stroke={CHART_TOKENS.grid} />
            <text x={PAD.left - 8} y={sy(tick) + 3.5} textAnchor="end" fontSize={CHART_TOKENS.fontSize} fill={CHART_TOKENS.label} fontFamily={CHART_TOKENS.fontFamily}>{yTickFormat(tick)}</text>
          </g>
        ))}
        {visibleBands.map((band) => (
          <path
            key={band.id}
            d={`${linePath(band.upper)} L${sx(band.lower[band.lower.length - 1]?.x ?? xMax)},${sy(band.lower[band.lower.length - 1]?.y ?? 0)} ${band.lower.slice().reverse().map((point) => `L${sx(point.x).toFixed(2)},${sy(point.y).toFixed(2)}`).join(' ')} Z`}
            fill={band.color}
            opacity={band.opacity ?? 0.16}
          />
        ))}
        {zeroLine && yMin <= 0 && yMax >= 0 && (
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={sy(0)} y2={sy(0)} stroke={CHART_TOKENS.axis} strokeDasharray="3 3" />
        )}
        {visibleMarkers.map((marker) => (
          <g key={`m-${marker.label}-${marker.x}`}>
            <line x1={sx(marker.x)} x2={sx(marker.x)} y1={PAD.top} y2={PAD.top + innerH} stroke={marker.color ?? CHART_TOKENS.annotationStrong} strokeDasharray={marker.dash ?? '4 3'} />
            <text x={sx(marker.x) + 4} y={PAD.top + 10} fontSize={CHART_TOKENS.fontSize} fill={marker.color ?? CHART_TOKENS.annotationStrong} fontFamily={CHART_TOKENS.fontFamily}>{marker.label}</text>
          </g>
        ))}
        {visibleSeries.map((entry) => (
          <g key={entry.id}>
            <path d={linePath(entry.points)} fill="none" stroke={entry.color} strokeWidth={entry.width ?? 1.8} strokeDasharray={entry.dash} strokeLinejoin="round" strokeLinecap="round" />
            {entry.dots && entry.points.map((point) => (
              <circle key={`${entry.id}-${point.x}`} cx={sx(point.x)} cy={sy(point.y)} r={2.6} fill={entry.color} />
            ))}
          </g>
        ))}
        {xTickValues.map((tick) => (
          <text key={`x-${tick}`} x={sx(tick)} y={height - 12} textAnchor="middle" fontSize={CHART_TOKENS.fontSize} fill={CHART_TOKENS.label} fontFamily={CHART_TOKENS.fontFamily}>{xTickFormat(tick)}</text>
        ))}
        {activeX !== null && (
          <line x1={sx(activeX)} x2={sx(activeX)} y1={PAD.top} y2={PAD.top + innerH} stroke={CHART_TOKENS.annotation} strokeDasharray="2 3" />
        )}
      </svg>
      <div className="chart__readout" aria-live="polite">
        {readout ? <span>{readout}</span> : <span className="chart__readout-hint">{yLabel ?? '悬停查看读数'}</span>}
      </div>
      <ul className="chart__legend">
        {series.map((entry) => (
          <li key={entry.id}>
            <span className="chart__swatch" style={{ background: entry.color, opacity: entry.dash ? 0.6 : 1 }} aria-hidden />
            {entry.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 水平条形图：用于排名/对比类结果（趋势、重要性、缺口）。 */
export interface BarDatum { id: string; label: string; value: number; color?: string; muted?: boolean; note?: string }

export function BarChart({ data, valueFormat = (value: number) => value.toFixed(2), zeroLine = true, ariaLabel, onSelect, selectedId }: {
  data: BarDatum[];
  valueFormat?: (value: number) => string;
  zeroLine?: boolean;
  ariaLabel: string;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}) {
  const values = data.map((entry) => entry.value);
  const [min, max] = extent(values);
  const span = Math.max(Math.abs(min), Math.abs(max)) || 1;
  const bound = zeroLine ? span : max;
  const rowH = 26;
  const width = 760;
  const labelW = 150;
  const zeroX = zeroLine ? labelW + ((0 - (-bound)) / (2 * bound || 1)) * (width - labelW - 40) : labelW;
  const scale = zeroLine
    ? (width - labelW - 40) / (2 * bound || 1)
    : (width - labelW - 40) / (bound || 1);

  return (
    <div className="barchart">
      <svg viewBox={`0 0 ${width} ${data.length * rowH + 16}`} className="chart__svg" role="img" aria-label={ariaLabel}>
        {data.map((entry, index) => {
          const y = index * rowH + 8;
          const barW = Math.abs(entry.value) * scale;
          const x = entry.value >= 0 ? zeroX : zeroX - barW;
          const isSelected = selectedId === entry.id;
          return (
            <g key={entry.id} onClick={() => onSelect?.(entry.id)} style={{ cursor: onSelect ? 'pointer' : undefined }} opacity={entry.muted ? 0.45 : 1}>
              <rect x={labelW} y={y} width={width - labelW - 40} height={rowH - 8} fill={isSelected ? CHART_TOKENS.band : 'transparent'} />
              <text x={labelW - 10} y={y + 13} textAnchor="end" fontSize={CHART_TOKENS.fontSize + 1} fill={CHART_TOKENS.labelStrong}>{entry.label}</text>
              <rect x={x} y={y + 2} width={barW} height={rowH - 12} fill={entry.color ?? 'var(--ag-data-price)'} />
              <text x={entry.value >= 0 ? zeroX + barW + 6 : zeroX - barW - 6} y={y + 13} textAnchor={entry.value >= 0 ? 'start' : 'end'} fontSize={CHART_TOKENS.fontSize} fill={CHART_TOKENS.label} fontFamily={CHART_TOKENS.fontFamily}>
                {valueFormat(entry.value)}{entry.note ? ` · ${entry.note}` : ''}
              </text>
            </g>
          );
        })}
        {zeroLine && <line x1={zeroX} x2={zeroX} y1={4} y2={data.length * rowH + 2} stroke={CHART_TOKENS.axis} />}
      </svg>
    </div>
  );
}

/** 图表外框：标题 / 说明 / 来源 / 证据等级 / 控件。 */
export function ChartFrame({ title, note, children, controls, provenance, sources, evidenceLevel, status }: {
  title: string;
  note?: string;
  children: ReactNode;
  controls?: ReactNode;
  provenance: 'observed' | 'model' | 'scenario';
  sources: string[];
  evidenceLevel?: string;
  status?: string;
}) {
  return (
    <section className="chart-frame" data-provenance={provenance}>
      <header className="chart-frame__head">
        <div className="chart-frame__titles">
          <h3 className="chart-frame__title">{title}</h3>
          {note && <p className="chart-frame__note">{note}</p>}
        </div>
        <div className="chart-frame__tags">
          <span className="ag-badge ag-badge--plain" data-provenance={provenance}>
            {{ observed: '实际观测', model: '模型估计', scenario: '情景模拟' }[provenance]}
          </span>
          {evidenceLevel && <span className="ag-badge ag-badge--plain">{evidenceLevel}</span>}
          {status && <span className="ag-badge ag-badge--plain">{status}</span>}
        </div>
      </header>
      {controls && <div className="chart-frame__controls">{controls}</div>}
      <div className="chart-frame__body">{children}</div>
      {/* 来源统一走 SourceCitation（V3 §34）：找不到就如实说明，不编造（§32） */}
      <footer className="chart-frame__foot">
        <SourceCitation sources={sources} />
      </footer>
    </section>
  );
}
