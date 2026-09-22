import { useMemo, useState } from 'react';
import { DATA_COLORS } from '../../../design/chartTokens';
import { AsyncBoundary } from '../../../components/AsyncState';
import type { EvidenceLevelCode } from '../../../domain/research/types';
import { numeric } from '../../../services/csv';
import { useTables } from '../data/useTable';
import { ChartFrame, XYChart, type XYSeries } from './primitives';
import { OptionSelector } from './Selectors';

/** 事件研究：事件前后偏移窗口内的平均响应，与安慰剂分布对照。 */
export function EventStudyChart({ curvesSource, summarySource, evidenceLevel, note }: {
  curvesSource: string;
  summarySource: string;
  evidenceLevel: EvidenceLevelCode;
  note?: string;
}) {
  const state = useTables([curvesSource, summarySource]);
  const [response, setResponse] = useState<'price' | 'volume'>('price');
  const [group, setGroup] = useState('');

  const model = useMemo(() => {
    if (state.status !== 'ready') return null;
    const [curves, summary] = state.data;
    const rows = curves.rows.filter((row) => row.response === response);
    const groups = [...new Set(rows.map((row) => row.group))];
    const activeGroup = group && groups.includes(group) ? group : groups[0] ?? '';
    const active = rows
      .filter((row) => row.group === activeGroup)
      .map((row) => ({
        offset: numeric(row.offset) ?? 0,
        mean: numeric(row.mean) ?? 0,
        ciLow: numeric(row.ci_low),
        ciHigh: numeric(row.ci_high),
        count: numeric(row.count),
      }))
      .sort((a, b) => a.offset - b.offset);
    const summaryRow = summary.rows.find((row) => row.response === response && row.group === activeGroup);
    return {
      groups,
      activeGroup,
      rows: active,
      summary: summaryRow ? {
        nClusters: numeric(summaryRow.n_clusters),
        postMean: numeric(summaryRow.post_mean),
        postCiLow: numeric(summaryRow.post_ci_low),
        postCiHigh: numeric(summaryRow.post_ci_high),
        trough: numeric(summaryRow.trough_offset),
        placeboP: numeric(summaryRow.placebo_p),
      } : null,
    };
  }, [group, response, state]);

  const series: XYSeries[] = model ? [{
    id: 'mean',
    label: '事件窗内的平均响应（z）',
    points: model.rows.map((row) => ({ x: row.offset, y: row.mean })),
    color: DATA_COLORS.extreme,
    dots: true,
  }] : [];
  const bands = model ? [{
    id: 'ci',
    upper: model.rows.filter((row) => row.ciHigh !== null).map((row) => ({ x: row.offset, y: row.ciHigh as number })),
    lower: model.rows.filter((row) => row.ciLow !== null).map((row) => ({ x: row.offset, y: row.ciLow as number })),
    color: DATA_COLORS.extreme,
  }] : [];
  const markers = [{ x: 0, label: '事件日', color: 'var(--ag-ink)' }];

  const bandCrossesZero = model ? model.rows.some((row) => row.ciLow !== null && row.ciHigh !== null && row.ciLow <= 0 && row.ciHigh >= 0) : false;

  return (
    <ChartFrame
      title="事件研究：事件前后响应"
      note={note ?? '横轴为相对事件日的偏移天数；阴影为 95% 区间。区间跨过零线表示与"无变化"不可区分。'}
      provenance="observed"
      sources={[curvesSource.split('/').pop() ?? '', summarySource.split('/').pop() ?? '']}
      evidenceLevel={`证据 ${evidenceLevel}`}
      controls={
        <>
          <OptionSelector
            label="目标变量"
            options={[{ id: 'price', label: '价格' }, { id: 'volume', label: '成交量' }]}
            value={response}
            onChange={(value) => setResponse(value as 'price' | 'volume')}
          />
          {model && model.groups.length > 1 && (
            <OptionSelector
              label="事件组"
              options={model.groups.map((entry) => ({ id: entry, label: entry }))}
              value={model.activeGroup}
              onChange={setGroup}
            />
          )}
        </>
      }
    >
      <AsyncBoundary state={state} label="正在读取事件研究曲线">
        {() => (model && model.rows.length > 0 ? (
          <>
            <XYChart
              ariaLabel="事件研究平均响应曲线"
              series={series}
              bands={bands}
              markers={markers}
              zeroLine
              xTickFormat={(value) => `${value > 0 ? '+' : ''}${value}d`}
              describeX={(value) => {
                const nearest = model.rows.reduce((a, b) => (Math.abs(b.offset - value) < Math.abs(a.offset - value) ? b : a));
                const ci = nearest.ciLow !== null && nearest.ciHigh !== null ? `，95% CI [${nearest.ciLow.toFixed(2)}, ${nearest.ciHigh.toFixed(2)}]` : '';
                return `事件${nearest.offset >= 0 ? '+' : ''}${nearest.offset} 天：均值 ${nearest.mean.toFixed(2)}${ci}`;
              }}
            />
            <div className="readout-row">
              <div className="readout-row__item"><dt>事件后均值</dt><dd className="ag-number">{model.summary?.postMean !== null && model.summary?.postMean !== undefined ? model.summary.postMean.toFixed(2) : '—'}</dd></div>
              <div className="readout-row__item"><dt>事后 95% 区间</dt><dd className="ag-number">{model.summary?.postCiLow !== null && model.summary?.postCiHigh !== null && model.summary?.postCiLow !== undefined && model.summary?.postCiHigh !== undefined ? `[${model.summary.postCiLow.toFixed(2)}, ${model.summary.postCiHigh.toFixed(2)}]` : '—'}</dd></div>
              <div className="readout-row__item"><dt>安慰剂 p</dt><dd className="ag-number">{model.summary?.placeboP !== null && model.summary?.placeboP !== undefined ? model.summary.placeboP.toFixed(3) : '—'}</dd></div>
              <div className="readout-row__item"><dt>事件簇数</dt><dd className="ag-number">{model.summary?.nClusters ?? '—'}</dd></div>
            </div>
            <p className="chart-frame__note">
              {bandCrossesZero
                ? '区间跨过零线：该事件后的平均响应与"没有变化"不可区分，且往往也落在安慰剂分布内。'
                : '区间整体偏离零线：需要结合安慰剂分布判断是否为事件特有。'}
            </p>
          </>
        ) : <p className="ag-meta">没有可用的事件研究曲线。</p>)}
      </AsyncBoundary>
    </ChartFrame>
  );
}
