import { getCity } from '../../domain/geography/cities';
import { ROUTES } from '../../app/routes';
import { TransitionLink } from '../../app/pageNavigation';
import type { DailyFreshness, DailySignal } from '../../domain/daily/types';
import { CITY_STATE_LABEL, CITY_STATE_NOTE } from './cityMarketState';
import type { CityMarketView } from './useCityMarketStates';

/**
 * 右侧「当前城市摘要」（规范 §8）。
 *
 * 字段全部来自真实端点，缺什么就如实写什么：
 *   名称、市场序列可用性、最新数据日期、信号、主要作物。
 * hover 城市时切换到这里显示的城市；点击（或键盘选择）更新的是全局 City Context。
 */

const SIGNAL_LABEL: Record<DailySignal, string> = {
  NORMAL: '正常',
  WATCH: '关注',
  HIGH: '偏高',
  VERY_HIGH: '显著',
  UNKNOWN: '未知',
};

const FRESHNESS_LABEL: Record<DailyFreshness, string> = {
  FRESH: '当日',
  DELAYED: '延迟',
  STALE: '偏旧',
  MISSING: '缺失',
};

const TIER_LABEL: Record<string, string> = {
  FULL: '完整',
  EXTENDED: '扩展',
  LIMITED: '受限',
  INSUFFICIENT_MARKET_DATA: '市场数据不足',
};

function seriesValue(view: CityMarketView): string {
  if (view.capabilitiesStatus === 'loading') return '读取中…';
  if (view.supported === null) return '无法确认（能力接口未返回）';
  if (!view.supported) return '不可用';
  return view.hasDailySeries ? '可用 · 含日度序列' : '部分可用 · 仅决策级';
}

function dateValue(view: CityMarketView): string {
  if (view.hasDailySeries && view.latestDataDate) {
    const freshness = view.freshness ? ` · ${FRESHNESS_LABEL[view.freshness]}` : '';
    return `${view.latestDataDate}${freshness}`;
  }
  if (view.supported && view.marketAsOf) return `${view.marketAsOf} · 决策模型口径`;
  if (view.capabilitiesStatus === 'loading') return '读取中…';
  return '不可用';
}

function cropsValue(view: CityMarketView): string {
  if (view.capabilitiesStatus === 'loading') return '读取中…';
  if (view.supported === false) return '不可用';
  if (view.modelCrops.length === 0) return '不可用';
  return view.modelCrops.join('、');
}

export function CitySummary({ view }: { view: CityMarketView }) {
  const city = getCity(view.cityId);
  const name = city?.name ?? view.cityId;

  return (
    <section className="city-summary" aria-label={`当前城市摘要：${name}`}>
      <header className="city-summary__head">
        <p className="ag-label">
          当前城市{view.tier ? ` · 决策能力 ${TIER_LABEL[view.tier] ?? view.tier}` : ''}
        </p>
        <div className="city-summary__title-row">
          <h2 className="city-summary__name" aria-live="polite">{name}</h2>
          <span className="city-summary__state" data-state={view.state}>
            <i className="city-summary__state-mark" aria-hidden />
            {CITY_STATE_LABEL[view.state]}
          </span>
        </div>
        <p className="ag-caption">{CITY_STATE_NOTE[view.state]}</p>
      </header>

      <dl className="city-summary__fields">
        <div className="city-summary__field">
          <dt>市场序列可用性</dt>
          <dd>{seriesValue(view)}</dd>
        </div>
        <div className="city-summary__field">
          <dt>最新数据日期</dt>
          <dd className="ag-tabular">{dateValue(view)}</dd>
        </div>
        <div className="city-summary__field">
          <dt>信号</dt>
          <dd>
            {view.hasDailySeries && view.signal ? (
              <>
                <span className="city-summary__signal" data-signal={view.signal}>
                  {SIGNAL_LABEL[view.signal]}
                </span>
                {view.notableCrops.length > 0 && (
                  <span className="city-summary__notable">
                    {view.notableCrops.map((item) => `${item.crop} ${SIGNAL_LABEL[item.signal]}`).join(' · ')}
                  </span>
                )}
              </>
            ) : view.capabilitiesStatus === 'loading' ? (
              '读取中…'
            ) : view.supported === false ? (
              '不可用'
            ) : (
              '无日度信号（该城市未发布日度快照）'
            )}
          </dd>
        </div>
        <div className="city-summary__field">
          <dt>主要作物（市场口径）</dt>
          <dd>{cropsValue(view)}</dd>
        </div>
      </dl>

      {view.limitation && (
        <p className="city-summary__limit">研究侧限制：{view.limitation}</p>
      )}

      <div className="city-summary__actions">
        <TransitionLink className="ag-button ag-button--primary" to={ROUTES.decision(view.cityId)}>
          进入决策
        </TransitionLink>
        <TransitionLink className="ag-button" to={ROUTES.city(view.cityId)}>
          查看研究
        </TransitionLink>
      </div>
    </section>
  );
}