import { useState } from 'react';
import { getCity } from '../../domain/geography/cities';
import type { DailyCrop } from '../../domain/daily/types';
import type { useDailyResource } from '../daily/useDaily';
import { dailyChangeText } from '../daily/DailyContext';
export type MarketResource = ReturnType<typeof useDailyResource>;
type Period = 'changePreviousObservation' | 'change7d' | 'change30d';
const PERIODS: readonly [Period, string][] = [['changePreviousObservation', '前观测'], ['change7d', '7 日'], ['change30d', '30 日']];
const price = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
/** Published observations only; sort visible rows by recorded seven-day change. */
export function latestMarketRows(crops: readonly DailyCrop[], limit = 4): DailyCrop[] {
  return [...crops].filter(row => row.pricePerKg !== null && row.dataDate && row.sourceId)
    .sort((a, b) => Math.abs(b.change7d ?? 0) - Math.abs(a.change7d ?? 0) || a.crop.localeCompare(b.crop, 'zh-CN'))
    .slice(0, limit);
}
export function MarketOverview({ cityId, resource }: { cityId: string; resource: MarketResource }) {
  const { state, refresh, refreshing, refreshError } = resource;
  const [period, setPeriod] = useState<Period>('change7d');
  if (state.status === 'unsupported') return <section className="market-overview" aria-label={`${getCity(cityId)?.shortName}市场口径`}>
    <p className="market-overview__note">本城日度批发观测尚未接入。</p>
  </section>;
  const ready = state.status === 'ready' ? state.data : null;
  const rows = ready ? latestMarketRows(ready.crops) : [];
  return <section className="market-overview" aria-label="沈阳批发市场">
    <div className="market-overview__head"><h2>沈阳批发市场</h2><button type="button" className="market-overview__refresh" onClick={refresh} disabled={refreshing}>{refreshing ? '读取中…' : '刷新'}</button></div>
    {state.status === 'loading' && <p role="status" className="market-overview__note">读取最新观测…</p>}
    {state.status === 'error' && <p role="alert" className="market-overview__note">{state.error}</p>}
    {ready && <>
      <p className="market-overview__date">观测截至 <time dateTime={ready.latestDataDate ?? undefined}>{ready.latestDataDate ?? '日期未发布'}</time></p>
      <div className="market-overview__periods" role="group" aria-label="价格变化口径">{PERIODS.map(([key, label]) => <button type="button" key={key} aria-pressed={period === key} onClick={() => setPeriod(key)}>{label}</button>)}</div>
      {rows.length ? <ul className="market-overview__prices">{rows.map(row => <PriceRow key={row.crop} row={row} period={period} latestDate={ready.latestDataDate}/>)}</ul> : <p className="market-overview__note">最近快照没有可核验的价格观测。</p>}
      <p className="market-overview__unit">批发价 · 元 / 公斤</p>
      <details className="market-overview__details"><summary>全部品种与来源</summary>
        <p className="market-overview__note">首屏按已发布的 7 日变幅排列。</p>
        <ul className="market-overview__prices">{latestMarketRows(ready.crops, ready.crops.length).map(row => <PriceRow key={row.crop} row={row} period={period} latestDate={ready.latestDataDate}/>)}</ul>
        {ready.sources.map(source => <a className="market-overview__source" key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.name} ↗</a>)}
        <dl className="market-overview__publication"><div><dt>快照生成</dt><dd>{ready.sourceMeta.generatedAt}</dd></div><div><dt>最近采集尝试</dt><dd>{ready.sourceMeta.collectionAttemptAt??'未独立登记'} · {ready.sourceMeta.collectionStatus==='SKIPPED'?'跳过采集':ready.sourceMeta.collectionStatus==='FAILED'?'采集失败':ready.sourceMeta.collectionStatus==='OK'?'采集成功':'状态未登记'}</dd></div><div><dt>采集完成</dt><dd>{ready.sourceMeta.collectedAt??'未独立登记'}</dd></div><div><dt>运行时发布</dt><dd>{ready.sourceMeta.runtimePublishedAt??'未登记'}</dd></div><div><dt>模型报告生成</dt><dd>{ready.sourceMeta.modelReportGeneratedAt??'未登记'}</dd></div></dl>
      </details>
    </>}
    {refreshError && <p role="status" className="market-overview__refresh-error">刷新失败，仍显示以上日期的观测。{refreshError}</p>}
  </section>;
}
function PriceRow({ row, period, latestDate }: { row: DailyCrop; period: Period; latestDate: string | null }) {
  const change = row[period];
  return <li className="market-overview__price" data-source-id={row.sourceId} data-observed-at={row.dataDate}>
    <span className="market-overview__crop">{row.crop}{row.dataDate !== latestDate && <small>{row.dataDate}</small>}</span>
    <strong>{row.pricePerKg === null ? '—' : price.format(row.pricePerKg)}</strong>
    <span className="market-overview__change" data-direction={change === null || change === 0 ? 'flat' : change > 0 ? 'up' : 'down'}>{dailyChangeText(change)}</span>
  </li>;
}
