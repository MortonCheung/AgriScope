import { useMemo, useState } from 'react';
import { variableColor } from '../../../design/chartTokens';
import { AsyncBoundary } from '../../../components/AsyncState';
import type { EvidenceLevelCode } from '../../../domain/research/types';
import { numeric } from '../../../services/csv';
import { useTables } from '../data/useTable';
import { BarChart, ChartFrame, type BarDatum } from './primitives';
import { VariableSelector } from './Selectors';

type Variable = 'price' | 'volume';

const VARIABLE_LABEL: Record<Variable, string> = { price: '价格', volume: '成交量' };

interface TrendRow {
  crop: string;
  annualizedPct: number;
  ciLow: number | null;
  ciHigh: number | null;
  p: number | null;
  seHac: number | null;
  nObs: number | null;
}

function readTrend(rows: Record<string, string>[]): TrendRow[] {
  return rows
    .map((row) => ({
      crop: row.crop,
      annualizedPct: numeric(row.annualized_trend_pct) ?? 0,
      ciLow: numeric(row.ci_low_annual_pct),
      ciHigh: numeric(row.ci_high_annual_pct),
      p: numeric(row.p_value),
      seHac: numeric(row.se_hac),
      nObs: numeric(row.n_obs),
    }))
    .sort((a, b) => b.annualizedPct - a.annualizedPct);
}

function isSignificant(row: TrendRow): boolean {
  return row.p !== null && row.p < 0.05;
}

function formatP(value: number | null): string {
  if (value === null) return '—';
  return value < 0.001 ? '<0.001' : value.toFixed(3);
}

function formatInterval(low: number | null, high: number | null): string {
  if (low === null || high === null) return '—';
  return `[${low.toFixed(2)}, ${high.toFixed(2)}]%`;
}

/**
 * G1 补充模块：log 变量对时间 t 的逐品种趋势（年化 %）。
 * 只呈现观测窗口内的斜率与区间；p<0.05 才算显著，区间跨 0 的品种不读作"有趋势"。
 */
export function TrendChart({ sources, evidenceLevel }: {
  sources: { price: string; volume: string };
  evidenceLevel: EvidenceLevelCode;
}) {
  const state = useTables([sources.price, sources.volume]);
  const [variable, setVariable] = useState<Variable>('price');
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const model = useMemo(() => {
    if (state.status !== 'ready') return null;
    const [priceTable, volumeTable] = state.data;
    const priceRows = readTrend(priceTable.rows);
    const volumeRows = readTrend(volumeTable.rows);
    const rows = variable === 'price' ? priceRows : volumeRows;
    return {
      rows,
      sigCount: rows.filter(isSignificant).length,
      priceSig: priceRows.filter(isSignificant).length,
      priceTotal: priceRows.length,
      volumeSig: volumeRows.filter(isSignificant).length,
      volumeTotal: volumeRows.length,
    };
  }, [state, variable]);

  const bars: BarDatum[] = model ? model.rows.map((row) => ({
    id: row.crop,
    label: row.crop,
    value: row.annualizedPct,
    color: variableColor(variable),
    muted: !isSignificant(row),
    note: isSignificant(row) ? `p=${formatP(row.p)} 显著` : `p=${formatP(row.p)}`,
  })) : [];

  const focus = model
    ? model.rows.find((row) => row.crop === hovered) ?? model.rows.find((row) => row.crop === selected) ?? null
    : null;

  return (
    <ChartFrame
      title={`${VARIABLE_LABEL[variable]}年化趋势（按品种）`}
      note={`横条为 log ${VARIABLE_LABEL[variable]} 对时间 t 的回归斜率年化后的百分比（HAC-14）；p<0.05 标注为显著，未达显著的品种以浅色显示。`}
      provenance="observed"
      sources={[sources.price.split('/').pop() ?? '', sources.volume.split('/').pop() ?? '']}
      evidenceLevel={`证据 ${evidenceLevel}`}
      controls={
        <VariableSelector<Variable>
          options={[{ id: 'price', label: '价格' }, { id: 'volume', label: '成交量' }]}
          value={variable}
          onChange={setVariable}
        />
      }
    >
      <AsyncBoundary state={state} label="正在读取趋势表">
        {() => (model && model.rows.length > 0 ? (
          <>
            <BarChart
              ariaLabel={`${VARIABLE_LABEL[variable]}逐品种年化趋势`}
              data={bars}
              valueFormat={(value) => `${value.toFixed(2)}%`}
              onSelect={setSelected}
              selectedId={selected}
            />

            <div className="selector">
              <span className="selector__label">悬停 / 点选品种查看完整读数</span>
              <ul className="compare-list" aria-label="逐品种年化趋势读数">
                {model.rows.map((row) => (
                  <li
                    key={row.crop}
                    data-active={(focus?.crop === row.crop) || undefined}
                    onPointerEnter={() => setHovered(row.crop)}
                    onPointerLeave={() => setHovered(null)}
                  >
                    <button type="button" onClick={() => setSelected(row.crop)}>{row.crop}</button>
                    <span className="ag-number">{row.annualizedPct.toFixed(2)}%</span>
                  </li>
                ))}
              </ul>
            </div>

            {focus ? (
              <div className="readout-row">
                <div className="readout-row__item"><dt>品种</dt><dd>{focus.crop}</dd></div>
                <div className="readout-row__item"><dt>年化趋势</dt><dd className="ag-number">{focus.annualizedPct.toFixed(2)}%</dd></div>
                <div className="readout-row__item"><dt>95% 区间</dt><dd className="ag-number">{formatInterval(focus.ciLow, focus.ciHigh)}</dd></div>
                <div className="readout-row__item"><dt>p 值</dt><dd className="ag-number">{formatP(focus.p)}</dd></div>
                <div className="readout-row__item"><dt>HAC 标准误</dt><dd className="ag-number">{focus.seHac !== null ? focus.seHac.toExponential(2) : '—'}</dd></div>
                <div className="readout-row__item"><dt>交易日样本</dt><dd className="ag-number">{focus.nObs ?? '—'}</dd></div>
                <div className="readout-row__item"><dt>显著性</dt><dd>{isSignificant(focus) ? '显著（p<0.05）' : '不显著'}</dd></div>
              </div>
            ) : <p className="ag-meta">悬停或点选任一品种，查看该品种的年化趋势、区间与 p 值。</p>}

            <p className="chart-frame__note">
              价格端仅少数品种趋势显著（{model.priceSig}/{model.priceTotal}）；成交量端显著品种更多，但方向分化（{model.volumeSig}/{model.volumeTotal}）。
              区间跨过 0 的品种不能读作"有趋势"，这里的斜率只是与时间的共变，不构成因果证据。
            </p>
          </>
        ) : <p className="ag-meta">该变量没有可用的趋势表。</p>)}
      </AsyncBoundary>
    </ChartFrame>
  );
}
