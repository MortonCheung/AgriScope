import { demoPriceChange, type DemoMarket } from '../../domain/market/demoMarket';
const price = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const percent = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

export function MarketOverview({ market }: { market: DemoMarket }) {
  return <section className="market-overview" aria-label="行情价格">
    <ul className="market-overview__prices">{market.rows.map(row => {
      const change = demoPriceChange(row, 'previous');
      const direction = Math.abs(change) < .05 ? 'flat' : change > 0 ? 'up' : 'down';
      return <li className="market-overview__price" key={row.crop}>
        <h3>{row.crop}</h3>
        <dl>
          <div className="market-overview__value"><dt>批发价</dt><dd><strong>{price.format(row.pricePerKg)}</strong><span>元/kg</span></dd></div>
          <div><dt>较昨日</dt><dd data-direction={direction}>{percent(change)}</dd></div>
          <div><dt>趋势</dt><dd data-direction={direction}>{direction === 'up' ? '上涨' : direction === 'down' ? '下降' : '平稳'}</dd></div>
        </dl>
      </li>;
    })}</ul>
  </section>;
}
