import { useMemo, useState } from 'react';
import { DATA_COLORS } from '../../../design/chartTokens';
import { AsyncBoundary } from '../../../components/AsyncState';
import type { EvidenceLevelCode } from '../../../domain/research/types';
import { numeric } from '../../../services/csv';
import { useTables } from '../data/useTable';
import { BarChart, ChartFrame, type BarDatum } from './primitives';
import { CropSelector, OptionSelector } from './Selectors';

function fmt(value: number | null, digits = 4): string {
  return value === null ? '—' : value.toFixed(digits);
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = key(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * C4：天气 → 成交量 → 价格 的两环分段传导。
 * 第一环来自逐品种阶段一回归，第二环取中介分析的 β_VP；中介乘积的区间跨零计数单独给出。
 */
export function TransmissionChart({
  crops, stage1Source, stage2Source, mediationSource, evidenceLevel, note,
}: {
  crops: string[];
  stage1Source: string;
  stage2Source: string;
  mediationSource: string;
  evidenceLevel: EvidenceLevelCode;
  note?: string;
}) {
  const state = useTables([stage1Source, stage2Source, mediationSource]);
  const [crop, setCrop] = useState(crops[0] ?? '');
  const [hazard, setHazard] = useState('');
  const [window, setWindow] = useState('');

  const model = useMemo(() => {
    if (state.status !== 'ready') return null;
    const [stage1, stage2, mediation] = state.data;
    const cropRows = stage1.rows.filter((row) => row.crop === crop);
    const hazards = uniqueBy(cropRows, (row) => row.hazard_key).map((row) => ({ id: row.hazard_key, label: row.hazard_label || row.hazard_key }));
    const windows = uniqueBy(cropRows, (row) => row.window).map((row) => row.window);
    const activeHazard = hazard && hazards.some((entry) => entry.id === hazard) ? hazard : hazards[0]?.id ?? '';
    const activeWindow = window && windows.includes(window) ? window : windows[0] ?? '';
    const stage1Row = cropRows.find((row) => row.hazard_key === activeHazard && row.window === activeWindow) ?? null;
    const stage2Row = stage2.rows.find((row) => row.crop === crop && row.hazard_key === activeHazard && row.window === activeWindow) ?? null;
    const mediationForWindow = mediation.rows.filter((row) => row.window === activeWindow);
    const mediationRow = mediation.rows.find((row) => row.hazard_key === activeHazard && row.window === activeWindow) ?? null;
    const stage1Sig = stage1.rows.filter((row) => { const value = numeric(row.fdr_p); return value !== null && value < 0.05; }).length;
    const crossZero = mediation.rows.filter((row) => row.ci_excl0 !== 'True').length;
    const stage1ByCrop = stage1.rows.filter((row) => row.hazard_key === activeHazard && row.window === activeWindow);
    return {
      hazards, windows, activeHazard, activeWindow, stage1Row, stage2Row,
      mediationForWindow, mediationRow, stage1Sig, stage1Total: stage1.rows.length,
      mediationTotal: mediation.rows.length, crossZero, stage1ByCrop,
    };
  }, [crop, hazard, state, window]);

  const ring1: BarDatum[] = model ? model.mediationForWindow.map((row) => ({
    id: row.hazard_key,
    label: row.hazard_label || row.hazard_key,
    value: numeric(row.beta_WV) ?? 0,
    color: DATA_COLORS.rain,
    note: `boot CI [${fmt(numeric(row.boot_ci_low), 3)}, ${fmt(numeric(row.boot_ci_high), 3)}]`,
  })) : [];

  const ring2: BarDatum[] = model ? model.mediationForWindow.map((row) => ({
    id: row.hazard_key,
    label: row.hazard_label || row.hazard_key,
    value: numeric(row.beta_VP) ?? 0,
    color: DATA_COLORS.price,
    note: row.ci_excl0 === 'True' ? '区间不含 0' : '区间含 0',
  })) : [];

  const stage2Bars: BarDatum[] = model?.stage2Row ? [
    { id: 'beta_A', label: '模型 A：价格~天气', value: numeric(model.stage2Row.beta_A) ?? 0, color: DATA_COLORS.model, note: `p=${fmt(numeric(model.stage2Row.p_A), 3)}` },
    { id: 'beta_C', label: '模型 C：+控制项', value: numeric(model.stage2Row.beta_C) ?? 0, color: DATA_COLORS.model, note: `p=${fmt(numeric(model.stage2Row.p_C), 3)}` },
    { id: 'beta_B', label: '模型 B：+成交量', value: numeric(model.stage2Row.beta_B) ?? 0, color: DATA_COLORS.model, note: `p=${fmt(numeric(model.stage2Row.p_B), 3)}` },
  ] : [];

  const stage1Bars: BarDatum[] = model ? model.stage1ByCrop.map((row) => ({
    id: row.crop,
    label: row.crop,
    value: numeric(row.effect) ?? 0,
    color: DATA_COLORS.volume,
    note: `FDR p=${fmt(numeric(row.fdr_p) ?? numeric(row.p_value), 3)}`,
  })) : [];

  return (
    <ChartFrame
      title="天气 → 成交量 → 价格：两环链式传导"
      note={note ?? '第一环为逐品种「天气→成交量」系数，第二环与中介乘积来自汇总中介分析。两环的区间均跨零时，该尺度上观测不到稳定传导。'}
      provenance="observed"
      sources={[stage1Source.split('/').pop() ?? '', stage2Source.split('/').pop() ?? '', mediationSource.split('/').pop() ?? '']}
      evidenceLevel={`证据 ${evidenceLevel}`}
      controls={
        <>
          <CropSelector crops={crops} value={crop} onChange={setCrop} />
          {model && model.hazards.length > 1 && (
            <OptionSelector
              label="天气暴露"
              options={model.hazards}
              value={model.activeHazard}
              onChange={setHazard}
            />
          )}
          {model && model.windows.length > 1 && (
            <OptionSelector
              label="滞后窗"
              options={model.windows.map((entry) => ({ id: entry, label: entry }))}
              value={model.activeWindow}
              onChange={setWindow}
            />
          )}
        </>
      }
    >
      <AsyncBoundary state={state}>
        {() => (model ? (
          <>
            <p className="ag-label">第一环：天气 → 成交量（汇总中介 β_WV · {model.activeWindow}）</p>
            <BarChart
              ariaLabel={`${model.activeWindow} 天气到成交量系数`}
              data={ring1}
              valueFormat={(value) => value.toFixed(4)}
              zeroLine
            />

            <p className="ag-label">第二环：成交量 → 价格（汇总中介 β_VP · {model.activeWindow}）</p>
            <BarChart
              ariaLabel={`${model.activeWindow} 成交量到价格系数`}
              data={ring2}
              valueFormat={(value) => value.toFixed(4)}
              zeroLine
            />

            <div className="readout-row">
              <div className="readout-row__item"><dt>第一环逐品种 FDR 显著</dt><dd className="ag-number">{model.stage1Sig} / {model.stage1Total}</dd></div>
              <div className="readout-row__item"><dt>中介效应区间跨零</dt><dd className="ag-number">{model.crossZero} / {model.mediationTotal}</dd></div>
              <div className="readout-row__item"><dt>选中中介效应</dt><dd className="ag-number">{model.mediationRow ? fmt(numeric(model.mediationRow.indirect), 6) : '—'}</dd></div>
              <div className="readout-row__item"><dt>中介 boot 区间</dt><dd className="ag-number">{model.mediationRow ? `[${fmt(numeric(model.mediationRow.boot_ci_low), 5)}, ${fmt(numeric(model.mediationRow.boot_ci_high), 5)}]` : '—'}</dd></div>
              <div className="readout-row__item"><dt>中介 boot 双尾 p</dt><dd className="ag-number">{model.mediationRow ? fmt(numeric(model.mediationRow.boot_p_twosided), 3) : '—'}</dd></div>
            </div>

            {model.stage2Row && (
              <>
                <p className="ag-label">三嵌套模型天气系数（{crop} · {model.activeHazard} · {model.activeWindow}）</p>
                <BarChart
                  ariaLabel={`${crop} 三嵌套模型天气系数`}
                  data={stage2Bars}
                  valueFormat={(value) => value.toFixed(4)}
                  zeroLine
                />
                <div className="readout-row">
                  <div className="readout-row__item"><dt>R²（模型 A）</dt><dd className="ag-number">{fmt(numeric(model.stage2Row.r2_A), 3)}</dd></div>
                  <div className="readout-row__item"><dt>R²（模型 C）</dt><dd className="ag-number">{fmt(numeric(model.stage2Row.r2_C), 3)}</dd></div>
                  <div className="readout-row__item"><dt>R²（模型 B）</dt><dd className="ag-number">{fmt(numeric(model.stage2Row.r2_B), 3)}</dd></div>
                  <div className="readout-row__item"><dt>天气系数变化 ΔC→B</dt><dd className="ag-number">{fmt(numeric(model.stage2Row.delta_C_to_B), 5)}</dd></div>
                  <div className="readout-row__item"><dt>样本量 n</dt><dd className="ag-number">{model.stage2Row.n ?? '—'}</dd></div>
                </div>
              </>
            )}

            <p className="ag-label">第一环逐品种读数（{model.activeHazard} · {model.activeWindow}）</p>
            <BarChart
              ariaLabel={`${model.activeHazard} 逐品种天气到成交量系数`}
              data={stage1Bars}
              valueFormat={(value) => value.toFixed(4)}
              zeroLine
            />

            <p className="chart-frame__note">
              链式传导两环均不成立：第一环（天气→成交量）逐品种系数经 FDR 校正后显著 {model.stage1Sig}/{model.stage1Total}，
              第二环（成交量→价格）中介效应区间跨零 {model.crossZero}/{model.mediationTotal}。
              这与「天气冲击通过供应端向价格传导」的机制在该日度尺度上不一致；不等于证明传导链不存在。
            </p>
          </>
        ) : <p className="ag-meta">该品种没有可用的传导机制数据。</p>)}
      </AsyncBoundary>
    </ChartFrame>
  );
}
