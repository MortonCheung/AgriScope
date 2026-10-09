import { useDaily } from '../daily/useDaily';
import { ROUTES } from '../../app/routes';
import { TransitionLink } from '../../app/pageNavigation';
import type { DailyCrop, DailySignal } from '../../domain/daily/types';

/**
 * 辽宁农业态势的「当前市场」摘要（V3 §5）。
 *
 * 诚实边界（§44/§48/§69）：
 *   目前唯一接入的日度市场源是**沈阳批发市场**，其余城市没有可比日度价格。
 *   因此这里只陈述沈阳批发市场的事实，并在标题里写清口径，
 *   绝不把它包装成"辽宁整体市场"，也不虚构六城合并指标。
 *
 * 数据缺失不写成"暂无数据"，而是按状态给出具体说明（§44）。
 */

const SIGNAL_LABEL: Record<DailySignal, string> = {
  NORMAL: '正常',
  WATCH: '关注',
  HIGH: '偏高',
  VERY_HIGH: '显著',
  UNKNOWN: '未知',
};

const FRESHNESS_LABEL: Record<string, string> = {
  FRESH: '当日',
  DELAYED: '延迟',
  STALE: '偏旧',
  MISSING: '缺失',
};

/** 风险从高到低；无风险信息的排最后。 */
function riskOf(crop: DailyCrop): number {
  return crop.marketRisk ?? crop.hri ?? -1;
}

function notable(crops: DailyCrop[]): DailyCrop[] {
  return [...crops]
    .filter((crop) => crop.signal && crop.signal !== 'NORMAL' && crop.signal !== 'UNKNOWN')
    .sort((a, b) => riskOf(b) - riskOf(a))
    .slice(0, 4);
}

export function MarketOverview() {
  const state = useDaily('shenyang');

  return (
    <section className="market-overview" aria-label="当前市场">
      <p className="ag-label">当前市场 · 沈阳批发</p>

      {state.status === 'loading' && (
        <div className="ag-state ag-state--loading" aria-hidden="true">
          <i className="ag-skeleton" />
          <i className="ag-skeleton" />
        </div>
      )}

      {state.status === 'error' && (
        <p className="market-overview__note">{state.error}</p>
      )}

      {state.status === 'unsupported' && (
        <p className="market-overview__note">该城市的日度市场数据暂未接入。</p>
      )}

      {state.status === 'ready' && (
        <>
          <p className="market-overview__meta">
            <span>数据日期 {state.data.latestDataDate ?? '—'}</span>
            <span className="market-overview__dot" aria-hidden>·</span>
            <span>{FRESHNESS_LABEL[state.data.freshness] ?? state.data.freshness}</span>
          </p>
          {(() => {
            const items = notable(state.data.crops);
            if (items.length === 0) {
              return <p className="market-overview__note">本期作物价格处于正常季节波动区间，没有明显异常信号。</p>;
            }
            return (
              <ul className="market-overview__signals">
                {items.map((crop) => (
                  <li className="market-overview__signal" key={crop.crop}>
                    <span className="market-overview__crop">{crop.crop}</span>
                    <span className="market-overview__state" data-signal={crop.signal ?? undefined}>
                      {crop.signal ? SIGNAL_LABEL[crop.signal] : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            );
          })()}
          <p className="ag-caption">市场状态用于提示关注，不构成买卖建议。</p>
        </>
      )}

      <TransitionLink className="market-overview__cta" to={ROUTES.decisionCenter}>进入决策中心 →</TransitionLink>
    </section>
  );
}
