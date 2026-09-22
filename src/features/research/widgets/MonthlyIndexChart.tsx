import { useEffect, useMemo, useState } from 'react';
import { CHART_TOKENS, variableColor } from '../../../design/chartTokens';
import { AsyncBoundary } from '../../../components/AsyncState';
import { useTables } from '../data/useTable';
import { useResearchContextStore } from '../../insight/researchContextStore';
import { ChartFrame, type BarDatum } from './primitives';
import { CropSelector, VariableSelector } from './Selectors';
import type { EvidenceLevelCode } from '../../../domain/research/types';

type Variable = 'price' | 'volume';

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

/**
 * G1 黄金样板：月份季节指数 + STL 季节强度。
 * 变的是品种与变量，不变的是"价格有节奏、成交量没有"这个结构性事实。
 */
export function MonthlyIndexChart({ crops, evidenceLevel, sources }: { crops: string[]; evidenceLevel: EvidenceLevelCode; sources: { price: string; volume: string; stl: string } }) {
  const state = useTables([sources.price, sources.volume, sources.stl]);
  const [crop, setCrop] = useState(crops[0] ?? '');
  const [variable, setVariable] = useState<Variable>('price');
  const [hoverMonth, setHoverMonth] = useState<number | null>(null);
  const setSelection = useResearchContextStore((state) => state.setSelection);

  useEffect(() => {
    setSelection({ selectedCrop: crop, selectedVariable: variable === 'price' ? '价格' : '成交量', currentFigure: '月份季节指数与季节强度' });
  }, [crop, setSelection, variable]);

  const values = useMemo(() => {
    if (state.status !== 'ready') return null;
    const [price, volume, stl] = state.data;
    const indexRows = (variable === 'price' ? price : volume).rows.filter((row) => row.crop === crop);
    const series = indexRows
      .map((row) => ({ month: Number(row.month), value: Number(row.seasonal_index), label: row.month_label }))
      .filter((entry) => Number.isFinite(entry.month) && Number.isFinite(entry.value))
      .sort((a, b) => a.month - b.month);
    const stlRow = stl.rows.find((row) => row.crop === crop && row.variable === variable);
    const compare = stl.rows
      .filter((row) => row.variable === variable)
      .map((row) => ({ crop: row.crop, strength: Number(row.seasonal_strength) }))
      .filter((entry) => Number.isFinite(entry.strength))
      .sort((a, b) => b.strength - a.strength);
    return { series, seasonalStrength: stlRow ? Number(stlRow.seasonal_strength) : null, trendStrength: stlRow ? Number(stlRow.trend_strength) : null, compare };
  }, [state, crop, variable]);

  const bars: BarDatum[] = values ? values.series.map((entry) => ({
    id: String(entry.month),
    label: entry.label,
    value: entry.value - 1,
    color: variableColor(variable),
  })) : [];

  const active = hoverMonth && values ? values.series.find((entry) => entry.month === hoverMonth) : null;
  const max = values && values.series.length > 0 ? values.series.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  const min = values && values.series.length > 0 ? values.series.reduce((a, b) => (b.value < a.value ? b : a)) : null;

  return (
    <ChartFrame
      title="月份季节指数与季节强度"
      note={'指数以全年均值为 1；价格与成交量在“节奏”上存在错位。'}
      provenance="observed"
      sources={[sources.price.split('/').pop() ?? '', sources.stl.split('/').pop() ?? '']}
      evidenceLevel={`证据 ${evidenceLevel}`}
      controls={
        <>
          <CropSelector crops={crops} value={crop} onChange={setCrop} />
          <VariableSelector<Variable>
            options={[{ id: 'price', label: '价格' }, { id: 'volume', label: '成交量' }]}
            value={variable}
            onChange={setVariable}
          />
        </>
      }
    >
      <AsyncBoundary state={state}>
        {() => (
          <>
            <svg viewBox="0 0 760 300" className="chart__svg" role="img" aria-label={`${crop}${variable === 'price' ? '价格' : '成交量'}月度季节指数`}>
              {bars.map((bar, index) => {
                const columnWidth = 700 / bars.length;
                const x = 40 + index * columnWidth;
                const zeroY = 230;
                const height = Math.abs(bar.value) * 300;
                const y = bar.value >= 0 ? zeroY - height : zeroY;
                const isActive = hoverMonth === index + 1;
                return (
                  <g
                    key={bar.id}
                    onPointerEnter={() => setHoverMonth(index + 1)}
                    onPointerLeave={() => setHoverMonth(null)}
                  >
                    <rect x={x} y={20} width={columnWidth - 4} height={240} fill={isActive ? CHART_TOKENS.band : 'transparent'} />
                    <rect x={x + 4} y={y} width={columnWidth - 12} height={Math.max(1.5, height)} fill={bar.color} opacity={isActive ? 1 : 0.85} />
                    <text x={x + (columnWidth - 4) / 2} y={252} textAnchor="middle" fontSize={CHART_TOKENS.fontSize} fill={CHART_TOKENS.label} fontFamily={CHART_TOKENS.fontFamily}>{index + 1}</text>
                  </g>
                );
              })}
              <line x1={40} x2={740} y1={230} y2={230} stroke={CHART_TOKENS.axis} />
              <text x={40} y={16} fontSize={CHART_TOKENS.fontSize} fill={CHART_TOKENS.label} fontFamily={CHART_TOKENS.fontFamily}>相对全年均值</text>
              <text x={740} y={16} textAnchor="end" fontSize={CHART_TOKENS.fontSize} fill={CHART_TOKENS.label} fontFamily={CHART_TOKENS.fontFamily}>月份</text>
            </svg>

            <div className="readout-row">
              <div className="readout-row__item"><dt>最高月</dt><dd className="ag-number">{max ? `${max.label} ${max.value.toFixed(2)}` : '—'}</dd></div>
              <div className="readout-row__item"><dt>最低月</dt><dd className="ag-number">{min ? `${min.label} ${min.value.toFixed(2)}` : '—'}</dd></div>
              <div className="readout-row__item"><dt>STL 季节强度</dt><dd className="ag-number">{values?.seasonalStrength !== null && values?.seasonalStrength !== undefined ? values.seasonalStrength.toFixed(3) : '—'}</dd></div>
              <div className="readout-row__item"><dt>趋势强度</dt><dd className="ag-number">{values?.trendStrength !== null && values?.trendStrength !== undefined ? values.trendStrength.toFixed(3) : '—'}</dd></div>
              <div className="readout-row__item"><dt>当前读数</dt><dd className="ag-number">{active ? `${active.label} ${active.value.toFixed(2)}` : '悬停月份'}</dd></div>
            </div>

            {values && values.compare.length > 0 && (
              <div className="selector">
                <span className="selector__label">季节强度排序（{variable === 'price' ? '价格' : '成交量'}）</span>
                <ol className="compare-list">
                  {values.compare.map((entry) => (
                    <li key={entry.crop} data-active={entry.crop === crop || undefined}>
                      <button type="button" onClick={() => setCrop(entry.crop)}>{entry.crop}</button>
                      <span className="ag-number">{entry.strength.toFixed(3)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}
      </AsyncBoundary>
    </ChartFrame>
  );
}
