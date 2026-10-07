import { useEffect, useMemo, useState } from 'react';
import { variableColor } from '../../../design/chartTokens';
import { AsyncBoundary } from '../../../components/AsyncState';
import type { EvidenceLevelCode } from '../../../domain/research/types';
import { useTables } from '../data/useTable';
import { useResearchContextStore } from '../../insight/researchContextStore';
import { ChartFrame, XYChart, type XYSeries } from './primitives';
import { CropSelector, OptionSelector } from './Selectors';
import { numeric } from '../../../services/csv';

/**
 * 分布滞后扫描：给定暴露（天气变量 / 土壤层）与品种，
 * 展示 lag 0..N 的效应、置信区间与 FDR 显著性。
 * 显著与否由研究表决定，前端不做二次筛选。
 */
export function LagScanChart({ crops, response, scanSource, summarySource, evidenceLevel, note, sourceLabel }: {
  crops: string[];
  response: 'price' | 'volume';
  scanSource: string;
  summarySource: string;
  evidenceLevel: EvidenceLevelCode;
  note?: string;
  sourceLabel?: string;
}) {
  const state = useTables([scanSource, summarySource]);
  const [crop, setCrop] = useState(crops[0] ?? '');
  const [exposure, setExposure] = useState<string>('');
  const setSelection = useResearchContextStore((state) => state.setSelection);

  useEffect(() => {
    setSelection({ selectedCrop: crop, selectedVariable: exposure || null, currentFigure: '滞后响应扫描' });
  }, [crop, exposure, setSelection]);

  const model = useMemo(() => {
    if (state.status !== 'ready') return null;
    const [scan, summary] = state.data;
    const rows = scan.rows.filter((row) => row.response === response && row.crop === crop);
    const exposures = [...new Map(rows.map((row) => [row.exposure, row.label ?? row.exposure])).entries()];
    const activeExposure = exposure && exposures.some(([id]) => id === exposure) ? exposure : exposures[0]?.[0] ?? '';
    const activeRows = rows
      .filter((row) => row.exposure === activeExposure)
      .map((row) => ({
        lag: numeric(row.lag_days) ?? numeric(row.lag_day) ?? 0,
        effect: numeric(row.effect_z_per_1sd) ?? numeric(row.effect) ?? 0,
        ciLow: numeric(row.ci_low),
        ciHigh: numeric(row.ci_high),
        fdr: numeric(row.fdr_p) ?? numeric(row.fdr_p_within),
        n: numeric(row.n_obs) ?? numeric(row.n),
      }))
      .sort((a, b) => a.lag - b.lag);
    const summaryRow = summary.rows.find((row) => row.response === response && row.crop === crop && row.exposure === activeExposure);
    return {
      exposures,
      activeExposure,
      label: exposures.find(([id]) => id === activeExposure)?.[1] ?? activeExposure,
      rows: activeRows,
      summary: summaryRow
        ? {
          peakLag: numeric(summaryRow.peak_lag),
          peakEffect: numeric(summaryRow.peak_effect),
          peakP: numeric(summaryRow.peak_fdr_p) ?? numeric(summaryRow.peak_p),
          nSig: numeric(summaryRow.n_lag_fdr_sig),
        }
        : null,
    };
  }, [crop, exposure, response, state]);

  const series: XYSeries[] = model ? [{
    id: 'effect',
    label: '每 1 SD 暴露的效应（z 口径）',
    points: model.rows.map((row) => ({ x: row.lag, y: row.effect })),
    color: variableColor(model.activeExposure),
    dots: true,
  }] : [];
  const bands = model ? [{
    id: 'ci',
    upper: model.rows.filter((row) => row.ciHigh !== null).map((row) => ({ x: row.lag, y: row.ciHigh as number })),
    lower: model.rows.filter((row) => row.ciLow !== null).map((row) => ({ x: row.lag, y: row.ciLow as number })),
    color: variableColor(model.activeExposure),
  }] : [];
  const markers = model ? model.rows
    .filter((row) => row.fdr !== null && row.fdr < 0.05)
    .map((row) => ({ x: row.lag, label: `L${row.lag}`, color: 'var(--ag-data-extreme)' })) : [];

  const sigCount = model ? model.rows.filter((row) => row.fdr !== null && row.fdr < 0.05).length : 0;

  return (
    <ChartFrame
      title={`滞后 ${response === 'price' ? '价格' : '成交量'}响应`}
      note={note ?? '横轴为滞后天数，纵轴为每 1 个标准差的效应。虚线为零效应；红色标记为通过 FDR 校正的滞后天数。'}
      provenance="observed"
      lineage={[sourceLabel ?? scanSource.split('/').pop() ?? '', summarySource.split('/').pop() ?? '']}
      evidenceLevel={`证据 ${evidenceLevel}`}
      controls={
        <>
          <CropSelector crops={crops} value={crop} onChange={setCrop} />
          {model && model.exposures.length > 1 && (
            <OptionSelector
              label="暴露变量"
              options={model.exposures.map(([id, text]) => ({ id, label: text }))}
              value={model.activeExposure}
              onChange={setExposure}
            />
          )}
        </>
      }
    >
      <AsyncBoundary state={state}>
        {() => (model && model.rows.length > 0 ? (
          <>
            <XYChart
              ariaLabel={`${crop}${response === 'price' ? '价格' : '成交量'}对${model.label}的滞后响应`}
              series={series}
              bands={bands}
              markers={markers}
              zeroLine
              yLabel="某个滞后天数的效应"
              xTickFormat={(value) => `L${value}`}
              describeX={(value) => {
                const nearest = model.rows.reduce((a, b) => (Math.abs(b.lag - value) < Math.abs(a.lag - value) ? b : a));
                const ci = nearest.ciLow !== null && nearest.ciHigh !== null ? `，95% CI [${nearest.ciLow.toFixed(3)}, ${nearest.ciHigh.toFixed(3)}]` : '';
                const fdr = nearest.fdr !== null ? `，FDR p=${nearest.fdr < 0.001 ? '<0.001' : nearest.fdr.toFixed(3)}` : '';
                return `滞后 ${nearest.lag} 天：效应 ${nearest.effect.toFixed(3)}${ci}${fdr}`;
              }}
            />
            <div className="readout-row">
              <div className="readout-row__item"><dt>峰值滞后</dt><dd className="ag-number">{model.summary?.peakLag !== null && model.summary?.peakLag !== undefined ? `L${model.summary.peakLag}` : '—'}</dd></div>
              <div className="readout-row__item"><dt>峰值效应</dt><dd className="ag-number">{model.summary?.peakEffect !== null && model.summary?.peakEffect !== undefined ? model.summary.peakEffect.toFixed(3) : '—'}</dd></div>
              <div className="readout-row__item"><dt>FDR 显著滞后</dt><dd className="ag-number">{sigCount} / {model.rows.length}</dd></div>
              <div className="readout-row__item"><dt>带内显著滞后</dt><dd className="ag-number">{model.summary?.nSig !== null && model.summary?.nSig !== undefined ? model.summary.nSig : '—'}</dd></div>
            </div>
            <p className="chart-frame__note">
              {sigCount === 0
                ? '在当前滞后窗内没有滞后天数通过 FDR 校正——这是一个阴性结果，和"没有关系"不是一回事。'
                : '存在通过 FDR 校正的滞后天数，但是否可解释仍需检查峰值漂移与方向一致性。'}
            </p>
          </>
        ) : <p className="ag-meta">该暴露没有可用的滞后扫描数据。</p>)}
      </AsyncBoundary>
    </ChartFrame>
  );
}
