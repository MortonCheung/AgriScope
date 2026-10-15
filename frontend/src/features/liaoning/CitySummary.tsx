import { ROUTES } from '../../app/routes';
import { cityContextUrl } from '../../app/context/provinceSelection';
import { TransitionLink } from '../../app/pageNavigation';
import type { DisplayMarketView } from '../../domain/market/displayMarket';
import { FlipValue } from '../../components/motion/FlipValue';
import { marketDirection, signedChange, summarizeMarket } from './marketPresentation';
import { DataSourceLinks } from '../../components/sources/DataSourceLinks';
import { BeijingClock } from './BeijingClock';
import { MarketDataStatus } from './MarketDataStatus';

export function CitySummary({ market }: { market: DisplayMarketView }) {
  const { rising, falling, topRiser, topFaller, average, comparable } = summarizeMarket(market);
  const observed = market.rows.length > 0;
  const sources = [...new Map((market.regionRows ?? market.rows).flatMap(row => [...(row.sources ?? (row.source ? [row.source] : [])), ...(row.trend_sources ?? [])].map(source => [`${source.id}\n${source.name}\n${source.url}`, source] as const))).values()];
  return <section className="city-summary" aria-label="行情摘要">
    <nav className="city-summary__actions" aria-label="城市工作空间">
      {market.cityId ? <>
        <TransitionLink className="ag-button" to={cityContextUrl(ROUTES.decision(market.cityId), market.cityId)}>决策 <span aria-hidden>↗</span></TransitionLink>
        <TransitionLink className="ag-button" to={cityContextUrl(ROUTES.cityReport(market.cityId), market.cityId)}>报告 <span aria-hidden>↗</span></TransitionLink>
      </> : <>
        <TransitionLink className="ag-button" to={ROUTES.decisionCenter}>决策 <span aria-hidden>↗</span></TransitionLink>
        <TransitionLink className="ag-button" to={ROUTES.reports}>报告 <span aria-hidden>↗</span></TransitionLink>
      </>}
    </nav>
    <BeijingClock/>
    <MarketDataStatus market={market}/>
    <dl className="city-summary__movement">
      <div><dt>较前次上涨</dt><dd><FlipValue value={comparable ? String(rising) : '—'}/><small> 个品种</small></dd></div>
      <div><dt>较前次下跌</dt><dd><FlipValue value={comparable ? String(falling) : '—'}/><small> 个品种</small></dd></div>
    </dl>
    <dl className="city-summary__highlights">
      {([{ label: '涨幅最大', row: topRiser }, { label: '跌幅最大', row: topFaller }] as const).map(({ label, row }) => <div key={label}>
        <dt>{label}</dt><dd>{row ? <><FlipValue value={row.product}/><span data-direction={marketDirection(row.change)}><FlipValue value={signedChange(row.change)}/>%</span></> : comparable ? '平稳' : observed ? '最新' : '无可比较观测'}</dd>
      </div>)}
      <div><dt>平均变动</dt><dd data-direction={comparable ? marketDirection(average) : undefined}><span>{comparable ? <><FlipValue value={signedChange(average)}/>%</> : observed ? '最新' : '无可比较观测'}</span></dd></div>
    </dl>
    <DataSourceLinks scope={market.cityId} items={sources}/>
  </section>;
}
