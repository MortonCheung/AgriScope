import { useMemo, useState } from 'react';
import { variableColor } from '../../../design/chartTokens';
import { AsyncBoundary } from '../../../components/AsyncState';
import type { EvidenceLevelCode } from '../../../domain/research/types';
import { numeric } from '../../../services/csv';
import { useTables } from '../data/useTable';
import { ChartFrame, XYChart, type XYBand, type XYMarker, type XYSeries } from './primitives';
import { CropSelector, VariableSelector } from './Selectors';

type Response = 'price' | 'volume';

/** C3：2026 最强暴雨案例事后均值与历史同期区间并列，标注是否落在历史区间内。 */
export function Case2026Chart({
  crops, summarySource, vsHistorySource, percropSource, weatherSource, evidenceLevel, note,
}: {
  crops: string[];
  summarySource: string;
  vsHistorySource: string;
  percropSource: string;
  weatherSource?: string | null;
  evidenceLevel: EvidenceLevelCode;
  note?: string;
}) {
  const state = useTables([summarySource, vsHistorySource, percropSource, weatherSource ?? null]);
  const [response, setResponse] = useState<Response>('price');
  const [crop, setCrop] = useState(crops[0] ?? '');

  const model = useMemo(() => {
    if (state.status !== 'ready') return null;
    const summary = state.data[0];
    const vsHistory = state.data[1];
    const percrop = state.data[2];
    const weather = weatherSource ? state.data[3] : undefined;

    const compare = percrop.rows
      .filter((row) => row.response === response)
      .map((row, index) => ({
        index,
        crop: row.crop,
        caseMean: numeric(row.case_post_mean),
        histMean: numeric(row.hist_post_mean),
        histLow: numeric(row.hist_ci_low),
        histHigh: numeric(row.hist_ci_high),
        within: row.case_within_hist_ci === 'True',
      }));

    const pooledRow = vsHistory.rows.find((row) => row.response === response) ?? null;
    const pooled = pooledRow ? {
      caseMean: numeric(pooledRow.case_post_mean),
      histMean: numeric(pooledRow.hist_post_mean),
      histLow: numeric(pooledRow.hist_ci_low),
      histHigh: numeric(pooledRow.hist_ci_high),
      within: pooledRow.case_within_hist_ci === 'True',
      placeboP: numeric(pooledRow.placebo_p),
    } : null;

    const summaryRow = summary.rows.find((row) => row.crop === crop && row.response === response) ?? null;
    const detail = summaryRow ? {
      windows: [
        { label: '前窗均值', value: numeric(summaryRow.pre_mean) },
        { label: '事件窗 −2..+2', value: numeric(summaryRow['event_mean(-2..2)']) },
        { label: '事件后 +3..14', value: numeric(summaryRow.post_3_14) },
        { label: '+15..28', value: numeric(summaryRow.post_15_28) },
        { label: '+29..42', value: numeric(summaryRow.post_29_42) },
      ],
      troughOffset: numeric(summaryRow.trough_offset),
      troughZ: numeric(summaryRow.trough_z),
      peakOffset: numeric(summaryRow.peak_offset),
      peakZ: numeric(summaryRow.peak_z),
      recoveryOffset: numeric(summaryRow.recovery_offset),
      recoveryDays: numeric(summaryRow.recovery_days),
    } : null;

    const weatherPoints = weather ? weather.rows.map((row, index) => ({
      index,
      date: row.date,
      precip: numeric(row.precipitation),
      precip3d: numeric(row.precip_3d),
      climZ: numeric(row.clim_z),
    })) : [];

    return { compare, pooled, detail, weatherPoints };
  }, [crop, response, state, weatherSource]);

  const color = variableColor(response);
  const withinCount = model ? model.compare.filter((entry) => entry.within).length : 0;

  const series: XYSeries[] = model ? [
    {
      id: 'history',
      label: '历史同期事后均值',
      points: model.compare.filter((entry) => entry.histMean !== null).map((entry) => ({ x: entry.index, y: entry.histMean as number })),
      color: 'var(--ag-ink-muted)',
      dash: '6 4',
      dots: true,
    },
    {
      id: 'case',
      label: '2026 案例事后均值',
      points: model.compare.filter((entry) => entry.caseMean !== null).map((entry) => ({ x: entry.index, y: entry.caseMean as number })),
      color,
      dots: true,
    },
  ] : [];

  const bands: XYBand[] = model ? [{
    id: 'hist-ci',
    upper: model.compare.filter((entry) => entry.histHigh !== null).map((entry) => ({ x: entry.index, y: entry.histHigh as number })),
    lower: model.compare.filter((entry) => entry.histLow !== null).map((entry) => ({ x: entry.index, y: entry.histLow as number })),
    color,
    opacity: 0.14,
  }] : [];

  const markers: XYMarker[] = model
    ? model.compare.filter((entry) => !entry.within).map((entry) => ({ x: entry.index, label: entry.crop, color: 'var(--ag-data-extreme)' }))
    : [];

  const windowSeries: XYSeries[] = model && model.detail ? [{
    id: 'case-window',
    label: '案例事件窗平均响应（z）',
    points: model.detail.windows
      .map((entry, index) => ({ x: index, y: entry.value }))
      .filter((entry) => entry.y !== null) as { x: number; y: number }[],
    color,
    dots: true,
  }] : [];

  const weatherMaxIndex = model && model.weatherPoints.length > 0
    ? model.weatherPoints.reduce((best, entry) => ((entry.precip ?? -Infinity) > (best.precip ?? -Infinity) ? entry : best)).index
    : 0;

  const weatherSeries: XYSeries[] = model ? [
    {
      id: 'precip',
      label: '当日降水量（mm）',
      points: model.weatherPoints.filter((entry) => entry.precip !== null).map((entry) => ({ x: entry.index, y: entry.precip as number })),
      color: variableColor('precip'),
      dots: true,
    },
    {
      id: 'precip3d',
      label: '3 日累计降水（mm）',
      points: model.weatherPoints.filter((entry) => entry.precip3d !== null).map((entry) => ({ x: entry.index, y: entry.precip3d as number })),
      color: variableColor('precip'),
      dash: '5 4',
    },
  ] : [];

  return (
    <ChartFrame
      title="2026 案例：事后均值与历史同期区间"
      note={note ?? '横轴为品种；阴影为历史同期事后均值的 95% 区间。案例均值落在区间内表示与历史同期不可区分；标红的品种落在区间外（多重比较下需谨慎解读）。'}
      provenance="observed"
      sources={[summarySource.split('/').pop() ?? '', vsHistorySource.split('/').pop() ?? '', percropSource.split('/').pop() ?? '', weatherSource ? weatherSource.split('/').pop() ?? '' : ''].filter(Boolean)}
      evidenceLevel={`证据 ${evidenceLevel}`}
      controls={
        <>
          <VariableSelector<Response>
            label="变量"
            options={[{ id: 'price', label: '价格' }, { id: 'volume', label: '成交量' }]}
            value={response}
            onChange={setResponse}
          />
          <CropSelector crops={crops} value={crop} onChange={setCrop} />
        </>
      }
    >
      <AsyncBoundary state={state} label="正在读取 2026 案例研究表">
        {() => (model && model.compare.length > 0 ? (
          <>
            <XYChart
              ariaLabel={`2026 案例各品种${response === 'price' ? '价格' : '成交量'}事后均值与历史区间`}
              height={300}
              series={series}
              bands={bands}
              markers={markers}
              zeroLine
              yLabel="悬停查看品种读数"
              xTickFormat={(value) => model.compare[Math.round(value)]?.crop ?? String(value)}
              describeX={(value) => {
                const nearest = model.compare[Math.round(Math.max(0, Math.min(model.compare.length - 1, value)))];
                if (!nearest) return '';
                const ci = nearest.histLow !== null && nearest.histHigh !== null ? `[${nearest.histLow.toFixed(2)}, ${nearest.histHigh.toFixed(2)}]` : '—';
                return `${nearest.crop}：案例 ${nearest.caseMean !== null ? nearest.caseMean.toFixed(2) : '—'}，历史均值 ${nearest.histMean !== null ? nearest.histMean.toFixed(2) : '—'}，历史 95% 区间 ${ci}，${nearest.within ? '落在区间内' : '落在区间外'}`;
              }}
            />
            <div className="readout-row">
              <div className="readout-row__item"><dt>落在历史区间内</dt><dd className="ag-number">{withinCount} / {model.compare.length}</dd></div>
              <div className="readout-row__item"><dt>汇总案例均值</dt><dd className="ag-number">{model.pooled?.caseMean !== null && model.pooled?.caseMean !== undefined ? model.pooled.caseMean.toFixed(3) : '—'}</dd></div>
              <div className="readout-row__item"><dt>汇总历史均值</dt><dd className="ag-number">{model.pooled?.histMean !== null && model.pooled?.histMean !== undefined ? model.pooled.histMean.toFixed(3) : '—'}</dd></div>
              <div className="readout-row__item"><dt>汇总历史 95% 区间</dt><dd className="ag-number">{model.pooled?.histLow !== null && model.pooled?.histHigh !== null && model.pooled?.histLow !== undefined && model.pooled?.histHigh !== undefined ? `[${model.pooled.histLow.toFixed(3)}, ${model.pooled.histHigh.toFixed(3)}]` : '—'}</dd></div>
              <div className="readout-row__item"><dt>汇总是否落内</dt><dd className="ag-number">{model.pooled ? (model.pooled.within ? '落在区间内' : '落在区间外') : '—'}</dd></div>
              <div className="readout-row__item"><dt>汇总安慰剂 p</dt><dd className="ag-number">{model.pooled?.placeboP !== null && model.pooled?.placeboP !== undefined ? model.pooled.placeboP.toFixed(3) : '—'}</dd></div>
            </div>
            <p className="chart-frame__note">
              {model.pooled?.within
                ? '案例事后均值落在历史同期区间内，与历史普通情形不可区分；个别品种落在区间外，在 22 个 offset 未校正的多重比较下需谨慎解读。'
                : '案例事后均值落在历史同期区间外。这是一个观察事实，不等于已识别出因果机制。'}
            </p>

            {model.detail && windowSeries.length > 0 && (
              <>
                <p className="ag-label">案例事件窗剖面 · {crop}</p>
                <XYChart
                  ariaLabel={`${crop}${response === 'price' ? '价格' : '成交量'}案例事件窗剖面`}
                  height={260}
                  series={windowSeries}
                  zeroLine
                  yLabel="悬停查看窗口读数"
                  xTickFormat={(value) => model.detail?.windows[Math.round(value)]?.label ?? String(value)}
                  describeX={(value) => {
                    const entry = model.detail?.windows[Math.round(Math.max(0, Math.min(model.detail.windows.length - 1, value)))];
                    return entry ? `${entry.label}：${entry.value !== null ? entry.value.toFixed(3) : '—'}（z）` : '';
                  }}
                />
                <div className="readout-row">
                  <div className="readout-row__item"><dt>谷底偏移</dt><dd className="ag-number">{model.detail.troughOffset ?? '—'}</dd></div>
                  <div className="readout-row__item"><dt>谷底 z</dt><dd className="ag-number">{model.detail.troughZ !== null ? model.detail.troughZ.toFixed(3) : '—'}</dd></div>
                  <div className="readout-row__item"><dt>峰值偏移</dt><dd className="ag-number">{model.detail.peakOffset ?? '—'}</dd></div>
                  <div className="readout-row__item"><dt>峰值 z</dt><dd className="ag-number">{model.detail.peakZ !== null ? model.detail.peakZ.toFixed(3) : '—'}</dd></div>
                  <div className="readout-row__item"><dt>恢复偏移</dt><dd className="ag-number">{model.detail.recoveryOffset ?? '—'}</dd></div>
                  <div className="readout-row__item"><dt>恢复天数</dt><dd className="ag-number">{model.detail.recoveryDays ?? '—'}</dd></div>
                </div>
              </>
            )}

            {model.weatherPoints.length > 0 && (
              <>
                <p className="ag-label">2026 天气侧观测（实际观测）</p>
                <XYChart
                  ariaLabel="2026 案例窗口降水过程"
                  height={260}
                  series={weatherSeries}
                  markers={[{ x: weatherMaxIndex, label: '过程最大降水', color: 'var(--ag-data-extreme)' }]}
                  yLabel="悬停查看逐日降水读数"
                  xTickFormat={(value) => model.weatherPoints[Math.round(value)]?.date?.slice(5) ?? String(value)}
                  describeX={(value) => {
                    const entry = model.weatherPoints[Math.round(Math.max(0, Math.min(model.weatherPoints.length - 1, value)))];
                    if (!entry) return '';
                    return `${entry.date}：当日 ${entry.precip !== null ? entry.precip.toFixed(1) : '—'} mm，3 日累计 ${entry.precip3d !== null ? entry.precip3d.toFixed(1) : '—'} mm，气候 z ${entry.climZ !== null ? entry.climZ.toFixed(2) : '—'}`;
                  }}
                />
              </>
            )}
          </>
        ) : <p className="ag-meta">没有可用的 2026 案例对比数据。</p>)}
      </AsyncBoundary>
    </ChartFrame>
  );
}
