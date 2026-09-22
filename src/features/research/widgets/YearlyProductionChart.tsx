import { useMemo, useState } from 'react';
import { CROP_SERIES, CHART_TOKENS } from '../../../design/chartTokens';
import { AsyncBoundary } from '../../../components/AsyncState';
import type { EvidenceLevelCode } from '../../../domain/research/types';
import { numeric } from '../../../services/csv';
import { useTables } from '../data/useTable';
import { ChartFrame, XYChart, type XYSeries } from './primitives';
import { CropSelector, OptionSelector } from './Selectors';

type Metric = 'production_ton' | 'planting_area_kha' | 'yield_kg_per_ha';

const METRIC_LABEL: Record<Metric, string> = {
  production_ton: '产量（吨）',
  planting_area_kha: '播种面积（千公顷）',
  yield_kg_per_ha: '单产（公斤/公顷）',
};

const PRODUCTION_LABEL: Record<string, string> = {
  production_ton: '产量',
  yield_kg_per_ha: '单产',
};

const WEATHER_LABEL: Record<string, string> = {
  season_precip_mm: '生长季降水',
  season_temp_mean_c: '生长季均温',
  heat_days: '高温日',
  heavy_rain_days: '暴雨日',
  soil_moisture_anomaly: '土壤水分异常',
  max_3d_precip_mm: '最大 3 日降水',
};

const numberFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
const compactFormat = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 });

interface PanelPoint {
  year: number;
  value: number;
  qualityGrade: string;
  weatherAvailable: boolean;
  seasonPrecip: number | null;
  weatherSource: string;
}

function formatMetric(value: number, metric: Metric): string {
  if (metric === 'planting_area_kha') return `${value.toFixed(1)} 千公顷`;
  if (metric === 'yield_kg_per_ha') return `${numberFormat.format(Math.round(value))} 公斤/公顷`;
  return `${numberFormat.format(Math.round(value))} 吨`;
}

function formatCorrelation(value: number | null): string {
  return value === null ? '—' : value.toFixed(3);
}

function toSegments(points: PanelPoint[]): PanelPoint[][] {
  const segments: PanelPoint[][] = [];
  for (const point of points) {
    const last = segments[segments.length - 1];
    if (last && point.year === last[last.length - 1].year + 1) last.push(point);
    else segments.push([point]);
  }
  return segments;
}

/**
 * G10 补充模块：年度生产序列 + 年度天气相关清单。
 * 年度数据只有年粒度，不插值为日度，也不与日度市场序列合并。
 */
export function YearlyProductionChart({ panelSource, corrSource, evidenceLevel }: {
  panelSource: string;
  corrSource: string;
  evidenceLevel: EvidenceLevelCode;
}) {
  const state = useTables([panelSource, corrSource]);
  const [crop, setCrop] = useState('');
  const [metric, setMetric] = useState<Metric>('production_ton');
  const [hoverCorr, setHoverCorr] = useState<string | null>(null);

  const model = useMemo(() => {
    if (state.status !== 'ready') return null;
    const [panel, corr] = state.data;
    const crops = [...new Set(panel.rows.map((row) => row.crop))];
    const activeCrop = crops.includes(crop) ? crop : crops[0] ?? '';

    const points: PanelPoint[] = panel.rows
      .filter((row) => row.crop === activeCrop)
      .map((row) => ({
        year: numeric(row.year) ?? 0,
        value: numeric(row[metric]) ?? Number.NaN,
        qualityGrade: row.quality_grade ?? '',
        weatherAvailable: row.weather_available === 'True',
        seasonPrecip: numeric(row.season_precip_mm),
        weatherSource: row.weather_source ?? '',
      }))
      .filter((point) => Number.isFinite(point.value))
      .sort((a, b) => a.year - b.year);

    const correlations = corr.rows
      .filter((row) => row.crop === activeCrop)
      .map((row, index) => ({
        key: `${row.variable}:${row.weather}:${index}`,
        variable: row.variable,
        weather: row.weather,
        nYears: numeric(row.n_years),
        pearson: numeric(row.pearson_r),
        spearman: numeric(row.spearman_r),
        interpretationAllowed: row.interpretation_allowed === 'True',
        note: row.note ?? '',
      }));

    return { crops, activeCrop, points, correlations };
  }, [crop, metric, state]);

  const segments = model ? toSegments(model.points) : [];
  const cropIndex = model ? Math.max(0, model.crops.indexOf(model.activeCrop)) : 0;
  const color = CROP_SERIES[cropIndex % CROP_SERIES.length];

  const series: XYSeries[] = segments.map((segment) => ({
    id: `seg-${segment[0].year}`,
    label: segments.length === 1
      ? METRIC_LABEL[metric]
      : segment.length === 1
        ? `${segment[0].year} 年（单年）`
        : `${segment[0].year}–${segment[segment.length - 1].year} 年`,
    points: segment.map((point) => ({ x: point.year, y: point.value })),
    color,
    dots: true,
  }));

  const availableYears = model ? model.points.map((point) => point.year) : [];
  const gapYears = model && availableYears.length > 1
    ? Array.from({ length: availableYears[availableYears.length - 1] - availableYears[0] }, (_, index) => availableYears[0] + index)
      .filter((year) => !availableYears.includes(year))
    : [];
  const latest = model && model.points.length > 0 ? model.points[model.points.length - 1] : null;

  const hoveredCorr = model && hoverCorr ? model.correlations.find((row) => row.key === hoverCorr) ?? null : null;

  const yearCounts = model
    ? model.correlations.map((row) => row.nYears).filter((value): value is number => value !== null)
    : [];
  const yearCountText = yearCounts.length === 0
    ? '—'
    : Math.min(...yearCounts) === Math.max(...yearCounts)
      ? String(yearCounts[0])
      : `${Math.min(...yearCounts)}–${Math.max(...yearCounts)}`;

  return (
    <>
      <ChartFrame
        title={`年度生产序列（${model?.activeCrop ?? ''}）`}
        note="年度生产数据不可插值为日度：这里只有年粒度，不与日度市场序列对齐；折线只在连续年份之间连接，跨年缺口处断开。"
        provenance="observed"
        sources={[panelSource.split('/').pop() ?? '']}
        evidenceLevel={`证据 ${evidenceLevel}`}
        controls={
          <>
            {model && (
              <CropSelector crops={model.crops} value={model.activeCrop} onChange={setCrop} label="作物" />
            )}
            <OptionSelector<Metric>
              label="指标"
              options={[
                { id: 'production_ton', label: '产量' },
                { id: 'planting_area_kha', label: '播种面积' },
                { id: 'yield_kg_per_ha', label: '单产' },
              ]}
              value={metric}
              onChange={setMetric}
            />
          </>
        }
      >
        <AsyncBoundary state={state}>
          {() => (model && model.points.length > 0 ? (
            <>
              <XYChart
                ariaLabel={`${model.activeCrop}${METRIC_LABEL[metric]}年度序列`}
                series={series}
                xTickFormat={(value) => String(value)}
                yTickFormat={(value) => compactFormat.format(value)}
                onHoverX={() => undefined}
                describeX={(value) => {
                  const nearest = model.points.reduce((a, b) => (Math.abs(b.year - value) < Math.abs(a.year - value) ? b : a));
                  return `${nearest.year} 年：${METRIC_LABEL[metric]} ${formatMetric(nearest.value, metric)}`;
                }}
              />

              <div className="readout-row">
                <div className="readout-row__item"><dt>作物</dt><dd>{model.activeCrop}</dd></div>
                <div className="readout-row__item"><dt>指标</dt><dd>{METRIC_LABEL[metric]}</dd></div>
                <div className="readout-row__item"><dt>可得年份</dt><dd className="ag-number">{availableYears.join('、')}</dd></div>
                <div className="readout-row__item">
                  <dt>{gapYears.length > 0 ? '缺口年份（未插值）' : '年份连续性'}</dt>
                  <dd className="ag-number">{gapYears.length > 0 ? gapYears.join('、') : '连续'}</dd>
                </div>
                <div className="readout-row__item"><dt>最新年份读数</dt><dd className="ag-number">{latest ? `${latest.year} 年 ${formatMetric(latest.value, metric)}` : '—'}</dd></div>
                <div className="readout-row__item"><dt>质量标注</dt><dd>{latest?.qualityGrade || '—'}</dd></div>
                <div className="readout-row__item">
                  <dt>生长季气象</dt>
                  <dd>{latest ? (latest.weatherAvailable ? (latest.seasonPrecip !== null ? `${latest.seasonPrecip.toFixed(1)} mm` : '有') : '缺') : '—'}</dd>
                </div>
              </div>

              <p className="chart-frame__note">
                该面板是年鉴口径的年度生产事实值，年份本身并不等距可用（部分年份缺失）；
                因此这里的连线只是把相邻可得年份接起来，不能被读作年度之间的日度或月度变化。生长季气象来自再分析产品，非气象站实测。
              </p>
            </>
          ) : <p className="ag-meta">该作物在该指标下没有可用年份。</p>)}
        </AsyncBoundary>
      </ChartFrame>

      <ChartFrame
        title={`年度天气相关清单（${model?.activeCrop ?? ''}）`}
        note="n_years 均小于 8，interpretation_allowed 为假：这些相关系数只作方向性描述，不作统计推断。"
        provenance="observed"
        sources={[corrSource.split('/').pop() ?? '']}
        evidenceLevel={`证据 ${evidenceLevel}`}
        controls={
          model ? (
            <CropSelector crops={model.crops} value={model.activeCrop} onChange={setCrop} label="作物" />
          ) : undefined
        }
      >
        <AsyncBoundary state={state}>
          {() => (model && model.correlations.length > 0 ? (
            <>
              {hoveredCorr ? (
                <div className="readout-row">
                  <div className="readout-row__item"><dt>生产指标</dt><dd>{PRODUCTION_LABEL[hoveredCorr.variable] ?? hoveredCorr.variable}</dd></div>
                  <div className="readout-row__item"><dt>天气变量</dt><dd>{WEATHER_LABEL[hoveredCorr.weather] ?? hoveredCorr.weather}</dd></div>
                  <div className="readout-row__item"><dt>年数</dt><dd className="ag-number">{hoveredCorr.nYears ?? '—'}</dd></div>
                  <div className="readout-row__item"><dt>Pearson r</dt><dd className="ag-number">{formatCorrelation(hoveredCorr.pearson)}</dd></div>
                  <div className="readout-row__item"><dt>Spearman r</dt><dd className="ag-number">{formatCorrelation(hoveredCorr.spearman)}</dd></div>
                  <div className="readout-row__item"><dt>能否推断</dt><dd>{hoveredCorr.interpretationAllowed ? '可推断' : '不作推断'}</dd></div>
                </div>
              ) : <p className="ag-meta">尚未选择组合。</p>}

              <div className="table-explorer">
                <div className="table-explorer__scroll">
                  <table className="ag-table">
                    <thead>
                      <tr>
                        <th>生产指标</th>
                        <th>天气变量</th>
                        <th>年数</th>
                        <th>Pearson r</th>
                        <th>Spearman r</th>
                        <th>能否推断</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.correlations.map((row) => (
                        <tr
                          key={row.key}
                          data-active={hoverCorr === row.key || undefined}
                          onPointerEnter={() => setHoverCorr(row.key)}
                          onPointerLeave={() => setHoverCorr(null)}
                          style={{ background: hoverCorr === row.key ? CHART_TOKENS.band : undefined }}
                        >
                          <td>{PRODUCTION_LABEL[row.variable] ?? row.variable}</td>
                          <td>{WEATHER_LABEL[row.weather] ?? row.weather}</td>
                          <td className="ag-number">{row.nYears ?? '—'}</td>
                          <td className="ag-number">{formatCorrelation(row.pearson)}</td>
                          <td className="ag-number">{formatCorrelation(row.spearman)}</td>
                          <td>{row.interpretationAllowed ? '可推断' : '不作推断'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="table-explorer__bar">
                  <span className="table-explorer__meta">{model.correlations.length} 行 · 重叠年数 {yearCountText} 年 · 缺年份按缺失处理</span>
                </div>
              </div>

              <p className="chart-frame__note">
                这里的 r 只表示这两个年度序列在同一年份上的共变方向；样本年数不足 8，不作统计推断，也不支持"天气决定产量"的表述。
                年度层结论不与日度层合并，缺年份按缺失处理、不做插补。
              </p>
            </>
          ) : <p className="ag-meta">该作物没有年度天气相关记录（可能与气象年份重叠不足）。</p>)}
        </AsyncBoundary>
      </ChartFrame>
    </>
  );
}
