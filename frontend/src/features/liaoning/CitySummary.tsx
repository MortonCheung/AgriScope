import { ROUTES } from '../../app/routes';
import { cityContextUrl } from '../../app/context/provinceSelection';
import { TransitionLink } from '../../app/pageNavigation';
import type { DailyState } from '../../domain/daily/types';
import { dailyChangeText } from '../daily/DailyContext';
import { latestMarketRows } from './MarketOverview';
export function CitySummary({ cityId, market }: { cityId: string | null; market: DailyState }) {
  const snapshot = market.status === 'ready' ? market.data : null;
  const movement = snapshot ? latestMarketRows(snapshot.crops, 2).filter(row => row.change7d !== null) : [];
  return <section className="city-summary" aria-label={cityId ? '城市观察摘要' : '已接入市场摘要'}>
    {snapshot && <>
      <h2>{cityId ? '近期变化' : '已接入市场'}</h2>
      {!cityId && <p className="city-summary__market">沈阳批发市场</p>}
      <p className="city-summary__date">{latestMarketRows(snapshot.crops, snapshot.crops.length).length} 个品种 · {snapshot.latestDataDate}</p>
      {movement.length > 0 && <dl className="city-summary__movement">{movement.map(row => <div key={row.crop}><dt>{row.crop}<small>7 日变化</small></dt><dd>{dailyChangeText(row.change7d)}</dd></div>)}</dl>}
    </>}
    {cityId && !snapshot && <div className="city-summary__tools"><h2>经营核算</h2><p>成本收益 · 盈亏平衡 · 条件情景</p></div>}
    {cityId && <nav className="city-summary__actions" aria-label="城市工作空间">
      <TransitionLink className="city-summary__action" to={cityContextUrl(ROUTES.decision(cityId), cityId)}>决策 <span aria-hidden>↗</span></TransitionLink>
      <TransitionLink className="city-summary__action" to={cityContextUrl(ROUTES.city(cityId), cityId)}>报告 <span aria-hidden>↗</span></TransitionLink>
    </nav>}
  </section>;
}
