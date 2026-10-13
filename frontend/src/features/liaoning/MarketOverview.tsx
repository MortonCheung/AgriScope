import { useState } from 'react';
import {
  DISPLAY_PRICE_LEVELS, DISPLAY_PRODUCTS, PRICE_LEVEL_BUTTON, PRICE_LEVEL_LABEL,
  type DisplayMarketRecord, type DisplayMarketView, type DisplayPriceLevel,
} from '../../domain/market/displayMarket';
import { SelectControl } from '../../components/controls/SelectControl';
import { FlipValue } from '../../components/motion/FlipValue';
import { marketDirection, signedChange } from './marketPresentation';
const price = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const productOptions = [{ value: '', label: '全部商品' }, ...DISPLAY_PRODUCTS.map(product => ({ value: product, label: product }))];

export function marketTrendPoints(row: DisplayMarketRecord) {
  const first = Date.parse(`${row.history[0].date}T00:00:00Z`);
  const last = Date.parse(`${row.history.at(-1)!.date}T00:00:00Z`);
  return row.history.map(point => ({ ...point,
    x: last === first ? 168 : 32 + (Date.parse(`${point.date}T00:00:00Z`) - first) / (last - first) * 272,
  }));
}
export function MarketOverview({ market, product, onProductChange, onPriceLevelChange }: {
  market: DisplayMarketView;
  product: string;
  onProductChange: (product: string) => void;
  onPriceLevelChange: (level: DisplayPriceLevel) => void;
}) {
  const [view, setView] = useState<'today' | 'trend'>('today');
  const rows = product ? market.rows.filter(row => row.product === product) : market.rows;
  return <section className="market-overview" aria-label="行情价格">
    <div className="market-overview__head"><div className="market-overview__scope"><FlipValue value={market.scope}/><span>{PRICE_LEVEL_LABEL[market.priceLevel]}</span></div></div>
    <div className="market-overview__controls market-overview__price-levels" role="group" aria-label="价格类型">{DISPLAY_PRICE_LEVELS.map(level => <button key={level} type="button" className="ag-button" aria-pressed={market.priceLevel === level} onClick={() => onPriceLevelChange(level)}>{PRICE_LEVEL_BUTTON[level]}</button>)}</div>
    <SelectControl className="market-overview__product" label="商品" value={product} options={productOptions} onChange={onProductChange}/>
    <div className="market-overview__controls" role="group" aria-label="行情视图">{(['today','trend'] as const).map(mode => <button key={mode} type="button" className="ag-button" aria-pressed={view === mode} onClick={() => setView(mode)}>{mode === 'today' ? '当前行情' : '长期趋势'}</button>)}</div>
    <p className="market-overview__caption">当前价格 <span>较前次</span></p>
    <ul className="market-overview__prices">{rows.map(row => {
      const direction = marketDirection(row.change_percent);
      const movement = direction === 'flat' ? '平稳' : `${direction === 'up' ? '↑' : '↓'}${Math.abs(row.change_percent).toFixed(1)}%`;
      return <li className="market-overview__price" key={row.product}>
        <h3>{row.product}</h3><div className="market-overview__row"><p className="market-overview__value"><strong><FlipValue value={price.format(row.price)}/></strong><small>元/kg</small></p><span className="market-overview__change" data-direction={direction} aria-label={`较前次 ${direction === 'flat' ? '平稳' : `${signedChange(row.change_percent)}%`}`}><FlipValue value={movement}/></span></div>
        <div className="market-overview__meta"><span>{PRICE_LEVEL_LABEL[row.price_level]}</span><time dateTime={row.observation_date}>更新：{row.observation_date}</time></div>
        {view === 'trend' && <MarketTrend row={row}/>}
      </li>;
    })}</ul>
  </section>;
}
function MarketTrend({ row }: { row: DisplayMarketRecord }) {
  const points = marketTrendPoints(row);
  const low = Math.min(...points.map(point => point.price)), high = Math.max(...points.map(point => point.price));
  const y = (n: number) => 58 - (n - low) / (high - low || 1) * 36;
  return <div className="market-overview__trend">
    <svg viewBox="0 0 340 70" role="img" aria-label={`${row.product} 历史价格，元/kg`}>
    <line x1="32" x2="304" y1="64" y2="64" className="market-overview__axis"/>
    {points.length > 1 && <polyline points={points.map(point => `${point.x},${y(point.price)}`).join(' ')} />}
    {points.map(point => <circle key={point.date} cx={point.x} cy={y(point.price)} r="3"><title>{point.date}：{price.format(point.price)} 元/kg</title></circle>)}
    </svg>
    <div className="market-overview__trend-dates"><time dateTime={points[0].date}>{points[0].date.slice(5)}</time><time dateTime={row.observation_date}>{row.observation_date.slice(5)}</time></div>
  </div>;
}
