import { useMemo, useState } from 'react';
import { variableColor } from '../../../design/chartTokens';
import { AsyncBoundary } from '../../../components/AsyncState';
import type { EvidenceLevelCode } from '../../../domain/research/types';
import { numeric } from '../../../services/csv';
import { useTable } from '../data/useTable';
import { BarChart, ChartFrame, type BarDatum } from './primitives';
import { OptionSelector, VariableSelector } from './Selectors';

type Variable = 'price' | 'volume';
type Metric = 'cv' | 'annualized_vol_pct';

const VARIABLE_LABEL: Record<Variable, string> = { price: '价格', volume: '成交量' };
const METRIC_LABEL: Record<Metric, string> = { cv: '变异系数 CV', annualized_vol_pct: '年化波动率' };

interface VolatilityRow {
  crop: string;
  unit: string;
  mean: number | null;
  std: number | null;
  min: number | null;
  p05: number | null;
  p95: number | null;
  max: number | null;
  iqr: number | null;
  cv: number | null;
  annualizedVolPct: number | null;
  nObs: number | null;
}

function readRows(raw: Record<string, string>[], variable: Variable): VolatilityRow[] {
  return raw
    .filter((row) => row.variable === variable)
    .map((row) => ({
      crop: row.crop,
      unit: row.unit,
      mean: numeric(row.mean),
      std: numeric(row.std),
      min: numeric(row.min),
      p05: numeric(row.p05),
      p95: numeric(row.p95),
      max: numeric(row.max),
      iqr: numeric(row.iqr),
      cv: numeric(row.cv),
      annualizedVolPct: numeric(row.annualized_vol_pct),
      nObs: numeric(row.n_obs),
    }));
}

function metricValue(row: VolatilityRow, metric: Metric): number | null {
  return metric === 'cv' ? row.cv : row.annualizedVolPct;
}

function formatNumber(value: number | null, digits = 3): string {
  return value === null ? '—' : value.toFixed(digits);
}

function formatRange(low: number | null, high: number | null): string {
  if (low === null || high === null) return '—';
  return `${low.toFixed(2)} – ${high.toFixed(2)}`;
}

/**
 * G8 补充模块：逐品种波动描述统计。
 * 只做描述性分层展示；本表不含任何检验，因此不给出作物风险分组。
 */
export function CropVolatilityChart({ source, evidenceLevel }: {
  source: string;
  evidenceLevel: EvidenceLevelCode;
}) {
  const state = useTable(source);
  const [variable, setVariable] = useState<Variable>('price');
  const [metric, setMetric] = useState<Metric>('annualized_vol_pct');
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const model = useMemo(() => {
    if (state.status !== 'ready') return null;
    const raw = state.data.rows;
    const rows = readRows(raw, variable)
      .map((row) => ({ row, value: metricValue(row, metric) }))
      .filter((entry): entry is { row: VolatilityRow; value: number } => entry.value !== null)
      .sort((a, b) => b.value - a.value);
    const span = (target: Variable) => {
      const values = readRows(raw, target)
        .map((row) => metricValue(row, metric))
        .filter((value): value is number => value !== null);
      if (values.length < 2) return null;
      const min = Math.min(...values);
      if (min === 0) return null;
      return Math.max(...values) / min;
    };
    return { entries: rows, priceSpan: span('price'), volumeSpan: span('volume') };
  }, [metric, state, variable]);

  const bars: BarDatum[] = model ? model.entries.map((entry) => ({
    id: entry.row.crop,
    label: entry.row.crop,
    value: entry.value,
    color: variableColor(variable),
    note: entry.row.unit,
  })) : [];

  const focus = model
    ? model.entries.find((entry) => entry.row.crop === hovered)?.row ?? model.entries.find((entry) => entry.row.crop === selected)?.row ?? null
    : null;

  return (
    <ChartFrame
      title={`${VARIABLE_LABEL[variable]}波动的品种分层`}
      note={`按 ${METRIC_LABEL[metric]} 从大到小排列；该表为描述统计，不含任何显著性检验，排序只说明本观测窗口内的差异。`}
      provenance="observed"
      sources={[source.split('/').pop() ?? '']}
      evidenceLevel={`证据 ${evidenceLevel}`}
      controls={
        <>
          <VariableSelector<Variable>
            options={[{ id: 'price', label: '价格' }, { id: 'volume', label: '成交量' }]}
            value={variable}
            onChange={setVariable}
          />
          <OptionSelector<Metric>
            label="波动口径"
            options={[{ id: 'annualized_vol_pct', label: '年化波动率' }, { id: 'cv', label: '变异系数 CV' }]}
            value={metric}
            onChange={setMetric}
          />
        </>
      }
    >
      <AsyncBoundary state={state}>
        {() => (model && model.entries.length > 0 ? (
          <>
            <BarChart
              ariaLabel={`${VARIABLE_LABEL[variable]}逐品种${METRIC_LABEL[metric]}`}
              data={bars}
              valueFormat={(value) => value.toFixed(2)}
              zeroLine={false}
              onSelect={setSelected}
              selectedId={selected}
            />

            <div className="selector">
              <ul className="compare-list" aria-label="逐品种波动读数">
                {model.entries.map((entry) => (
                  <li
                    key={entry.row.crop}
                    data-active={(focus?.crop === entry.row.crop) || undefined}
                    onPointerEnter={() => setHovered(entry.row.crop)}
                    onPointerLeave={() => setHovered(null)}
                  >
                    <button type="button" onClick={() => setSelected(entry.row.crop)}>{entry.row.crop}</button>
                    <span className="ag-number">{entry.value.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {focus ? (
              <div className="readout-row">
                <div className="readout-row__item"><dt>品种</dt><dd>{focus.crop}</dd></div>
                <div className="readout-row__item"><dt>单位</dt><dd>{focus.unit}</dd></div>
                <div className="readout-row__item"><dt>均值</dt><dd className="ag-number">{formatNumber(focus.mean)}</dd></div>
                <div className="readout-row__item"><dt>标准差</dt><dd className="ag-number">{formatNumber(focus.std)}</dd></div>
                <div className="readout-row__item"><dt>变异系数 CV</dt><dd className="ag-number">{formatNumber(focus.cv)}</dd></div>
                <div className="readout-row__item"><dt>年化波动率</dt><dd className="ag-number">{focus.annualizedVolPct !== null ? `${focus.annualizedVolPct.toFixed(2)}%` : '—'}</dd></div>
                <div className="readout-row__item"><dt>IQR</dt><dd className="ag-number">{formatNumber(focus.iqr)}</dd></div>
                <div className="readout-row__item"><dt>P05 – P95</dt><dd className="ag-number">{formatRange(focus.p05, focus.p95)}</dd></div>
                <div className="readout-row__item"><dt>最小 – 最大</dt><dd className="ag-number">{formatRange(focus.min, focus.max)}</dd></div>
                <div className="readout-row__item"><dt>交易日样本</dt><dd className="ag-number">{focus.nObs ?? '—'}</dd></div>
              </div>
            ) : <p className="ag-meta">尚未选择品种。</p>}

            <p className="chart-frame__note">
              波动存在清晰的品类分层，但品种间异质性缺乏统计支持：本表只给出描述统计，未做检验，不能据此给出作物风险分组。
              同一窗口内，价格年化波动的品种跨度约 {model.priceSpan !== null ? model.priceSpan.toFixed(1) : '—'} 倍，成交量约 {model.volumeSpan !== null ? model.volumeSpan.toFixed(1) : '—'} 倍；波动大不等于对天气更敏感。
            </p>
          </>
        ) : <p className="ag-meta">该变量没有可用的描述统计。</p>)}
      </AsyncBoundary>
    </ChartFrame>
  );
}
