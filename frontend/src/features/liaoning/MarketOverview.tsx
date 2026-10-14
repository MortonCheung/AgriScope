import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  DISPLAY_PRICE_LEVELS, DISPLAY_PRODUCTS, PRICE_LEVEL_BUTTON, PRICE_LEVEL_LABEL,
  type DisplayMarketRow, type DisplayMarketView, type DisplayPriceLevel,
} from '../../domain/market/displayMarket';
import { SelectControl } from '../../components/controls/SelectControl';
import { FlipValue } from '../../components/motion/FlipValue';
import { marketDirection, signedChange } from './marketPresentation';
import { SelectionGroup } from '../../components/controls/SelectionGroup';
import { MOTION_DURATION, MOTION_EASE } from '../../design/motion';
const price = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formattedPrice = (value: number) => value < 0.01 ? '<0.01' : price.format(value);
const productOptions = [{ value: '', label: '全部商品' }, ...DISPLAY_PRODUCTS.map(product => ({ value: product, label: product }))];

export function marketTrendPoints(row: DisplayMarketRow) {
  const history = row.trend_history ?? row.history;
  const first = Date.parse(`${history[0].date}T00:00:00Z`);
  const last = Date.parse(`${history.at(-1)!.date}T00:00:00Z`);
  return history.map(point => ({ ...point,
    x: last === first ? 168 : 32 + (Date.parse(`${point.date}T00:00:00Z`) - first) / (last - first) * 272,
  }));
}
export function MarketOverview({ title, market, product, onProductChange, onPriceLevelChange }: {
  title?: string;
  market: DisplayMarketView;
  product: string;
  onProductChange: (product: string) => void;
  onPriceLevelChange: (level: DisplayPriceLevel) => void;
}) {
  const [view, setView] = useState<'today' | 'trend'>('today');
  const reduced = Boolean(useReducedMotion());
  const products = DISPLAY_PRODUCTS.filter(name => (!product || name === product) && (market.rows.some(row => row.product === name) || market.missing?.some(row => row.product === name)));
  return <section className="market-overview" aria-label="行情价格">
    <div className="market-overview__toolbar">
    <div className="market-overview__heading">{title && <h1 className="liaoning-page__title">{title}</h1>}<div className="market-overview__head"><div className="market-overview__scope"><FlipValue value={market.scope}/><span>{PRICE_LEVEL_LABEL[market.priceLevel]}</span></div></div></div>
    <SelectionGroup className="market-overview__controls market-overview__price-levels" value={market.priceLevel} role="group" aria-label="价格类型">{DISPLAY_PRICE_LEVELS.map(level => <button key={level} type="button" data-selection-value={level} className="ag-button" aria-pressed={market.priceLevel === level} onFocus={event => event.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' })} onClick={() => onPriceLevelChange(level)}>{PRICE_LEVEL_BUTTON[level]}</button>)}</SelectionGroup>
    <SelectControl className="market-overview__product" label="商品" value={product} options={productOptions} onChange={onProductChange}/>
    <SelectionGroup className="market-overview__controls" value={view} role="group" aria-label="行情视图">{(['today','trend'] as const).map(mode => <button key={mode} type="button" data-selection-value={mode} className="ag-button" aria-pressed={view === mode} onClick={() => setView(mode)}>{mode === 'today' ? '当前行情' : '长期趋势'}</button>)}</SelectionGroup>
    <p className="market-overview__caption">当前价格 <span>较前次</span></p>
    </div>
    <div className="market-overview__data" role="region" aria-label="商品行情列表" tabIndex={0}>
    <ul className="market-overview__prices">{products.map(name => {
      const row = market.rows.find(item => item.product === name);
      if (!row) return <li className="market-overview__price" key={name} data-availability="missing"><h3>{name}</h3><p className="market-overview__meta">尚无本地观测</p><div className="market-overview__meta"><span>{PRICE_LEVEL_LABEL[market.priceLevel]}</span></div></li>;
      const direction = marketDirection(row.change_percent);
      const comparable = row.history.length > 1;
      const movement = !comparable ? '最新' : direction === 'flat' ? '平稳' : `${direction === 'up' ? '↑' : '↓'}${Math.abs(row.change_percent).toFixed(1)}%`;
      return <li className="market-overview__price" key={row.product}>
        <h3>{row.product}</h3><div className="market-overview__row"><p className="market-overview__value"><strong><FlipValue value={formattedPrice(row.price)}/></strong><small>元/kg</small></p><span className="market-overview__change" data-direction={direction} aria-label={comparable ? `较前次 ${direction === 'flat' ? '平稳' : `${signedChange(row.change_percent)}%`}` : '最新观测'}><FlipValue value={movement}/></span></div>
        <div className="market-overview__meta"><span>{PRICE_LEVEL_LABEL[row.price_level]}</span><time dateTime={row.display_date ?? row.observation_date ?? undefined}>{row.display_date ? '更新' : '观测'}：{row.display_date ?? row.observation_date ?? '—'}</time></div>
        {row.source && <a className="market-overview__source" href={row.source.url} target="_blank" rel="noopener noreferrer" aria-label={`${row.product}数据来源：${row.source.name}`}><span>{row.source.name}</span><span aria-hidden>↗</span></a>}
        <motion.div className="market-overview__trend-reveal" aria-hidden={view !== 'trend'} inert={view !== 'trend'} initial={false}
          animate={{ height: view === 'trend' ? 'auto' : 0, opacity: view === 'trend' ? 1 : 0, clipPath: view === 'trend' ? 'inset(0 0 0% 0)' : 'inset(0 0 100% 0)' }}
          transition={{ duration: reduced ? 0 : MOTION_DURATION.normal, ease: MOTION_EASE.out }}><MarketTrend row={row}/></motion.div>
      </li>;
    })}</ul></div>
  </section>;
}
function MarketTrend({ row }: { row: DisplayMarketRow }) {
  const points = marketTrendPoints(row);
  const low = Math.min(...points.map(point => point.price)), high = Math.max(...points.map(point => point.price));
  const y = (n: number) => 58 - (n - low) / (high - low || 1) * 36;
  return <div className="market-overview__trend">
    <svg viewBox="0 0 340 70" role="img" aria-label={`${row.product} 历史价格，元/kg`}>
    <line x1="32" x2="304" y1="64" y2="64" className="market-overview__axis"/>
    {points.length > 1 && <polyline points={points.map(point => `${point.x},${y(point.price)}`).join(' ')} />}
    {points.map(point => <circle key={point.date} cx={point.x} cy={y(point.price)} r="3"><title>{point.date}：{formattedPrice(point.price)} 元/kg</title></circle>)}
    </svg>
    <div className="market-overview__trend-dates"><time dateTime={points[0].date}>{points[0].date.slice(5)}</time><time dateTime={points.at(-1)!.date}>{points.at(-1)!.date.slice(5)}</time></div>
    {row.trend_sources?.map(source => <a key={`${source.id}:${source.url}`} className="market-overview__source" href={source.url} target="_blank" rel="noopener noreferrer" aria-label={`${row.product}历史价格来源：${source.name}`}><span>{source.name}</span><span aria-hidden>↗</span></a>)}
  </div>;
}
