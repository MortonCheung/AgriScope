import { useState } from 'react';
import type { LongHorizonEntry, LongHorizonStatus, LongHorizonFreshness, TargetEstimate, TargetType } from '../../domain/longHorizon/types';
import { useLongHorizon } from './useLongHorizon';
import './longHorizon.css';

export const STATUS_LABELS: Record<LongHorizonStatus, string> = {
  PRODUCTION_POINT: '正式估计', PRODUCTION_SCENARIO: '正式情景', SCENARIO_ONLY: '情景估计',
  EXPLORATORY_SCENARIO_ONLY: '探索性结果', RESEARCH_ONLY: '研究结果',
};
const decimal = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
export const money = (v: number | null) => v === null ? '—' : `${decimal.format(v)} 元/kg`;
const confidenceLabel = (v: string | null) => ({ high: '高', medium: '中', low: '低' }[v ?? ''] ?? '未确认');

export function FreshnessNote({ freshness }: { freshness?: LongHorizonFreshness }) {
  if (!freshness) return null;
  return <p className="long-horizon__note" role={freshness.status !== 'CURRENT' || freshness.dailyDelayed ? 'status' : undefined}>
    {freshness.status === 'LONG_HORIZON_STALE' ? '长期结果未与最新市场数据同步，请谨慎参考。'
      : freshness.status === 'DAILY_UNAVAILABLE' ? '当前市场数据暂时不可用，无法确认长期结果新鲜度。' : '长期结果已与 Daily 对齐。'}
    {freshness.dailyDelayed ? ' Daily 数据发布延迟。' : ''}
    {freshness.dailyLatestDataDate ? ` 市场数据截至 ${freshness.dailyLatestDataDate}。` : ''}
  </p>;
}

export function DualTargetView({ targets, asOf, freshness, llmStatus }: {
  targets: Record<TargetType, TargetEstimate>; asOf: string | null; freshness?: LongHorizonFreshness; llmStatus?: string;
}) {
  return <div className="long-horizon" aria-label="上市价格与周期市场均价">
    {(['harvest_market_price', 'cycle_market_average'] as const).map(type => {
      const e = targets[type];
      return <section key={type} data-status={e.productionStatus} className="long-horizon__target">
        <header className="long-horizon__head"><h3 className="long-horizon__label">{type === 'harvest_market_price' ? '预计上市窗口价格' : '整个周期市场均价'}</h3>
          <p className="long-horizon__status">{STATUS_LABELS[e.productionStatus]} · 可信度{confidenceLabel(e.confidence)}{e.fallbackUsed ? ' · 已使用回退方法' : ''}</p></header>
        <ul className="long-horizon__rows"><li><span>基准情景</span><span>{money(e.pointForecast)}</span></li><li><span>下行 — 上行</span><span>{money(e.rangeLow)} — {money(e.rangeHigh)}</span></li></ul>
        <p className="long-horizon__meta">实际方法 {e.actualMethod ?? '暂不可用'} · 数据基准 {e.anchorDate ?? asOf ?? '未确认'}
          {e.window ? ` · 基准日后第 ${e.window.startOffset} 至 ${e.window.endOffsetExclusive - 1} 天` : ''}</p>
        <p className="long-horizon__meta">模型分歧 {e.modelDisagreementPct == null ? '暂不可用' : `${decimal.format(e.modelDisagreementPct)}%`}</p>
        <p className="long-horizon__note">{type === 'cycle_market_average' ? '描述整个周期的市场价格中枢，不能代替上市销售价格。' : '对应用户所选上市时点附近的销售窗口，不能保证实际成交价格。'}
          {e.rangeType === 'prediction_interval' ? ' 区间通过独立校准。' : ' 范围为情景参考，未校准为概率区间。'}</p>
      </section>;
    })}
    <FreshnessNote freshness={freshness}/>
    {llmStatus === 'LLM_UNAVAILABLE' && <p className="long-horizon__note">真实 LLM 尚不可用，本次数值来自统计方法。</p>}
  </div>;
}

/** A supporting snapshot view; harvest timing is always an explicit choice. */
export function LongHorizonPanel({ cityId, crop }: { cityId: string; crop?: string }) {
  const [horizon, setHorizon] = useState<number | undefined>();
  const state = useLongHorizon(cityId, crop ?? '', horizon);
  if (state.status === 'unsupported') return null;
  if (state.status === 'loading') return <section className="long-horizon" aria-busy="true"><p className="long-horizon__pending">读取长期情景</p></section>;
  if (state.status === 'error') return <section className="long-horizon"><p role="status">{state.error}</p></section>;
  const selector = <label className="long-horizon__selector">预计上市跨度<select aria-label="长期情景上市跨度" value={horizon ?? ''} onChange={e => setHorizon(e.target.value ? Number(e.target.value) : undefined)}>
    <option value="">请按自己的计划选择</option>{state.capability.horizons.map(h => <option key={h.days} value={h.days}>{h.days} 天 · {STATUS_LABELS[h.productionStatus]}</option>)}
  </select></label>;
  if (state.status === 'awaiting_selection') return <section className="long-horizon">{selector}<p className="long-horizon__note">上市时间由你确认，系统不推断作物生育期。</p></section>;
  const data: LongHorizonEntry = state.data;
  return <section>{selector}{data.targets ? <DualTargetView targets={data.targets} asOf={data.asOf} freshness={data.freshness} llmStatus={data.llmStatus}/>
    : <p className="long-horizon__note">双目标长期结果尚未接入。</p>}</section>;
}
