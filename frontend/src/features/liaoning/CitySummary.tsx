import { ROUTES } from '../../app/routes';
import { cityContextUrl } from '../../app/context/provinceSelection';
import { TransitionLink } from '../../app/pageNavigation';
import type { DemoMarket } from '../../domain/market/demoMarket';
import { FlipValue } from '../../components/motion/FlipValue';
import { marketDirection, signedChange, summarizeMarket } from './marketPresentation';

export function CitySummary({ market }: { market: DemoMarket }) {
  const { rising, falling, topRiser, topFaller, average } = summarizeMarket(market);
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
    <dl className="city-summary__movement">
      <div><dt>较昨日上涨</dt><dd><FlipValue value={String(rising)}/><small> 个品种</small></dd></div>
      <div><dt>较昨日下跌</dt><dd><FlipValue value={String(falling)}/><small> 个品种</small></dd></div>
    </dl>
    <dl className="city-summary__highlights">
      {([{ label: '涨幅最大', row: topRiser }, { label: '跌幅最大', row: topFaller }] as const).map(({ label, row }) => <div key={label}>
        <dt>{label}</dt><dd>{row ? <><FlipValue value={row.crop}/><span data-direction={marketDirection(row.change)}><FlipValue value={signedChange(row.change)}/>%</span></> : '—'}</dd>
      </div>)}
      <div><dt>平均变动</dt><dd data-direction={marketDirection(average)}><span><FlipValue value={signedChange(average)}/>%</span></dd></div>
    </dl>
  </section>;
}
