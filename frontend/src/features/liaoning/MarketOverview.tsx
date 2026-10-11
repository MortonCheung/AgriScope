import { useState } from 'react';
import { ChoiceButtons } from '../../components/controls/ChoiceButtons';
import { DEMO_MARKET_LABEL, demoPriceChange, type DemoMarket, type DemoPeriod } from '../../domain/market/demoMarket';

const periods = [{ value: 'previous', label: '昨日' }, { value: 'week', label: '7 日前' }, { value: 'month', label: '30 日前' }];
const comparison = { previous: '较昨日', week: '较 7 日前', month: '较 30 日前' };
const price = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const percent = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

export function MarketOverview({ market }: { market: DemoMarket }) {
  const [period, setPeriod] = useState<DemoPeriod>('previous');
  return <section className="market-overview" aria-label={`${market.scope}模拟行情`}>
    <div className="market-overview__head"><h2>{market.scope}</h2><span className="market-overview__badge">{DEMO_MARKET_LABEL}</span></div>
    <p className="market-overview__date">样例日期 <time dateTime={market.date}>{market.date}</time></p>
    <ChoiceButtons label="比较期" options={periods} value={period} onChange={value => setPeriod(value as DemoPeriod)}/>
    <ul className="market-overview__prices">{market.rows.map(row => {
      const change = demoPriceChange(row, period);
      const direction = Math.abs(change) < .05 ? 'flat' : change > 0 ? 'up' : 'down';
      return <li className="market-overview__price" key={row.crop}>
        <h3>{row.crop}</h3>
        <dl>
          <div className="market-overview__value"><dt>批发价</dt><dd><strong>{price.format(row.pricePerKg)}</strong><span>元/kg</span></dd></div>
          <div><dt>{comparison[period]}</dt><dd data-direction={direction}>{percent(change)}</dd></div>
          <div><dt>趋势</dt><dd data-direction={direction}>{direction === 'up' ? '上涨' : direction === 'down' ? '下降' : '平稳'}</dd></div>
        </dl>
      </li>;
    })}</ul>
    <p className="market-overview__note">{market.cityId ? '城市行情样例' : '六城等权模拟均价'} · 仅供演示</p>
  </section>;
}
