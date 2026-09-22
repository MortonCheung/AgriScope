import { useMemo, useState } from 'react';
import { variableColor } from '../../../design/chartTokens';
import { AsyncBoundary } from '../../../components/AsyncState';
import type { EvidenceLevelCode } from '../../../domain/research/types';
import { numeric } from '../../../services/csv';
import { useTables } from '../data/useTable';
import { Case2026Chart } from './Case2026Chart';
import { ModelChart } from './ModelChart';
import { ResilienceChart } from './ResilienceChart';
import { ScenarioChart } from './ScenarioChart';
import { ThresholdChart } from './ThresholdChart';
import { TransmissionChart } from './TransmissionChart';
import { BarChart, ChartFrame, type BarDatum } from './primitives';
import { CropSelector, OptionSelector } from './Selectors';
import type { ModuleContext, ResearchModuleRender } from './registry';

type Response = 'price' | 'volume';

function windowDays(code: string): number {
  const match = code.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

/**
 * C1：降水窗口对比。
 * 窗口越大峰值效应看起来越强，但换算成每毫米口径反而递减，说明梯度来自累积量的标准差放大。
 */
function PrecipWindowChart({
  crops, comparisonSource, summarySource, evidenceLevel,
}: {
  crops: string[];
  comparisonSource: string;
  summarySource: string;
  evidenceLevel: EvidenceLevelCode;
}) {
  const state = useTables([comparisonSource, summarySource]);
  const [response, setResponse] = useState<Response>('price');
  const [crop, setCrop] = useState(crops[0] ?? '');

  const model = useMemo(() => {
    if (state.status !== 'ready') return null;
    const [comparison, summary] = state.data;
    const summaryRows = summary.rows
      .filter((row) => row.response === response)
      .map((row) => ({
        window: row.window,
        days: windowDays(row.window),
        label: row.window_label,
        meanPeakEffect: numeric(row.mean_peak_effect),
        meanMaxAbsEffect: numeric(row.mean_max_abs_effect),
        nCrops: numeric(row.n_crops),
        nCropsSig: numeric(row.n_crops_fdr_sig),
        minFdrP: numeric(row.min_fdr_p),
        nLagSigTotal: numeric(row.n_lag_fdr_sig_total),
        signPositive: numeric(row.sign_positive),
      }))
      .sort((a, b) => a.days - b.days);
    const sdByWindow = new Map<string, number>();
    for (const row of comparison.rows) {
      const sd = numeric(row.sd_mm);
      if (sd !== null && !sdByWindow.has(row.window)) sdByWindow.set(row.window, sd);
    }
    const cropRows = comparison.rows
      .filter((row) => row.crop === crop && row.response === response)
      .map((row) => ({
        window: row.window,
        days: windowDays(row.window),
        label: row.window_label,
        peakEffect: numeric(row.peak_effect),
        peakCiLow: numeric(row.peak_ci_low),
        peakCiHigh: numeric(row.peak_ci_high),
        peakFdrP: numeric(row.peak_fdr_p),
        nLagSigWithin: numeric(row.n_lag_fdr_sig_within),
      }))
      .sort((a, b) => a.days - b.days);
    const totalCropsSig = summaryRows.reduce((total, row) => total + (row.nCropsSig ?? 0), 0);
    const totalLagSig = summaryRows.reduce((total, row) => total + (row.nLagSigTotal ?? 0), 0);
    return { summaryRows, sdByWindow, cropRows, totalCropsSig, totalLagSig };
  }, [crop, response, state]);

  const meanEffectBars: BarDatum[] = model ? model.summaryRows.map((row) => ({
    id: row.window,
    label: `${row.label} 窗口`,
    value: row.meanPeakEffect ?? 0,
    color: variableColor('precip'),
    note: `FDR 显著 ${row.nCropsSig ?? 0}/${row.nCrops ?? 0}`,
  })) : [];

  const perMmBars: BarDatum[] = model ? model.summaryRows.map((row) => {
    const sd = model.sdByWindow.get(row.window) ?? null;
    const value = sd && row.meanPeakEffect !== null ? row.meanPeakEffect / sd : 0;
    return {
      id: row.window,
      label: `${row.label} 窗口`,
      value,
      color: variableColor(response),
      note: sd !== null ? `sd=${sd.toFixed(1)}mm` : '',
    };
  }) : [];

  const perCropBars: BarDatum[] = model ? model.cropRows.map((row) => ({
    id: row.window,
    label: `${row.label} 窗口`,
    value: row.peakEffect ?? 0,
    color: variableColor(response),
    note: `FDR p=${row.peakFdrP !== null ? row.peakFdrP.toFixed(3) : '—'}`,
  })) : [];

  return (
    <ChartFrame
      title="降水窗口对比：累积脉冲与每毫米口径"
      note="每 1 SD 的峰值效应会随窗口变大，但那是因为累积量的标准差随窗口放大；换算成每毫米口径反而递减。全部窗口均无品种通过 FDR。"
      provenance="observed"
      sources={[comparisonSource.split('/').pop() ?? '', summarySource.split('/').pop() ?? '']}
      evidenceLevel={`证据 ${evidenceLevel}`}
      controls={
        <>
          <OptionSelector<Response>
            label="响应变量"
            options={[{ id: 'price', label: '价格' }, { id: 'volume', label: '成交量' }]}
            value={response}
            onChange={setResponse}
          />
          <CropSelector crops={crops} value={crop} onChange={setCrop} />
        </>
      }
    >
      <AsyncBoundary state={state} label="正在读取降水窗口研究表">
        {() => (model && model.summaryRows.length > 0 ? (
          <>
            <p className="ag-label">各窗口平均峰值效应（每 1 SD）</p>
            <BarChart
              ariaLabel={`${response === 'price' ? '价格' : '成交量'}各降水窗口平均峰值效应`}
              data={meanEffectBars}
              valueFormat={(value) => value.toFixed(4)}
              zeroLine
            />

            <p className="ag-label">每毫米口径（平均峰值效应 ÷ 该窗口 sd_mm）</p>
            <BarChart
              ariaLabel="各窗口每毫米口径效应"
              data={perMmBars}
              valueFormat={(value) => value.toFixed(4)}
              zeroLine
            />

            <div className="readout-row">
              <div className="readout-row__item"><dt>全窗口 FDR 显著品种</dt><dd className="ag-number">{model.totalCropsSig}</dd></div>
              <div className="readout-row__item"><dt>全窗口显著 lag 总数</dt><dd className="ag-number">{model.totalLagSig}</dd></div>
              <div className="readout-row__item"><dt>最小 FDR p</dt><dd className="ag-number">{model.summaryRows.reduce<number | null>((best, row) => (row.minFdrP !== null && (best === null || row.minFdrP < best) ? row.minFdrP : best), null)?.toFixed(3) ?? '—'}</dd></div>
            </div>

            <p className="ag-label">当前品种各窗口峰值效应 · {crop}</p>
            <BarChart
              ariaLabel={`${crop}${response === 'price' ? '价格' : '成交量'}各窗口峰值效应`}
              data={perCropBars}
              valueFormat={(value) => value.toFixed(4)}
              zeroLine
            />

            <p className="chart-frame__note">
              累积窗口梯度是尺度假象：窗口越大，每 1 SD 口径的峰值效应越强，但每毫米口径反而递减，且 5 个窗口全部 0 品种通过 FDR。
              这既不支持「累积降雨比单日降雨更重要」，也不提供任何预警窗口优先级。
            </p>
          </>
        ) : <p className="ag-meta">没有可用的降水窗口数据。</p>)}
      </AsyncBoundary>
    </ChartFrame>
  );
}

export function buildCModules(ctx: ModuleContext): ResearchModuleRender[] {
  switch (ctx.point.id) {
    case 'C1': {
      const comparison = ctx.table('precip_window_comparison.csv');
      const summary = ctx.table('precip_window_summary.csv');
      if (!comparison || !summary) return [];
      return [{
        id: 'precip-window',
        title: '降水窗口对比',
        note: '把 1/3/5/7/14 天累积降雨窗口并排比较，确认"累积窗口梯度"来自尺度假象。',
        node: <PrecipWindowChart crops={ctx.crops} comparisonSource={comparison} summarySource={summary} evidenceLevel={ctx.point.evidenceLevel} />,
      }];
    }
    case 'C2': {
      const gam = ctx.table('threshold_gam_scan.csv');
      const power = ctx.table('threshold_power.csv');
      if (!gam || !power) return [];
      return [{
        id: 'threshold',
        title: '阈值非线性检验与可识别性',
        note: '展示各品种的非线性检验结果与序列有效样本量读数；阈值是否可识别由样本量决定。',
        node: <ThresholdChart crops={ctx.crops} gamSource={gam} powerSource={power} evidenceLevel={ctx.point.evidenceLevel} />,
      }];
    }
    case 'C3': {
      const summary = ctx.table('case2026_summary.csv');
      const vsHistory = ctx.table('case2026_vs_history.csv');
      const percrop = ctx.table('case2026_vs_history_percrop.csv');
      if (!summary || !vsHistory || !percrop) return [];
      const weather = ctx.table('case2026_weather.csv');
      return [{
        id: 'case2026',
        title: '2026 案例：事后均值与历史区间',
        note: '把案例事后均值与历史同期区间并列，标注各品种是否落在历史区间内。',
        node: (
          <Case2026Chart
            crops={ctx.crops}
            summarySource={summary}
            vsHistorySource={vsHistory}
            percropSource={percrop}
            weatherSource={weather}
            evidenceLevel={ctx.point.evidenceLevel}
          />
        ),
      }];
    }
    case 'C4': {
      const stage1 = ctx.table('transmission_stage1.csv');
      const stage2 = ctx.table('transmission_stage2.csv');
      const mediation = ctx.table('transmission_mediation.csv');
      if (!stage1 || !stage2 || !mediation) return [];
      return [{
        id: 'transmission',
        title: '两环链式传导',
        note: '第一环（天气→成交量）与第二环（成交量→价格）分段对比，并统计中介效应区间跨零个数。',
        node: <TransmissionChart crops={ctx.crops} stage1Source={stage1} stage2Source={stage2} mediationSource={mediation} evidenceLevel={ctx.point.evidenceLevel} />,
      }];
    }
    case 'C5': {
      const summary = ctx.table('resilience_summary.csv');
      const eventCrop = ctx.table('resilience_event_crop.csv');
      if (!summary || !eventCrop) return [];
      return [{
        id: 'resilience',
        title: '恢复天数分布与删失',
        note: '展示恢复天数分布与删失比例；恢复量级仅作参考，不构造韧性指数。',
        node: <ResilienceChart crops={ctx.crops} summarySource={summary} eventCropSource={eventCrop} evidenceLevel={ctx.point.evidenceLevel} />,
      }];
    }
    case 'C6': {
      const metrics = ctx.table('model_metrics_overall.csv');
      const shap = ctx.table('model_shap_importance.csv');
      const baseline = ctx.table('model_baseline_comparison.csv');
      if (!metrics || !shap || !baseline) return [];
      return [{
        id: 'model',
        title: '预测表现与特征贡献',
        note: 'R² 对比与 SHAP 贡献占比，区分天气特征与自回归持续性特征。',
        node: <ModelChart metricsSource={metrics} shapSource={shap} baselineSource={baseline} evidenceLevel={ctx.point.evidenceLevel} />,
      }];
    }
    case 'C7': {
      const gate = ctx.table('counterfactual_gate.csv');
      const severity = ctx.table('counterfactual_severity.csv');
      const buffer = ctx.table('counterfactual_buffer.csv');
      const gapSummary = ctx.table('counterfactual_gap_summary.csv');
      if (!gate || !severity || !buffer || !gapSummary) return [];
      return [{
        id: 'counterfactual',
        title: '反事实情景（实验性）',
        note: '先展示 World0 门控结果，门控未通过时所有情景数字只作演示。',
        node: <ScenarioChart gateSource={gate} severitySource={severity} bufferSource={buffer} gapSummarySource={gapSummary} evidenceLevel={ctx.point.evidenceLevel} />,
      }];
    }
    default:
      return [];
  }
}
