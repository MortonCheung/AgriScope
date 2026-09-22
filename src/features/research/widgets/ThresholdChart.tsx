import { useMemo, useState } from 'react';
import { variableColor } from '../../../design/chartTokens';
import { AsyncBoundary } from '../../../components/AsyncState';
import type { EvidenceLevelCode } from '../../../domain/research/types';
import { numeric } from '../../../services/csv';
import { useTables } from '../data/useTable';
import { BarChart, ChartFrame, type BarDatum } from './primitives';
import { CropSelector, OptionSelector } from './Selectors';

type Response = 'price' | 'volume';

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function pct(value: number | null, digits = 3): string {
  return value === null ? '—' : value.toFixed(digits);
}

/**
 * C2：非线性检验与阈值可识别性。
 * 曲线与显著性完全来自研究表；界面不提供"拖动阈值"的交互，避免暗示通过调参数可以得到显著结论。
 */
export function ThresholdChart({
  crops, gamSource, powerSource, evidenceLevel, note,
}: {
  crops: string[];
  gamSource: string;
  powerSource: string;
  evidenceLevel: EvidenceLevelCode;
  note?: string;
}) {
  const state = useTables([gamSource, powerSource]);
  const [response, setResponse] = useState<Response>('price');
  const [crop, setCrop] = useState(crops[0] ?? '');
  const [hazard, setHazard] = useState('');

  const model = useMemo(() => {
    if (state.status !== 'ready') return null;
    const [gam, power] = state.data;
    const rows = gam.rows.filter((row) => row.crop === crop && row.response === response);
    const activeHazard = hazard && rows.some((row) => row.hazard_key === hazard) ? hazard : rows[0]?.hazard_key ?? '';
    const active = rows.find((row) => row.hazard_key === activeHazard) ?? null;
    const powerRow = power.rows.find((row) => row.crop === crop && row.response === response) ?? null;
    const sigCount = gam.rows.filter((row) => { const value = numeric(row.fdr_p); return value !== null && value < 0.05; }).length;
    const minFdr = gam.rows.reduce<number | null>((best, row) => {
      const value = numeric(row.fdr_p);
      if (value === null) return best;
      return best === null || value < best ? value : best;
    }, null);
    const forResponse = (target: Response) => power.rows.filter((row) => row.response === target);
    const ar1Median = (target: Response) => median(forResponse(target).map((row) => numeric(row.ar1)).filter((value): value is number => value !== null));
    const nEffMedian = (target: Response) => median(forResponse(target).map((row) => numeric(row.n_eff)).filter((value): value is number => value !== null));
    return {
      rows,
      activeHazard,
      active,
      powerRow,
      sigCount,
      total: gam.rows.length,
      minFdr,
      priceAr1: ar1Median('price'),
      priceNeff: nEffMedian('price'),
      volumeAr1: ar1Median('volume'),
      volumeNeff: nEffMedian('volume'),
    };
  }, [crop, hazard, response, state]);

  const bars: BarDatum[] = model ? model.rows.map((row) => ({
    id: row.hazard_key,
    label: row.hazard_label || row.hazard_key,
    value: numeric(row.wald_F) ?? 0,
    color: variableColor(row.hazard_key),
    note: `FDR p=${pct(numeric(row.fdr_p))}`,
  })) : [];

  const ar1 = response === 'price' ? model?.priceAr1 ?? null : model?.volumeAr1 ?? null;
  const neff = response === 'price' ? model?.priceNeff ?? null : model?.volumeNeff ?? null;
  const activeFdr = model?.active ? numeric(model.active.fdr_p) : null;

  return (
    <ChartFrame
      title="降雨风险阈值的非线性检验"
      note={note ?? '横轴为暴露变量（降水/气温/VPD/土壤水分），纵轴为自然样条对线性的 Wald-F 统计量。所有变量经 FDR 校正后均不显著，说明观测不到稳定的非线性拐点。'}
      provenance="observed"
      sources={[gamSource.split('/').pop() ?? '', powerSource.split('/').pop() ?? '']}
      evidenceLevel={`证据 ${evidenceLevel}`}
      controls={
        <>
          <CropSelector crops={crops} value={crop} onChange={setCrop} />
          <OptionSelector<Response>
            label="响应变量"
            options={[{ id: 'price', label: '价格' }, { id: 'volume', label: '成交量' }]}
            value={response}
            onChange={setResponse}
          />
          {model && model.rows.length > 1 && (
            <OptionSelector
              label="暴露变量"
              options={model.rows.map((row) => ({ id: row.hazard_key, label: row.hazard_label || row.hazard_key }))}
              value={model.activeHazard}
              onChange={setHazard}
            />
          )}
        </>
      }
    >
      <AsyncBoundary state={state} label="正在读取非线性检验表">
        {() => (model && model.rows.length > 0 ? (
          <>
            <BarChart
              ariaLabel={`${crop}${response === 'price' ? '价格' : '成交量'}各暴露变量的非线性 Wald-F`}
              data={bars}
              valueFormat={(value) => value.toFixed(2)}
              zeroLine={false}
              onSelect={setHazard}
              selectedId={model.activeHazard}
            />
            <div className="readout-row">
              <div className="readout-row__item"><dt>样本量 n</dt><dd className="ag-number">{model.active?.n ?? '—'}</dd></div>
              <div className="readout-row__item"><dt>GAM 有效自由度</dt><dd className="ag-number">{pct(model.active ? numeric(model.active.gam_edof) : null)}</dd></div>
              <div className="readout-row__item"><dt>GAM R²</dt><dd className="ag-number">{pct(model.active ? numeric(model.active.gam_r2) : null, 4)}</dd></div>
              <div className="readout-row__item"><dt>偏依赖值域</dt><dd className="ag-number">{pct(model.active ? numeric(model.active.pd_range_z) : null)}</dd></div>
              <div className="readout-row__item"><dt>线性效应</dt><dd className="ag-number">{pct(model.active ? numeric(model.active.linear_effect) : null, 4)}</dd></div>
              <div className="readout-row__item"><dt>该暴露 FDR p</dt><dd className="ag-number">{pct(activeFdr)}</dd></div>
              <div className="readout-row__item"><dt>该暴露证据等级</dt><dd className="ag-number">{model.active?.evidence_level || '—'}</dd></div>
            </div>
            <div className="readout-row">
              <div className="readout-row__item"><dt>序列自相关 AR(1)</dt><dd className="ag-number">{pct(ar1)}</dd></div>
              <div className="readout-row__item"><dt>有效样本量 n_eff</dt><dd className="ag-number">{pct(neff, 1)}</dd></div>
              <div className="readout-row__item"><dt>原始观测 n_obs</dt><dd className="ag-number">{model.powerRow?.n_obs ?? '—'}</dd></div>
              <div className="readout-row__item"><dt>全家族 FDR 显著</dt><dd className="ag-number">{model.sigCount} / {model.total}</dd></div>
              <div className="readout-row__item"><dt>最小 FDR p</dt><dd className="ag-number">{pct(model.minFdr)}</dd></div>
            </div>
            <p className="chart-frame__note">
              全家族 {model.total} 个检验经 FDR 校正后显著 {model.sigCount} 个。价格与成交量序列自相关很高（价格 AR(1) 中位 {pct(model.priceAr1)}、n_eff 中位 {model.priceNeff !== null ? model.priceNeff.toFixed(1) : '—'}；
              成交量 AR(1) 中位 {pct(model.volumeAr1)}、n_eff 中位 {model.volumeNeff !== null ? model.volumeNeff.toFixed(1) : '—'}），
              极端降水段样本极少，因此阈值受样本量硬约束，不可识别。这是样本量问题，不是"调一调临界点"就能得到显著结论的问题。
            </p>
          </>
        ) : <p className="ag-meta">该品种没有可用的非线性检验数据。</p>)}
      </AsyncBoundary>
    </ChartFrame>
  );
}
