import { useEffect, useState } from 'react';
import type { DisplayMarketView } from '../../domain/market/displayMarket';
import { formatMarketTimestamp, isMarketDay, latestMarketTimestamp, marketFreshness, millisecondsToBeijingMidnight } from './marketTime';
import { useDisplayMarketStatus } from './useDisplayMarket';
import './market-data-status.css';

/** Data freshness has its own day-boundary clock, independent from the second clock. */
export function MarketDataStatus({ market }: { market: DisplayMarketView }) {
  const requestStatus = useDisplayMarketStatus();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: number | undefined;
    const pause = () => { window.clearTimeout(timer); timer = undefined; };
    const synchronize = () => {
      pause();
      if (document.visibilityState === 'hidden') return;
      const current = Date.now();
      setNow(current);
      timer = window.setTimeout(synchronize, millisecondsToBeijingMidnight(current) + 5);
    };
    synchronize();
    window.addEventListener('focus', synchronize);
    document.addEventListener('visibilitychange', synchronize);
    return () => {
      pause();
      window.removeEventListener('focus', synchronize);
      document.removeEventListener('visibilitychange', synchronize);
    };
  }, []);

  // Never borrow the coverage date from another price level or region.
  const observationDate = market.rows.map(row => row.observation_date).filter(isMarketDay).sort().at(-1) ?? null;
  const collectedAt = latestMarketTimestamp(market.rows.flatMap(row => row.collectedAt ? [row.collectedAt] : []));
  const collected = formatMarketTimestamp(collectedAt);
  const published = formatMarketTimestamp(market.publishedAt);
  const freshness = marketFreshness(observationDate, now);

  return <section className="market-data-status" aria-label="行情状态">
    <div className="market-data-status__heading"><h2>行情状态</h2>{market.schemaVersion !== 'presentation-1' && <span data-freshness={freshness.state}>{freshness.label}</span>}</div>
    <dl className="market-data-status__times">
      <div><dt>最近观测</dt><dd>{observationDate ? <time dateTime={observationDate}>{observationDate.slice(5)}</time> : '—'}</dd></div>
      <div><dt>采集时间</dt><dd>{collected && collectedAt ? <time dateTime={collectedAt}>{collected}</time> : '—'}</dd></div>
      <div><dt>发布时间</dt><dd>{published && market.publishedAt ? <time dateTime={market.publishedAt}>{published}</time> : '—'}</dd></div>
    </dl>
    {requestStatus === 'failed' && market.schemaVersion !== 'presentation-1' && <p className="market-data-status__notice" role="status">暂时无法获取更新</p>}
  </section>;
}
