import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppContext } from '../../app/context/appContext';
import { getCity } from '../../domain/geography/cities';
import { ROUTES } from '../../app/routes';
import { TransitionLink } from '../../app/pageNavigation';
import { useDaily } from '../daily/useDaily';
import { findDailyCrop } from '../../domain/daily/adapter';
import type { DailyFreshness, DailySignal } from '../../domain/daily/types';
import { useScenarioSimulation } from './useScenarioSimulation';
import type { LayerState, ScenarioSeries } from './useScenarioSimulation';
import './scenario-simulation.css';

/**
 * 决策中心 · 情景模拟（Frontend V3 §16）。
 *
 * 左「现实世界」= /api/daily/latest 的已发布观测；右「模拟世界」= /api/forecast/long-horizon
 * 的**情景化**估计。图表画「现实线 vs 模拟线」，视觉明显区分（实线/墨色 vs 虚线/橄榄）。
 * 只能调整正式模型真正支持的变量（作物 × 评估跨度）；收益压力变量需要实际投入，
 * 缺投入时如实标 USER_INPUT_REQUIRED，不给假推荐。
 */

/** 正式模型（/api/decision/stress）真正支持的情景变量；缺实际投入时不可计算。 */
const STRESS_VARIABLES = [
  { id: 'price_pct', label: '价格变化', unit: '%' },
  { id: 'yield_pct', label: '亩产变化', unit: '%' },
  { id: 'cost_pct', label: '成本变化', unit: '%' },
  { id: 'delay_days', label: '上市延迟', unit: '天' },
] as const;

const decimal = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const price = (value: number | null): string => (value === null || !Number.isFinite(value) ? '—' : `${decimal.format(value)} 元/kg`);
const SIGNALS: Record<DailySignal, string> = { NORMAL: '常态', WATCH: '留意', HIGH: '偏高', VERY_HIGH: '高度关注', UNKNOWN: '待评估' };
const FRESHNESS: Record<DailyFreshness, string> = { FRESH: '最新', DELAYED: '发布延迟', STALE: '数据较旧', MISSING: '数据缺失' };
const STATUS_LABEL: Record<string, string> = {
  PRODUCTION_POINT: '生产可用点估计', PRODUCTION_SCENARIO: '生产可用情景区间',
  SCENARIO_ONLY: '仅情景区间', EXPLORATORY_SCENARIO_ONLY: '探索性情景', RESEARCH_ONLY: '仅研究',
};

export function ScenarioSimulation() {
  const [params, setParams] = useSearchParams();
  const contextCity = useAppContext((state) => state.cityId);
  const cityId = params.get('city') ?? contextCity;
  const city = getCity(cityId);
  const simulation = useScenarioSimulation(cityId, params.get('crop') ?? undefined);
  const daily = useDaily(cityId);

  const crop = simulation.crop;
  const observed = daily.status === 'ready' && crop ? findDailyCrop(daily.data, crop) : null;

  const points = simulation.series.status === 'ready' ? simulation.series.data.points : [];
  const horizonParam = Number(params.get('horizon'));
  const selected = points.find((point) => point.horizon === horizonParam) ?? points[0] ?? null;

  const detail = useMemo(() => {
    if (simulation.capability.status !== 'ready') return [];
    const cropCap = simulation.cropCap;
    if (!cropCap) return [];
    return cropCap.horizons.map((item) => ({ days: item.days, status: item.productionStatus, rangeType: item.rangeType }));
  }, [simulation.capability.status, simulation.cropCap]);

  return (
    <main className="scenario scenario-sim">
      <header className="scenario-sim__banner" role="note">
        <p className="scenario-sim__banner-flag">当前正在查看模拟情景</p>
        <p className="scenario-sim__banner-note">现实数据 ≠ 用户假设：左侧是已发布观测，右侧是模型情景，两者不是同一回事。</p>
      </header>

      <header className="scenario__head">
        <h1 className="scenario__title">{city?.shortName ?? cityId} · 情景模拟</h1>
        <p className="scenario__lead">只调整正式模型真正支持的变量（作物 × 评估跨度），看现实与平行情景的差距。</p>
        <p className="scenario__note">模型情景未达到校准预测标准，本节是情景演示而非预测。</p>
      </header>

      <section className="scenario-sim__controls" aria-label="情景变量">
        <div className="scenario-sim__control">
          <span className="ag-label">作物（正式模型支持）</span>
          {simulation.capability.status === 'ready' ? (
            <select
              aria-label="作物"
              value={crop ?? ''}
              onChange={(event) => setParams((previous) => { const next = new URLSearchParams(previous); next.set('crop', event.target.value); next.delete('horizon'); return next; })}
            >
              {simulation.capability.data.crops.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          ) : <span className="scenario-sim__pending">该城市暂无可选作物</span>}
        </div>
        <div className="scenario-sim__control">
          <span className="ag-label">评估跨度（正式模型支持）</span>
          {detail.length > 0 ? (
            <select
              aria-label="评估跨度"
              value={selected?.horizon ?? detail[0].days}
              onChange={(event) => setParams((previous) => { const next = new URLSearchParams(previous); next.set('horizon', event.target.value); return next; })}
            >
              {detail.map((item) => <option key={item.days} value={item.days}>{item.days} 天 · {STATUS_LABEL[item.status] ?? item.status}</option>)}
            </select>
          ) : <span className="scenario-sim__pending">该作物暂无已登记跨度</span>}
        </div>
      </section>

      <div className="scenario-sim__worlds">
        <section className="scenario-sim__world" aria-label="现实世界">
          <p className="ag-label">现实世界 · 已发布观测</p>
          {daily.status === 'loading' && <p className="scenario-sim__pending" role="status">读取观测中…</p>}
          {daily.status === 'unsupported' && <p className="scenario-sim__pending">该城市的每日市场观测暂未接入。</p>}
          {daily.status === 'error' && <p className="scenario-sim__pending" role="status">{daily.error}</p>}
          {daily.status === 'ready' && (
            observed ? (
              <dl className="scenario-sim__facts">
                <div><dt>数据日期</dt><dd>{observed.dataDate ?? daily.data.latestDataDate ?? '—'}</dd></div>
                <div><dt>批发价格</dt><dd>{price(observed.pricePerKg)}</dd></div>
                <div><dt>市场信号</dt><dd>{SIGNALS[observed.signal ?? 'UNKNOWN']}</dd></div>
                <div><dt>数据状态</dt><dd>{FRESHNESS[observed.freshness]}</dd></div>
              </dl>
            ) : <p className="scenario-sim__pending">该品种没有已发布的观测记录。</p>
          )}
          <p className="scenario-sim__note">官方批发观测，不是模型估计。</p>
        </section>

        <section className="scenario-sim__world scenario-sim__world--model" aria-label="模拟世界">
          <p className="ag-label">模拟世界 · 模型情景</p>
          {simulation.series.status === 'loading' && <p className="scenario-sim__pending" role="status">读取情景中…</p>}
          {(simulation.series.status === 'missing' || simulation.series.status === 'error') && (
            <p className="scenario-sim__pending">{simulation.series.note}</p>
          )}
          {simulation.series.status === 'ready' && selected && (
            <>
              <dl className="scenario-sim__facts">
                <div><dt>评估跨度</dt><dd>{selected.horizon} 天</dd></div>
                <div><dt>情景点估计</dt><dd>{price(selected.point)}</dd></div>
                <div><dt>情景区间</dt><dd>{price(selected.low)} — {price(selected.high)}</dd></div>
                <div><dt>口径</dt><dd>{selected.rangeType === 'prediction_interval' ? '预测区间' : '情景区间（非预测区间）'}</dd></div>
                <div><dt>生产状态</dt><dd>{STATUS_LABEL[selected.productionStatus] ?? selected.productionStatus}</dd></div>
                <div><dt>方法 / 可信</dt><dd>{selected.method ?? '—'} / {selected.confidence ?? '—'}</dd></div>
              </dl>
              <p className="scenario-sim__note">来源：/api/forecast/long-horizon（模型 {simulation.series.data.modelVersion}）。</p>
            </>
          )}
        </section>
      </div>

      <figure className="scenario-sim__figure">
        <figcaption className="ag-sr-only">现实线与模拟线对比图</figcaption>
        <RealitySimulationChart
          series={simulation.series}
          reality={observed?.pricePerKg ?? null}
          realityLabel={observed?.dataDate ?? (daily.status === 'ready' ? daily.data.latestDataDate : null)}
          selectedHorizon={selected?.horizon ?? null}
        />
        <ul className="scenario-sim__legend">
          <li><span className="scenario-sim__legend-line scenario-sim__legend-line--reality" aria-hidden="true" />现实线 · 已发布观测价格</li>
          <li><span className="scenario-sim__legend-line scenario-sim__legend-line--model" aria-hidden="true" />模拟线 · 模型情景点估计</li>
        </ul>
      </figure>

      <section className="scenario-sim__assumptions" aria-label="用户假设">
        <p className="ag-label">用户假设 · 收益压力情景</p>
        <p className="scenario-sim__tag">USER_INPUT_REQUIRED</p>
        <p className="scenario-sim__note">
          正式模型支持下列情景变量，但它们作用在收益上，需要先提供实际亩均成本与亩产。当前缺少这些输入，因此不给出任何推荐或收益数字。
        </p>
        <ul className="scenario-sim__vars">
          {STRESS_VARIABLES.map((item) => (
            <li key={item.id}><span>{item.label}</span><span className="scenario-sim__var-unit">{item.unit}</span></li>
          ))}
        </ul>
        <p className="scenario-sim__note">要调整这些变量，请先在城市决策页填写实际投入。</p>
      </section>

      <p className="scenario__note">
        <TransitionLink to={`${ROUTES.scenario}?mode=research`} className="scenario-sim__link">查看沈阳暴雨研究推演 →</TransitionLink>
      </p>
    </main>
  );
}

function RealitySimulationChart({ series, reality, realityLabel, selectedHorizon }: {
  series: LayerState<ScenarioSeries>;
  reality: number | null;
  realityLabel: string | null;
  selectedHorizon: number | null;
}) {
  if (series.status !== 'ready' || series.data.points.length === 0) {
    return <p className="scenario-sim__pending" role="status">该情景暂无可用图表数据。</p>;
  }
  const points = series.data.points;
  const values = points.flatMap((point) => [point.point, point.low, point.high]).filter((value): value is number => value !== null && Number.isFinite(value));
  if (reality !== null) values.push(reality);
  if (values.length === 0) return <p className="scenario-sim__pending" role="status">该情景没有可画的数值。</p>;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min || Math.abs(max) * 0.1 || 1) * 0.16;
  const y = (value: number) => 200 - ((value - (min - padding)) / ((max + padding) - (min - padding))) * 170;
  const x = (index: number) => 60 + (points.length === 1 ? 240 : (index / (points.length - 1)) * 500);

  const modelPath = points.map((point, index) => `${x(index)},${y(point.point ?? NaN)}`).join(' ');
  const modelDrawable = points.every((point) => point.point !== null);
  const aria = [
    `模拟线（模型情景点估计）：${points.map((point) => `${point.horizon} 天 ${price(point.point)}`).join('，')}`,
    reality === null ? '现实线无已发布观测价格' : `现实线（已发布观测）：${price(reality)}${realityLabel ? `，数据日期 ${realityLabel}` : ''}`,
  ].join('。');

  return (
    <svg className="scenario-sim__chart" viewBox="0 0 620 236" role="img" aria-label={aria}>
      <line x1="60" x2="560" y1="200" y2="200" className="scenario-sim__axis" />
      {reality !== null && (
        <line x1="60" x2="560" y1={y(reality)} y2={y(reality)} className="scenario-sim__line scenario-sim__line--reality" />
      )}
      <polyline points={`60,${y(min)} 560,${y(min)}`} className="scenario-sim__axis-muted" />
      {modelDrawable && <polyline points={modelPath} className="scenario-sim__line scenario-sim__line--model" />}
      {points.map((point, index) => (
        <g key={point.horizon}>
          {selectedHorizon === point.horizon && (
            <line x1={x(index)} x2={x(index)} y1="30" y2="200" className="scenario-sim__guide" />
          )}
          {point.point !== null && <circle cx={x(index)} cy={y(point.point)} r="4" className="scenario-sim__point scenario-sim__point--model" />}
          <text x={x(index)} y="218" textAnchor="middle">{point.horizon} 天</text>
        </g>
      ))}
      <text x="60" y="24">{price(max)}</text>
    </svg>
  );
}