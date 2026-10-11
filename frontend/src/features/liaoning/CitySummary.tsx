import { ROUTES } from '../../app/routes';
import { cityContextUrl } from '../../app/context/provinceSelection';
import { TransitionLink } from '../../app/pageNavigation';
import { DEMO_MARKET_LABEL, demoPriceChange, type DemoMarket } from '../../domain/market/demoMarket';

export function CitySummary({ market }: { market: DemoMarket }) {
  const rising = market.rows.filter(row => demoPriceChange(row, 'previous') > .05).length;
  const falling = market.rows.filter(row => demoPriceChange(row, 'previous') < -.05).length;
  return <section className="city-summary" aria-label="行情摘要">
    <p className="city-summary__date">{DEMO_MARKET_LABEL} · {market.rows.length} 个品种</p>
    <dl className="city-summary__movement">
      <div><dt>较昨日上涨</dt><dd>{rising}<small> 个品种</small></dd></div>
      <div><dt>较昨日下降</dt><dd>{falling}<small> 个品种</small></dd></div>
    </dl>
    <nav className="city-summary__actions" aria-label="城市工作空间">
      {market.cityId ? <>
        <TransitionLink className="ag-button" to={cityContextUrl(ROUTES.decision(market.cityId), market.cityId)}>决策 <span aria-hidden>↗</span></TransitionLink>
        <TransitionLink className="ag-button" to={cityContextUrl(ROUTES.cityReport(market.cityId), market.cityId)}>报告 <span aria-hidden>↗</span></TransitionLink>
      </> : <TransitionLink className="ag-button" to={ROUTES.researchCenter}>城市报告 <span aria-hidden>↗</span></TransitionLink>}
    </nav>
  </section>;
}
