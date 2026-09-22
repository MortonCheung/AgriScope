import { useMemo, useState } from 'react';
import { DATA_COLORS } from '../../../design/chartTokens';
import { AsyncBoundary } from '../../../components/AsyncState';
import type { EvidenceLevelCode } from '../../../domain/research/types';
import { numeric } from '../../../services/csv';
import { useTables } from '../data/useTable';
import { BarChart, ChartFrame, type BarDatum } from './primitives';
import { OptionSelector } from './Selectors';

type Target = 'price' | 'volume';

const FEATURE_LABELS: Record<string, string> = {
  F_wx: '仅天气（F_wx）',
  F_lag: '含自回归（F_lag）',
  F_now: '含当日（F_now）',
};

const KIND_LABELS: Record<string, string> = {
  hist: '历史口径',
  strict: '严格口径',
};

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function fmt(value: number | null, digits = 3): string {
  return value === null ? '—' : value.toFixed(digits);
}

/**
 * C6：模型 R² 对比与 SHAP 贡献结构。
 * R² 与 SHAP 均为样本外统计表现，界面明确区分天气特征与非天气特征，并提示相关性不等于因果。
 */
export function ModelChart({
  metricsSource, shapSource, baselineSource, evidenceLevel, note,
}: {
  metricsSource: string;
  shapSource: string;
  baselineSource: string;
  evidenceLevel: EvidenceLevelCode;
  note?: string;
}) {
  const state = useTables([metricsSource, shapSource, baselineSource]);
  const [target, setTarget] = useState<Target>('price');
  const [featureSet, setFeatureSet] = useState('');
  const [targetKind, setTargetKind] = useState('');

  const model = useMemo(() => {
    if (state.status !== 'ready') return null;
    const [metrics, shap, baseline] = state.data;
    const kinds = unique(metrics.rows.map((row) => row.target_kind));
    const featureSets = unique(metrics.rows.map((row) => row.feature_set));
    const activeKind = targetKind && kinds.includes(targetKind) ? targetKind : kinds[0] ?? '';
    const activeFeature = featureSet && featureSets.includes(featureSet) ? featureSet : featureSets[0] ?? '';
    const splits = unique(metrics.rows.map((row) => row.split));
    const activeSplit = splits.includes('valid') ? 'valid' : splits[0] ?? '';
    const metricRows = metrics.rows.filter((row) => (
      row.target_kind === activeKind && row.target === target && row.feature_set === activeFeature
      && row.split === activeSplit && row.stratum === 'overall'
    ));
    const shapRows = shap.rows
      .filter((row) => row.target === target && row.feature_set === activeFeature)
      .sort((a, b) => (numeric(a.rank) ?? 0) - (numeric(b.rank) ?? 0));
    const baselineRows = baseline.rows.filter((row) => row.target === target && row.feature_set === activeFeature);
    const weatherShare = shapRows.reduce((total, row) => (row.is_weather === 'True' ? total + (numeric(row.share_of_total) ?? 0) : total), 0);
    const persistence = metricRows.find((row) => row.model === 'baseline_persistence') ?? null;
    const weatherModels = metricRows.filter((row) => ['elasticnet', 'gam', 'lightgbm'].includes(row.model));
    const weatherModelsAllNegative = weatherModels.length > 0 && weatherModels.every((row) => (numeric(row.r2) ?? 0) < 0);
    const bestBaseline = baselineRows[0]?.best_baseline ?? '';
    const beatsCount = baselineRows.filter((row) => row.beats_baseline === 'True').length;
    const complexBeatsCount = baselineRows.filter((row) => row.complex_beats_simple === 'True').length;
    return {
      kinds, featureSets, activeKind, activeFeature, activeSplit, metricRows, shapRows, baselineRows,
      weatherShare, persistence, weatherModelsAllNegative, bestBaseline, beatsCount, complexBeatsCount,
    };
  }, [featureSet, state, target, targetKind]);

  const r2Bars: BarDatum[] = model ? model.metricRows.map((row) => ({
    id: row.model,
    label: row.model,
    value: numeric(row.r2) ?? 0,
    color: row.model.startsWith('baseline_') ? DATA_COLORS.null : DATA_COLORS.model,
    note: `RMSE ${fmt(numeric(row.rmse))}`,
  })) : [];

  const shapBars: BarDatum[] = model ? model.shapRows.slice(0, 12).map((row) => ({
    id: `${row.feature}`,
    label: row.feature,
    value: numeric(row.share_of_total) ?? 0,
    color: row.is_weather === 'True' ? DATA_COLORS.rain : DATA_COLORS.model,
    note: `#${row.rank}${row.is_weather === 'True' ? ' · 天气' : ' · 非天气'}`,
  })) : [];

  const baselineBars: BarDatum[] = model ? model.baselineRows.map((row) => ({
    id: row.model,
    label: row.model,
    value: numeric(row.rmse_test) ?? 0,
    color: row.model === model.bestBaseline ? DATA_COLORS.extreme : DATA_COLORS.model,
    note: `R² ${fmt(numeric(row.r2_test))}`,
  })) : [];

  const topFeature = model?.shapRows[0] ?? null;

  return (
    <ChartFrame
      title="模型 R² 与 SHAP 贡献结构"
      note={note ?? 'R² 为样本外（验证集）统计表现。切换目标与特征口径，可以看到“只用天气”的模型并没有预测力，而“照抄昨日值”的持续性基线最强。'}
      provenance="model"
      sources={[metricsSource.split('/').pop() ?? '', shapSource.split('/').pop() ?? '', baselineSource.split('/').pop() ?? '']}
      evidenceLevel={`证据 ${evidenceLevel}`}
      controls={
        <>
          <OptionSelector<Target>
            label="目标"
            options={[{ id: 'price', label: '价格' }, { id: 'volume', label: '成交量' }]}
            value={target}
            onChange={setTarget}
          />
          {model && model.featureSets.length > 1 && (
            <OptionSelector
              label="特征口径"
              options={model.featureSets.map((entry) => ({ id: entry, label: FEATURE_LABELS[entry] ?? entry }))}
              value={model.activeFeature}
              onChange={setFeatureSet}
            />
          )}
          {model && model.kinds.length > 1 && (
            <OptionSelector
              label="样本口径"
              options={model.kinds.map((entry) => ({ id: entry, label: KIND_LABELS[entry] ?? entry }))}
              value={model.activeKind}
              onChange={setTargetKind}
            />
          )}
        </>
      }
    >
      <AsyncBoundary state={state} label="正在读取模型评价表">
        {() => (model && model.metricRows.length > 0 ? (
          <>
            <p className="ag-label">各模型样本外 R²（{model.activeSplit} · overall）</p>
            <BarChart
              ariaLabel={`${target === 'price' ? '价格' : '成交量'}各模型样本外 R²`}
              data={r2Bars}
              valueFormat={(value) => value.toFixed(3)}
              zeroLine
            />
            <div className="readout-row">
              <div className="readout-row__item"><dt>持续性基线 R²</dt><dd className="ag-number">{fmt(model.persistence ? numeric(model.persistence.r2) : null)}</dd></div>
              <div className="readout-row__item"><dt>仅天气模型 R² 全为负</dt><dd className="ag-number">{model.weatherModelsAllNegative ? '是' : '否'}</dd></div>
              <div className="readout-row__item"><dt>天气特征 SHAP 合计</dt><dd className="ag-number">{`${(model.weatherShare * 100).toFixed(2)}%`}</dd></div>
              <div className="readout-row__item"><dt>非天气特征合计</dt><dd className="ag-number">{`${((1 - model.weatherShare) * 100).toFixed(2)}%`}</dd></div>
              <div className="readout-row__item"><dt>SHAP 首位特征</dt><dd className="ag-number">{topFeature ? `${topFeature.feature}${topFeature.is_weather === 'True' ? '（天气）' : '（非天气）'}` : '—'}</dd></div>
            </div>

            <p className="ag-label">特征贡献占比（SHAP · share of total）</p>
            <BarChart
              ariaLabel={`${target === 'price' ? '价格' : '成交量'}特征 SHAP 贡献占比`}
              data={shapBars}
              valueFormat={(value) => `${(value * 100).toFixed(2)}%`}
              zeroLine={false}
            />

            <p className="ag-label">与简单基线的测试集 RMSE 对比</p>
            <BarChart
              ariaLabel="测试集 RMSE 对比"
              data={baselineBars}
              valueFormat={(value) => value.toFixed(3)}
              zeroLine={false}
            />
            <div className="readout-row">
              <div className="readout-row__item"><dt>最优基线</dt><dd className="ag-number">{model.bestBaseline || '—'}</dd></div>
              <div className="readout-row__item"><dt>优于基线的模型数</dt><dd className="ag-number">{model.beatsCount} / {model.baselineRows.length}</dd></div>
              <div className="readout-row__item"><dt>复杂优于简单</dt><dd className="ag-number">{model.complexBeatsCount} / {model.baselineRows.length}</dd></div>
            </div>

            <p className="chart-frame__note">
              {model.weatherModelsAllNegative
                ? '仅天气口径下，真正使用天气的模型 R² 全为负——比“什么都别预测”还差；而“照抄昨日值”的持续性基线 R² 很高。'
                : '当前口径下请对照持续性基线读数判断天气是否带来增量。'}
              SHAP 首位是{topFeature ? `“${topFeature.feature}”` : '自回归特征'}，天气特征合计占比约 {(model.weatherShare * 100).toFixed(1)}%——可预测性几乎全部来自序列持续性。
              SHAP 重要性只说明模型如何使用特征，不等于因果作用。
            </p>
          </>
        ) : <p className="ag-meta">当前选择没有可用的模型评价数据。</p>)}
      </AsyncBoundary>
    </ChartFrame>
  );
}
