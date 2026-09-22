import { useEffect, useMemo, useState } from 'react';
import { variableColor } from '../../../design/chartTokens';
import { AsyncBoundary } from '../../../components/AsyncState';
import type { EvidenceLevelCode } from '../../../domain/research/types';
import { numeric } from '../../../services/csv';
import { useResearchContextStore } from '../../insight/researchContextStore';
import { useTables } from '../data/useTable';
import { BarChart, ChartFrame, type BarDatum } from './primitives';
import { CropSelector, OptionSelector } from './Selectors';

type BinResponse = 'price' | 'volume';

interface Bin {
  label: string;
  nDays: number;
  meanZ: number;
  ciLow: number | null;
  ciHigh: number | null;
}

/**
 * C2 阈值分箱探索器。
 *
 * 阈值只在研究表真实给出的分箱之间切换，不做插值；
 * 每一步同时显示样本数量与区间，让用户看到"极值段几乎没有样本"这件事，
 * 而不是把拖动阈值变成"调到显著就得到结论"。
 */
export function ThresholdBinExplorer({ binsSource, powerSource, breakpointSource, crops, evidenceLevel }: {
  binsSource: string;
  powerSource: string | null;
  breakpointSource: string | null;
  crops: string[];
  evidenceLevel: EvidenceLevelCode;
}) {
  const sources = useMemo(() => [binsSource, powerSource, breakpointSource].filter((src): src is string => Boolean(src)), [binsSource, breakpointSource, powerSource]);
  const state = useTables(sources);
  const [crop, setCrop] = useState(crops[0] ?? '');
  const [response, setResponse] = useState<BinResponse>('price');
  const [binIndex, setBinIndex] = useState(0);
  const setSelection = useResearchContextStore((store) => store.setSelection);

  const model = useMemo(() => {
    if (state.status !== 'ready') return null;
    const byName = new Map(state.data.map((table) => [table.src.split('/').pop() ?? '', table]));
    const bins = (byName.get(binsSource.split('/').pop() ?? '')?.rows ?? [])
      .filter((row) => row.crop === crop && row.response === response)
      .map<Bin>((row) => ({
        label: row.bin_label,
        nDays: numeric(row.n_days) ?? 0,
        meanZ: numeric(row.mean_z) ?? 0,
        ciLow: numeric(row.ci_low),
        ciHigh: numeric(row.ci_high),
      }));
    const powerRow = (powerSource ? byName.get(powerSource.split('/').pop() ?? '')?.rows ?? [] : [])
      .find((row) => row.crop === crop && row.response === response) ?? null;
    const breakpointRows = breakpointSource ? byName.get(breakpointSource.split('/').pop() ?? '')?.rows ?? [] : [];
    const breakRow = breakpointRows.find((row) => row.crop === crop && row.response === response) ?? null;
    const breakCurrencies = [...new Set(breakpointRows.map((row) => `${row.crop}/${row.response}`))];
    return {
      bins,
      ar1: powerRow ? numeric(powerRow.ar1) : null,
      nEff: powerRow ? numeric(powerRow.n_eff) : null,
      nObs: powerRow ? numeric(powerRow.n_obs) : null,
      /** 研究表只在部分品种/响应上给出断点估计；缺失时如实说明，不用近似值补。 */
      breakpoint: breakRow ? {
        cHat: numeric(breakRow.c_hat),
        ciLow: numeric(breakRow.c_ci_low),
        ciHigh: numeric(breakRow.c_ci_high),
        ciWidthFrac: numeric(breakRow.ci_width_frac),
        pSupWald: numeric(breakRow.p_supwald),
        note: breakRow.note,
      } : null,
      breakpointCoverage: breakpointRows.length === 0
        ? '该研究点没有断点估计表'
        : `研究表仅在 ${breakCurrencies.join('、')} 上给出断点估计`,
    };
  }, [binsSource, breakpointSource, crop, powerSource, response, state]);

  const bins = model?.bins ?? [];
  const safeIndex = Math.min(binIndex, Math.max(0, bins.length - 1));
  const active = bins[safeIndex] ?? null;

  useEffect(() => {
    if (!active) return;
    setSelection({
      selectedCrop: crop,
      selectedVariable: response === 'price' ? '价格' : '成交量',
      selectedDateRangeOrWindow: `阈值档 ${active.label} mm`,
      currentFigure: '降雨阈值分箱与样本量',
    });
  }, [active, crop, response, setSelection]);

  const data: BarDatum[] = bins.map((bin, index) => ({
    id: bin.label,
    label: bin.label,
    value: bin.meanZ,
    color: variableColor(response),
    note: `n=${bin.nDays}`,
    muted: index !== safeIndex,
  }));

  const crossesZero = active ? active.ciLow !== null && active.ciHigh !== null && active.ciLow <= 0 && active.ciHigh >= 0 : null;

  return (
    <ChartFrame
      title="降雨阈值分箱与样本量"
      note="阈值档来自研究表的真实分箱，不做插值；每档同时给出样本数量与 95% 区间。"
      provenance="observed"
      sources={[binsSource.split('/').pop() ?? '', ...(powerSource ? [powerSource.split('/').pop() ?? ''] : [])]}
      evidenceLevel={`证据 ${evidenceLevel}`}
      controls={
        <>
          <CropSelector crops={crops} value={crop} onChange={(value) => { setCrop(value); setBinIndex(0); }} />
          <OptionSelector
            label="响应变量"
            options={[{ id: 'price', label: '价格' }, { id: 'volume', label: '成交量' }]}
            value={response}
            onChange={(value) => { setResponse(value as BinResponse); setBinIndex(0); }}
          />
          <div className="selector">
            <span className="selector__label">阈值档</span>
            <div className="scrubber">
              <span className="scrubber__bound ag-meta">{bins[0]?.label ?? '—'}</span>
              <input
                type="range"
                className="scrubber__input"
                min={0}
                max={Math.max(0, bins.length - 1)}
                step={1}
                value={safeIndex}
                onChange={(event) => setBinIndex(Number(event.target.value))}
                aria-label="阈值档"
                aria-valuetext={active ? `${active.label} 毫米，样本 ${active.nDays} 天` : '无数据'}
              />
              <span className="scrubber__bound ag-meta">{bins[bins.length - 1]?.label ?? '—'}</span>
              <output className="scrubber__value ag-number">{active ? `${active.label} mm` : '—'}</output>
            </div>
          </div>
        </>
      }
    >
      <AsyncBoundary state={state}>
        {() => (bins.length > 0 ? (
          <>
            <BarChart
              ariaLabel={`${crop}${response === 'price' ? '价格' : '成交量'}在不同降雨阈值档的平均偏离`}
              data={data}
              valueFormat={(value) => value.toFixed(3)}
            />
            <div className="readout-row">
              <div className="readout-row__item"><dt>阈值档</dt><dd className="ag-number">{active ? `${active.label} mm` : '—'}</dd></div>
              <div className="readout-row__item"><dt>样本天数</dt><dd className="ag-number">{active ? `${active.nDays} / ${model?.nObs ?? '—'}` : '—'}</dd></div>
              <div className="readout-row__item"><dt>平均偏离（z）</dt><dd className="ag-number">{active ? active.meanZ.toFixed(3) : '—'}</dd></div>
              <div className="readout-row__item">
                <dt>95% 区间</dt>
                <dd className="ag-number">{active && active.ciLow !== null && active.ciHigh !== null ? `[${active.ciLow.toFixed(3)}, ${active.ciHigh.toFixed(3)}]` : '—'}</dd>
              </div>
              <div className="readout-row__item"><dt>区间状态</dt><dd className="ag-number">{crossesZero === null ? '—' : crossesZero ? '跨过零线' : '不跨零线'}</dd></div>
            </div>

            <div className="readout-row">
              <div className="readout-row__item"><dt>序列 AR(1)</dt><dd className="ag-number">{model?.ar1 !== null && model?.ar1 !== undefined ? model.ar1.toFixed(4) : '—'}</dd></div>
              <div className="readout-row__item"><dt>有效样本量 n_eff</dt><dd className="ag-number">{model?.nEff !== null && model?.nEff !== undefined ? model.nEff.toFixed(1) : '—'}</dd></div>
              <div className="readout-row__item">
                <dt>断点估计 ĉ（mm）</dt>
                <dd className="ag-number">{model?.breakpoint?.cHat !== null && model?.breakpoint?.cHat !== undefined ? model.breakpoint.cHat.toFixed(1) : '未给出'}</dd>
              </div>
              <div className="readout-row__item">
                <dt>断点区间宽度占比</dt>
                <dd className="ag-number">{model?.breakpoint?.ciWidthFrac !== null && model?.breakpoint?.ciWidthFrac !== undefined ? model.breakpoint.ciWidthFrac.toFixed(3) : '未给出'}</dd>
              </div>
            </div>

            <p className="chart-frame__note">
              越往极端档走，样本天数越少（{bins[0]?.label} 档 {bins[0]?.nDays} 天，最高档 {bins[bins.length - 1]?.label} 档 {bins[bins.length - 1]?.nDays} 天）——
              显著与否主要由样本量决定，而不是由阈值位置决定。
              {model?.breakpoint?.note ? ` 研究表对该断点的标注：${model.breakpoint.note}。` : ` ${model?.breakpointCoverage ?? ''}，因此这两项在界面上显示为"未给出"。`}
              阈值是否可识别要看有效样本量：AR(1) 越高，六年数据携带的独立信息越少。
              因此这里不做"拖到显著"的交互，只把稳定性摆在旁边。
            </p>
          </>
        ) : <p className="ag-meta">该品种与响应变量没有可用的阈值分箱数据。</p>)}
      </AsyncBoundary>
    </ChartFrame>
  );
}
