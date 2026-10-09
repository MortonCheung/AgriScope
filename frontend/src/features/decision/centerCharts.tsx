/**
 * 决策中心图表（SVG 自建，不引入图表库）。
 *
 *  - ForecastChart：历史锚点 + 预测中心线 + 情景区间同图（§10/§11）；
 *  - HorizonSpread：7/14/30 三个跨度的**真实**相对区间宽度对比（§11）；
 *  - LongBands：30–180 长期场景横向区间带，按 production_status 降低确定性（§12）。
 *
 * 全部数值直接来自 provider 输出；缺失就不画点、不补零。切换跨度时用 motion 平滑过渡，
 * 不重建整页。
 */
import { motion, useReducedMotion } from 'motion/react';
import type { HistoryAnchor } from './centerModel';
import { longCertainty, LONG_CERTAINTY_LABEL } from './centerModel';
import type { LongRow } from './useDecisionCenter';
import { MOTION_DURATION, MOTION_EASE } from '../../design/motion';

const n1 = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
const CONFIDENCE_CN: Record<string, string> = { high: '高', medium: '中', low: '低' };

export function ForecastChart({ anchors, horizon, mid, low, high, unit, label }: {
  anchors: HistoryAnchor[]; horizon: number; mid: number | null; low: number | null; high: number | null; unit: string; label: string;
}) {
  const reduced = Boolean(useReducedMotion());
  const values = [...anchors.map((a) => a.price), low, high, mid].filter((v): v is number => v !== null && Number.isFinite(v));
  if (!values.length) return <div className="decision-plot__empty" role="status">价格数据待补充</div>;
  const min = Math.min(...values), max = Math.max(...values);
  const pad = (max - min || Math.abs(max) * 0.1 || 1) * 0.12;
  const lo = min - pad, hi = max + pad;
  const left = 54, right = 632, top = 28, bottom = 224;
  const tStart = -Math.max(1, ...anchors.map((a) => a.daysAgo));
  const tEnd = Math.max(horizon, 1);
  const x = (t: number) => left + ((t - tStart) / (tEnd - tStart)) * (right - left);
  const y = (p: number) => bottom - ((p - lo) / (hi - lo)) * (bottom - top);
  const transition = { duration: reduced ? 0 : MOTION_DURATION.normal, ease: MOTION_EASE.out };
  const line = anchors.map((a) => `${x(-a.daysAgo)},${y(a.price)}`).join(' ');
  const latest = anchors.find((a) => a.daysAgo === 0)?.price ?? null;
  const midLabel = mid === null ? '中心值待补充' : `中心 ${n1(mid)} ${unit}`;

  return <figure className="decision-plot center-chart">
    <figcaption className="ag-sr-only">{label}</figcaption>
    <svg viewBox="0 0 660 268" role="img" aria-label={`${label}。历史锚点 ${anchors.length} 个；${horizon} 天预测中心 ${n1(mid)}，情景区间 ${n1(low)} 到 ${n1(high)} ${unit}`}>
      <rect className="center-chart__future" x={x(0)} y={top - 8} width={Math.max(0, right - x(0))} height={bottom - top + 16} aria-hidden="true"/>
      <line className="decision-plot__axis" x1={left} x2={right} y1={bottom} y2={bottom}/>
      <line className="center-chart__now" x1={x(0)} x2={x(0)} y1={top - 8} y2={bottom} aria-hidden="true"/>
      {anchors.length > 1 && <motion.polyline className="center-chart__history" initial={false} animate={{ points: line }} points={line} fill="none"/>}
      {anchors.map((a) => <circle key={a.daysAgo} className="center-chart__anchor" cx={x(-a.daysAgo)} cy={y(a.price)} r="3.5"/>)}
      {mid !== null && latest !== null && <motion.line className="center-chart__connect" initial={false} animate={{ x1: x(0), y1: y(latest), x2: x(horizon), y2: y(mid) }} x1={x(0)} y1={y(latest)} x2={x(horizon)} y2={y(mid)}/>}
      {low !== null && high !== null && <motion.line className="center-chart__range" initial={false} animate={{ x1: x(horizon), x2: x(horizon), y1: y(low), y2: y(high) }} x1={x(horizon)} x2={x(horizon)} y1={y(low)} y2={y(high)}/>}
      {low !== null && high !== null && <><line className="center-chart__cap" x1={x(horizon) - 8} x2={x(horizon) + 8} y1={y(low)} y2={y(low)}/><line className="center-chart__cap" x1={x(horizon) - 8} x2={x(horizon) + 8} y1={y(high)} y2={y(high)}/></>}
      {mid !== null && <motion.circle className="decision-plot__point" initial={false} animate={{ cx: x(horizon), cy: y(mid) }} cx={x(horizon)} cy={y(mid)} r="5" style={{ transition: reduced ? 'none' : undefined }} transition={transition}/>}
      <text x={x(0)} y={bottom + 20} textAnchor="middle">基准日</text>
      <text x={x(horizon)} y={bottom + 20} textAnchor="middle">{horizon} 天</text>
      <text x={left} y={top - 12}>历史锚点（由 daily 快照涨跌幅反推） {latest === null ? '' : `· 当前 ${n1(latest)} ${unit}`}</text>
      <text x={right} y={top - 12} textAnchor="end">{midLabel}</text>
      <text x={left} y={bottom + 40}>{n1(lo)}</text>
      <text x={right} y={bottom + 40} textAnchor="end">{n1(hi)} {unit}</text>
    </svg>
  </figure>;
}

export function HorizonSpread({ rows, unit }: { rows: { horizon: number; low: number | null; high: number | null; mid: number | null }[]; unit: string }) {
  const reduced = Boolean(useReducedMotion());
  const usable = rows.filter((r) => r.low !== null && r.high !== null && r.mid !== null && r.mid > 0)
    .map((r) => ({ horizon: r.horizon, relative: ((r.high! - r.low!) / r.mid!) * 100, width: r.high! - r.low!, unit }));
  if (!usable.length) return <p className="decision-note">各跨度的情景区间待补充。</p>;
  const maxRel = Math.max(...usable.map((r) => r.relative), 1);
  return <div className="center-spread" aria-label="各跨度情景区间相对宽度">
    <p className="ag-label">各跨度情景区间相对宽度（真实值，未校准为概率区间）</p>
    {usable.map((r) => <div key={r.horizon} className="center-spread__row">
      <span className="center-spread__horizon">{r.horizon} 天</span>
      <span className="center-spread__track"><motion.i initial={false} animate={{ width: `${(r.relative / maxRel) * 100}%` }} transition={{ duration: reduced ? 0 : MOTION_DURATION.normal, ease: MOTION_EASE.out }} className="center-spread__bar"/></span>
      <span className="center-spread__value">{r.relative.toFixed(0)}% · 区间 {n1(r.width)} {unit}</span>
    </div>)}
    <p className="decision-note">相对宽度 = （区间上界 − 下界）÷ 中心值。真实模型在不同跨度上的区间宽度并不单调递增，这里如实呈现，不做修饰。</p>
  </div>;
}

export function LongBands({ rows, unit, selected, onSelect }: {
  rows: LongRow[]; unit: string; selected: number; onSelect: (horizon: number) => void;
}) {
  const usable = rows.filter((r) => r.point !== null);
  return <ul className="center-bands" aria-label="长期场景区间">
    {rows.map((row) => {
      const certainty = longCertainty(row.productionStatus);
      const exploratory = certainty === 'exploratory' || certainty === 'research_only';
      return <li key={row.horizon} data-selected={row.horizon === selected || undefined} data-certainty={certainty}>
        <button type="button" className="center-bands__head" aria-pressed={row.horizon === selected} onClick={() => onSelect(row.horizon)}>
          <span className="center-bands__horizon">{row.horizon} 天</span>
          <span className="center-bands__badge">{LONG_CERTAINTY_LABEL[certainty]}{row.confidence ? ` · 可信度${CONFIDENCE_CN[row.confidence] ?? row.confidence}` : ''}</span>
        </button>
        <div className="center-bands__body">
          <span className="center-bands__reading">{n1(row.point)} {unit}</span>
          <span className="center-bands__range">{row.low === null || row.high === null ? '区间待补充' : `${n1(row.low)} – ${n1(row.high)}`}</span>
        </div>
        {exploratory && <p className="center-bands__caution">探索性结果：未通过独立生产门禁，仅作参考，不应当作精确答案。</p>}
      </li>;
    })}
    {!usable.length && <li className="decision-note">长期情景待补充。</li>}
  </ul>;
}

export function RangeBars({ rows }: { rows: { label: string; low: number | null; high: number | null; mid: number | null; unit: string }[] }) {
  const all = rows.flatMap((r) => [r.low, r.high, r.mid]).filter((v): v is number => v !== null);
  if (!all.length) return null;
  const min = Math.min(...all), max = Math.max(...all), pad = (max - min || 1) * 0.1;
  const lo = min - pad, hi = max + pad;
  const x = (v: number) => 12 + ((v - lo) / (hi - lo)) * 96;
  return <div className="center-rangebars" aria-label="价格区间对比">
    {rows.map((r) => <div key={r.label} className="center-rangebars__row">
      <span className="center-rangebars__label">{r.label}</span>
      <svg viewBox="0 0 120 20" role="img" aria-label={`${r.label}：${n1(r.low)} 到 ${n1(r.high)}，中心 ${n1(r.mid)} ${r.unit}`}>
        {r.low !== null && r.high !== null && <line className="decision-plot__range" x1={x(r.low)} x2={x(r.high)} y1="10" y2="10"/>}
        {r.mid !== null && <circle className="decision-plot__point" cx={x(r.mid)} cy="10" r="3"/>}
      </svg>
      <span className="center-rangebars__value">{r.low === null || r.high === null ? '—' : `${n1(r.low)}–${n1(r.high)}`} <em>{r.unit}</em></span>
    </div>)}
    <p className="decision-note">同尺度展示：范围越宽，模型对该跨度的中心值越不能确定。</p>
  </div>;
}