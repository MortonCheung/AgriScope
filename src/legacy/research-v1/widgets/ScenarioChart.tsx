import { useMemo, useState } from 'react';
import { DATA_COLORS } from '../../../design/chartTokens';
import { AsyncBoundary } from '../../../components/AsyncState';
import type { EvidenceLevelCode } from '../../../domain/research/types';
import { numeric } from '../../../services/csv';
import { useTables } from '../data/useTable';
import { BarChart, ChartFrame, type BarDatum } from './primitives';
import { OptionSelector } from './Selectors';

type Target = 'price' | 'volume';

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function fmt(value: number | null, digits = 4): string {
  return value === null ? '—' : value.toFixed(digits);
}

/**
 * C7：反事实与情景实验。
 * 先展示 World0 门控结果（模拟 vs 实测 R²），门控未通过时全部情景只作演示，不构成事实。
 */
export function ScenarioChart({
  gateSource, severitySource, bufferSource, gapSummarySource, evidenceLevel, note,
}: {
  gateSource: string;
  severitySource: string;
  bufferSource: string;
  gapSummarySource: string;
  evidenceLevel: EvidenceLevelCode;
  note?: string;
}) {
  const state = useTables([gateSource, severitySource, bufferSource, gapSummarySource]);
  const [target, setTarget] = useState<Target>('price');
  const [severityMult, setSeverityMult] = useState('');
  const [bufferFrac, setBufferFrac] = useState('');

  const model = useMemo(() => {
    if (state.status !== 'ready') return null;
    const [gate, severity, buffer, gapSummary] = state.data;
    const gateRows = gate.rows;
    const gateMin = numeric(gateRows[0]?.gate_min_r2 ?? '') ?? null;
    const priceGate = gateRows.find((row) => row.target === 'price') ?? null;
    const volumeGate = gateRows.find((row) => row.target === 'volume') ?? null;
    const gatePass = gateRows.every((row) => row.gate_pass === 'True');

    const severityMults = unique(severity.rows.map((row) => row.severity_mult));
    const activeMult = severityMult && severityMults.includes(severityMult) ? severityMult : severityMults[0] ?? '';
    const severityRows = severity.rows.filter((row) => row.severity_mult === activeMult);

    const bufferFracs = unique(buffer.rows.map((row) => row.buffer_frac));
    const activeFrac = bufferFrac && bufferFracs.includes(bufferFrac) ? bufferFrac : bufferFracs[0] ?? '';
    const bufferRows = buffer.rows.filter((row) => row.buffer_frac === activeFrac);

    const gapRows = gapSummary.rows.filter((row) => row.method === 'A' && row.window === 'during' && row.crop === 'POOLED');

    return {
      gateRows, gateMin, priceGate, volumeGate, gatePass,
      severityMults, activeMult, severityRows,
      bufferFracs, activeFrac, bufferRows, gapRows,
    };
  }, [bufferFrac, severityMult, state]);

  const gateBars: BarDatum[] = model ? model.gateRows.map((row) => ({
    id: row.target,
    label: `${row.target === 'price' ? '价格' : '成交量'}（模拟 vs 实测）`,
    value: numeric(row.r2_sim_vs_actual) ?? 0,
    color: row.gate_pass === 'True' ? DATA_COLORS.rain : DATA_COLORS.model,
    note: `门槛 ${fmt(numeric(row.gate_min_r2), 2)} · ${row.gate_pass === 'True' ? '通过' : '未通过'}`,
  })) : [];

  const severityBars: BarDatum[] = model ? model.severityRows.map((row) => ({
    id: row.crop,
    label: row.crop === 'POOLED' ? 'POOLED（汇总）' : row.crop,
    value: target === 'price' ? numeric(row.mean_gap_price_z) ?? 0 : numeric(row.mean_gap_volume_z) ?? 0,
    color: row.crop === 'POOLED' ? DATA_COLORS.extreme : DATA_COLORS.model,
    note: `${fmt(target === 'price' ? numeric(row.mean_gap_price_pct) : numeric(row.mean_gap_volume_pct), 2)}%`,
  })) : [];

  const bufferBars: BarDatum[] = model ? model.bufferRows.map((row) => ({
    id: row.crop,
    label: row.crop === 'POOLED' ? 'POOLED（汇总）' : row.crop,
    value: numeric(row.avoided_fraction) ?? 0,
    color: row.crop === 'POOLED' ? DATA_COLORS.extreme : DATA_COLORS.model,
    note: `剩余 ${fmt(numeric(row.price_gap_z_remaining))}`,
  })) : [];

  return (
    <ChartFrame
      title="反事实情景：门控与情景演示"
      note={note ?? '先用 World0 门控判断模型能否复现现实（模拟 vs 实测 R²）；门控未通过时，这些缺口、严重度与缓冲数字只作情景演示，不对应现实。'}
      provenance="scenario"
      lineage={[gateSource.split('/').pop() ?? '', severitySource.split('/').pop() ?? '', bufferSource.split('/').pop() ?? '', gapSummarySource.split('/').pop() ?? '']}
      evidenceLevel={`证据 ${evidenceLevel}`}
      status="实验性"
      controls={
        <>
          <OptionSelector<Target>
            label="目标"
            options={[{ id: 'price', label: '价格' }, { id: 'volume', label: '成交量' }]}
            value={target}
            onChange={setTarget}
          />
          {model && model.severityMults.length > 1 && (
            <OptionSelector
              label="严重度乘子"
              options={model.severityMults.map((entry) => ({ id: entry, label: `${entry} 倍` }))}
              value={model.activeMult}
              onChange={setSeverityMult}
            />
          )}
          {model && model.bufferFracs.length > 1 && (
            <OptionSelector
              label="供应缓冲"
              options={model.bufferFracs.map((entry) => ({ id: entry, label: `${(Number(entry) * 100).toFixed(0)}%` }))}
              value={model.activeFrac}
              onChange={setBufferFrac}
            />
          )}
        </>
      }
    >
      <AsyncBoundary state={state}>
        {() => (model && model.gateRows.length > 0 ? (
          <>
            <p className="ag-label">World0 门控：模拟 vs 实测 R²</p>
            <BarChart
              ariaLabel="World0 门控模型 R²"
              data={gateBars}
              valueFormat={(value) => value.toFixed(4)}
              zeroLine
            />
            <div className="readout-row">
              <div className="readout-row__item"><dt>价格模型 R²</dt><dd className="ag-number">{fmt(model.priceGate ? numeric(model.priceGate.r2_sim_vs_actual) : null)}</dd></div>
              <div className="readout-row__item"><dt>成交量模型 R²</dt><dd className="ag-number">{fmt(model.volumeGate ? numeric(model.volumeGate.r2_sim_vs_actual) : null)}</dd></div>
              <div className="readout-row__item"><dt>门控门槛 gate_min_r2</dt><dd className="ag-number">{fmt(model.gateMin, 2)}</dd></div>
              <div className="readout-row__item"><dt>门控结果</dt><dd className="ag-number">{model.gatePass ? '通过' : '未通过'}</dd></div>
            </div>

            <p className="ag-label">严重度情景：无灾害世界的缺口（{model.activeMult} 倍 · {target === 'price' ? '价格 z' : '成交量 z'}）</p>
            <BarChart
              ariaLabel="严重度情景缺口"
              data={severityBars}
              valueFormat={(value) => value.toFixed(4)}
              zeroLine
            />

            <p className="ag-label">供应缓冲情景：避免的价格冲击比例（{model.activeFrac} · avoided_fraction）</p>
            <BarChart
              ariaLabel="供应缓冲避免比例"
              data={bufferBars}
              valueFormat={(value) => value.toFixed(4)}
              zeroLine
            />

            {model.gapRows.length > 0 && (
              <div className="readout-row">
                {model.gapRows.map((row) => (
                  <div className="readout-row__item" key={row.target}>
                    <dt>World1A 缺口（{row.target === 'price' ? '价格' : '成交量'} z）</dt>
                    <dd className="ag-number">{fmt(numeric(row.mean_gap_z))}</dd>
                  </div>
                ))}
              </div>
            )}

            <p className="chart-frame__note">
              World0 门控：模拟 vs 实测 R² 价格 {fmt(model.priceGate ? numeric(model.priceGate.r2_sim_vs_actual) : null)}、
              成交量 {fmt(model.volumeGate ? numeric(model.volumeGate.r2_sim_vs_actual) : null)}，均低于门槛 {fmt(model.gateMin, 2)}，门控未通过。
              当前模型不足以支持可信的定量反事实——这是正式结论。以上数字未达到可靠反事实预测门槛，只作情景演示；
              供应缓冲避免比例接近 0，不等于「保供无用」，而是模型本就没有「量→价」传导。
            </p>
          </>
        ) : <p className="ag-meta">没有可用的反事实情景数据。</p>)}
      </AsyncBoundary>
    </ChartFrame>
  );
}
