import { useState } from 'react';
import { demoPriceChange, type DemoMarket, type DemoPrice } from '../../domain/market/demoMarket';
import { FlipValue } from '../../components/motion/FlipValue';
import { marketDirection, signedChange } from './marketPresentation';
const price = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
export function marketTrendPoints(row: DemoPrice, date: string) {
  return ([-30, -7, -1, 0] as const).map((offset, index) => {
    const day = new Date(`${date}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + offset);
    return { offset, date: day.toISOString().slice(0, 10), price: [row.month, row.week, row.previous, row.pricePerKg][index], x: 32 + (offset + 30) / 30 * 272 };
  });
}
export function MarketOverview({ market }: { market: DemoMarket }) {
  const [view, setView] = useState<'today' | 'trend'>('today');
  return <section className="market-overview" aria-label="行情价格">
    <div className="market-overview__head"><FlipValue value={market.scope}/><time dateTime={market.date}>更新 {market.date}</time></div>
    <div className="market-overview__controls" role="group" aria-label="行情视图">{(['today','trend'] as const).map(mode => <button key={mode} type="button" className="ag-button" aria-pressed={view === mode} onClick={() => setView(mode)}>{mode === 'today' ? '今日行情' : '长期趋势'}</button>)}</div>
    <p className="market-overview__caption">批发价 <span>较昨日</span></p>
    <ul className="market-overview__prices">{market.rows.map(row => {
      const change = demoPriceChange(row, 'previous');
      const direction = marketDirection(change);
      return <li className="market-overview__price" key={row.crop}>
        <h3>{row.crop}</h3><div className="market-overview__row"><p className="market-overview__value"><strong><FlipValue value={price.format(row.pricePerKg)}/></strong><small>元/kg</small></p><span className="market-overview__change" data-direction={direction} aria-label={`较昨日 ${signedChange(change)}%`}><FlipValue value={signedChange(change)}/>%</span></div>
        {view === 'trend' && <MarketTrend row={row} date={market.date}/>}
      </li>;
    })}</ul>
  </section>;
}
function MarketTrend({ row, date }: { row: DemoPrice; date: string }) {
  const points = marketTrendPoints(row, date);
  const low = Math.min(...points.map(point => point.price)), high = Math.max(...points.map(point => point.price));
  const y = (n: number) => 58 - (n - low) / (high - low || 1) * 36;
  return <svg className="market-overview__trend" viewBox="0 0 340 88" role="img" aria-label={`${row.crop} 近30天价格锚点，元/kg`}>
    <line x1="32" x2="304" y1="64" y2="64" className="market-overview__axis"/>
    <polyline points={points.map(point => `${point.x},${y(point.price)}`).join(' ')} />
    {points.map(point => <circle key={point.offset} cx={point.x} cy={y(point.price)} r="3"><title>{point.date}：{price.format(point.price)} 元/kg</title></circle>)}
    <text x="32" y="82">{points[0].date.slice(5)}</text><text x="304" y="82" textAnchor="end">{date.slice(5)}</text>
  </svg>;
}
