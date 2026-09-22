import { useMemo, useState } from 'react';
import { variableColor } from '../../../design/chartTokens';
import { AsyncBoundary } from '../../../components/AsyncState';
import type { EvidenceLevelCode } from '../../../domain/research/types';
import { numeric } from '../../../services/csv';
import { useTables } from '../data/useTable';
import { BarChart, ChartFrame, type BarDatum } from './primitives';
import { CropSelector, VariableSelector } from './Selectors';

type Response = 'price' | 'volume';

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * C5：极端天气后的恢复天数分布与删失比例。
 * 删失（T+42 未恢复）在读数里单独标出，恢复天数只作量级参考，不合成韧性指数。
 */
export function ResilienceChart({
  crops, summarySource, eventCropSource, evidenceLevel, note,
}: {
  crops: string[];
  summarySource: string;
  eventCropSource: string;
  evidenceLevel: EvidenceLevelCode;
  note?: string;
}) {
  const state = useTables([summarySource, eventCropSource]);
  const [response, setResponse] = useState<Response>('price');
  const [crop, setCrop] = useState(crops[0] ?? '');

  const model = useMemo(() => {
    if (state.status !== 'ready') return null;
    const [summary, eventCrop] = state.data;
    const summaryRows = summary.rows.filter((row) => row.response === response);
    const eventRows = eventCrop.rows.filter((row) => row.response === response);
    const cropEvents = eventRows.filter((row) => row.crop === crop);
    const recoveryDays = summaryRows.map((row) => numeric(row.recovery_days)).filter((value): value is number => value !== null);
    const censoredEvents = summaryRows.reduce((total, row) => total + (numeric(row.censored) ?? 0), 0);
    const totalEvents = summaryRows.reduce((total, row) => total + (numeric(row.n_events) ?? 0), 0);
    const eventCensored = eventRows.filter((row) => row.censored === 'True').length;
    const deepest = summaryRows.reduce<{ crop: string; shock: number } | null>((best, row) => {
      const shock = numeric(row.shock_magnitude);
      if (shock === null) return best;
      return best === null || shock < best.shock ? { crop: row.crop, shock } : best;
    }, null);
    return { summaryRows, eventRows, cropEvents, recoveryDays, censoredEvents, totalEvents, eventCensored, deepest };
  }, [crop, response, state]);

  const color = variableColor(response);

  const cropBars: BarDatum[] = model ? model.summaryRows.map((row) => ({
    id: row.crop,
    label: row.crop,
    value: numeric(row.recovery_days) ?? 0,
    color,
    note: `删失 ${numeric(row.censored) ?? 0}/${numeric(row.n_events) ?? 0}`,
  })) : [];

  const clusterBars: BarDatum[] = model ? model.cropEvents.map((row) => ({
    id: `${row.cluster}-${row.crop}-${row.response}`,
    label: `事件簇 ${row.cluster}`,
    value: numeric(row.recovery_days) ?? 0,
    color,
    muted: row.censored === 'True',
    note: row.censored === 'True' ? '删失（T+42 未恢复）' : '已恢复',
  })) : [];

  const medianDays = model ? median(model.recoveryDays) : null;
  const censoredRate = model && model.totalEvents > 0 ? model.censoredEvents / model.totalEvents : null;

  return (
    <ChartFrame
      title="暴雨后的恢复天数与删失"
      note={note ?? '恢复定义：去季节化 z 回到谷底的 90% 以上。T+42 未恢复记为删失。'}
      provenance="observed"
      sources={[summarySource.split('/').pop() ?? '', eventCropSource.split('/').pop() ?? '']}
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
      <AsyncBoundary state={state}>
        {() => (model && model.summaryRows.length > 0 ? (
          <>
            <p className="ag-label">各品种恢复天数（{response === 'price' ? '价格' : '成交量'}）</p>
            <BarChart
              ariaLabel={`${response === 'price' ? '价格' : '成交量'}各品种恢复天数`}
              data={cropBars}
              valueFormat={(value) => `${value.toFixed(1)} 天`}
              zeroLine={false}
            />

            <div className="readout-row">
              <div className="readout-row__item"><dt>中位恢复天数</dt><dd className="ag-number">{medianDays !== null ? `${medianDays.toFixed(1)} 天` : '—'}</dd></div>
              <div className="readout-row__item"><dt>删失事件数</dt><dd className="ag-number">{model.censoredEvents} / {model.totalEvents}</dd></div>
              <div className="readout-row__item"><dt>删失比例</dt><dd className="ag-number">{censoredRate !== null ? `${(censoredRate * 100).toFixed(1)}%` : '—'}</dd></div>
              <div className="readout-row__item"><dt>逐簇删失</dt><dd className="ag-number">{model.eventCensored} / {model.eventRows.length}</dd></div>
              <div className="readout-row__item"><dt>冲击最深</dt><dd className="ag-number">{model.deepest ? `${model.deepest.crop} ${model.deepest.shock.toFixed(2)}` : '—'}</dd></div>
            </div>

            {model.cropEvents.length > 0 && (
              <>
                <p className="ag-label">逐事件簇读数 · {crop}</p>
                <BarChart
                  ariaLabel={`${crop}${response === 'price' ? '价格' : '成交量'}逐事件簇恢复天数`}
                  data={clusterBars}
                  valueFormat={(value) => `${value.toFixed(1)} 天`}
                  zeroLine={false}
                />
              </>
            )}

            <p className="chart-frame__note">
              恢复天数中位 {medianDays !== null ? medianDays.toFixed(1) : '—'} 天，删失比例 {(censoredRate !== null ? (censoredRate * 100).toFixed(1) : '—')}%。
              恢复段常被后续事件打断、且存在右删失，因此恢复天数测不准，只作量级参考，不构造韧性指数；冲击最深为 {model.deepest ? `${model.deepest.crop} ${model.deepest.shock.toFixed(2)} z` : '—'}。
            </p>
          </>
        ) : <p className="ag-meta">没有可用的恢复天数数据。</p>)}
      </AsyncBoundary>
    </ChartFrame>
  );
}
