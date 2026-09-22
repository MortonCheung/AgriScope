import { useMemo, useState } from 'react';
import { DATA_COLORS } from '../../../design/chartTokens';
import { AsyncBoundary } from '../../../components/AsyncState';
import type { EvidenceLevelCode } from '../../../domain/research/types';
import { numeric } from '../../../services/csv';
import { useTable } from '../data/useTable';
import { ChartFrame, XYChart, type XYSeries } from './primitives';
import { CropSelector } from './Selectors';

/** 量价领先/滞后结构：同一品种在 k=−14..+14 上的系数。 */
export function LeadLagChart({ crops, source, evidenceLevel, note }: {
  crops: string[];
  source: string;
  evidenceLevel: EvidenceLevelCode;
  note?: string;
}) {
  const state = useTable(source);
  const [crop, setCrop] = useState(crops[0] ?? '');

  const rows = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.data.rows
      .filter((row) => row.crop === crop)
      .map((row) => ({
        k: numeric(row.lead_k) ?? 0,
        effect: numeric(row.effect) ?? 0,
        ciLow: numeric(row.ci_low),
        ciHigh: numeric(row.ci_high),
        fdr: numeric(row.fdr_p),
        direction: row.direction,
      }))
      .sort((a, b) => a.k - b.k);
  }, [crop, state]);

  const series: XYSeries[] = rows.length > 0 ? [{
    id: 'effect',
    label: '量价系数（z 口径）',
    points: rows.map((row) => ({ x: row.k, y: row.effect })),
    color: DATA_COLORS.volume,
    dots: true,
  }] : [];
  const bands = rows.length > 0 ? [{
    id: 'ci',
    upper: rows.filter((row) => row.ciHigh !== null).map((row) => ({ x: row.k, y: row.ciHigh as number })),
    lower: rows.filter((row) => row.ciLow !== null).map((row) => ({ x: row.k, y: row.ciLow as number })),
    color: DATA_COLORS.volume,
  }] : [];
  const sameDay = rows.find((row) => row.k === 0);
  const sigCount = rows.filter((row) => row.fdr !== null && row.fdr < 0.05).length;

  return (
    <ChartFrame
      title="量价同日的领先 / 滞后结构"
      note={note ?? 'k=0 为同日；负 k 表示成交量领先价格，正 k 表示价格领先成交量。剖面平坦意味着领先方向不可识别。'}
      provenance="observed"
      sources={[source.split('/').pop() ?? '']}
      evidenceLevel={`证据 ${evidenceLevel}`}
      controls={<CropSelector crops={crops} value={crop} onChange={setCrop} />}
    >
      <AsyncBoundary state={state} label="正在读取量价领先滞后表">
        {() => (rows.length > 0 ? (
          <>
            <XYChart
              ariaLabel={`${crop}量价领先滞后系数`}
              series={series}
              bands={bands}
              markers={[{ x: 0, label: '同日', color: 'var(--ag-ink)' }]}
              zeroLine
              xTickFormat={(value) => (value > 0 ? `+${value}` : String(value))}
              describeX={(value) => {
                const nearest = rows.reduce((a, b) => (Math.abs(b.k - value) < Math.abs(a.k - value) ? b : a));
                const ci = nearest.ciLow !== null && nearest.ciHigh !== null ? `，95% CI [${nearest.ciLow.toFixed(3)}, ${nearest.ciHigh.toFixed(3)}]` : '';
                return `k=${nearest.k}：系数 ${nearest.effect.toFixed(3)}${ci}`;
              }}
            />
            <div className="readout-row">
              <div className="readout-row__item"><dt>同日系数 (k=0)</dt><dd className="ag-number">{sameDay ? sameDay.effect.toFixed(3) : '—'}</dd></div>
              <div className="readout-row__item"><dt>同日 95% 区间</dt><dd className="ag-number">{sameDay && sameDay.ciLow !== null && sameDay.ciHigh !== null ? `[${sameDay.ciLow.toFixed(3)}, ${sameDay.ciHigh.toFixed(3)}]` : '—'}</dd></div>
              <div className="readout-row__item"><dt>FDR 显著 lag 数</dt><dd className="ag-number">{sigCount}</dd></div>
            </div>
            <p className="chart-frame__note">
              同日系数为负说明"到货少的日子价格偏高"；但剖面在跨日方向上基本平坦，
              因此这是一个共变事实，不是"谁先动"的因果证据，也不等于市场韧性。
            </p>
          </>
        ) : <p className="ag-meta">该品种没有可用的量价滞后数据。</p>)}
      </AsyncBoundary>
    </ChartFrame>
  );
}
