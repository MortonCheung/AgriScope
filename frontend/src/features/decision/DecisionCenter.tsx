import { useState } from 'react';
import { ChoiceButtons } from '../../components/controls/ChoiceButtons';
import type { MarketSeries } from '../../domain/market/types';
import { getCity } from '../../domain/geography/cities';
import { WorkbenchMain, WorkbenchRail } from '../../components/workbench/WorkbenchLayout';
import type { MarketObservationState } from './useMarketObservation';
import { formatNumber } from './DecisionVisuals';

const PRICE_LEVEL = { wholesale: '批发价格', market_average: '监测均价' } as const;

/** 市场观察只呈现正式历史序列；预测与经营条件留在各自模块。 */
export function DecisionCenter({ cityId, observation, onCrop, onPlanning }: {
  cityId: string; observation: MarketObservationState; onCrop: (crop: string) => void; onPlanning: () => void;
}) {
  const [selection, setSelection] = useState('');
  const data = observation.status === 'ready' ? observation.data : undefined;
  const series = data?.series.find(row => row.id === selection) ?? data?.series[0];
  const latest = series?.observations.at(-1);
  const previous = series?.observations.at(-2);
  const change = latest && previous ? latest.pricePerKg / previous.pricePerKg - 1 : null;
  return <>
    <WorkbenchMain label="市场观察操作">
      <h1 className="workbench__title">市场观察</h1>
      {observation.status === 'loading' && <p role="status" aria-busy="true">读取本城已发布市场观测…</p>}
      {observation.status === 'error' && <div role="alert"><p>{observation.error}</p><button type="button" className="ag-button" onClick={observation.retry}>重试市场观测</button></div>}
      {data && !data.available && <div role="status"><p>该城市尚未发布同口径市场价格序列。</p><button type="button" className="ag-button" onClick={onPlanning}>使用经营计划</button></div>}
      {data?.available && <>
        <ChoiceButtons label="观察作物" value={data.selectedCrop ?? ''} onChange={crop => { setSelection(''); onCrop(crop); }} options={data.crops.map(crop => ({ value: crop, label: crop }))}/>
        {data.series.length > 1 && <div className="market-observation__series" role="group" aria-label="市场观测序列">{data.series.map(row => <button type="button" key={row.id} aria-pressed={row.id === series?.id} onClick={() => setSelection(row.id)}>{row.productName} · {row.marketName}<small>{row.source.name} · {PRICE_LEVEL[row.priceLevel]}</small></button>)}</div>}
        {series && <>
          <h2 className="ag-title">{series.productName} · {series.marketName}</h2>
          <p className="decision-note">{PRICE_LEVEL[series.priceLevel]} · {data.unit} · {series.observations[0].date} 至 {latest?.date}</p>
          <MarketHistoryChart series={series} />
          <details className="decision-disclosure"><summary>查看原始观测读数</summary><div className="planning-table-scroll"><table><caption>{series.productName} · {series.marketName}（{data.unit}）</caption><thead><tr><th>观测日期</th><th>价格</th></tr></thead><tbody>{series.observations.map(point => <tr key={point.date}><th scope="row">{point.date}</th><td>{formatNumber(point.pricePerKg)}</td></tr>)}</tbody></table></div></details>
        </>}
      </>}
    </WorkbenchMain>
    <WorkbenchRail>
      <p className="ag-label">{getCity(cityId)?.shortName} · 历史观测</p>
      {series && latest ? <>
        <h2 className="ag-title">{series.productName}</h2>
        <dl className="decision-detail__facts">
          <div><dt>最近观测价格</dt><dd>{formatNumber(latest.pricePerKg)} 元/kg</dd></div>
          <div><dt>实际观测日期</dt><dd>{latest.date}</dd></div>
          <div><dt>市场</dt><dd>{series.marketName}</dd></div>
          <div><dt>价格口径</dt><dd>{PRICE_LEVEL[series.priceLevel]}</dd></div>
          {change !== null && <div><dt>较上次观测（{previous?.date}）</dt><dd>{change > 0 ? '+' : ''}{(change * 100).toFixed(1)}%</dd></div>}
        </dl>
        <details className="decision-disclosure"><summary>方法与数据</summary><p className="decision-note">来源：{series.source.url ? <a href={series.source.url} target="_blank" rel="noreferrer noopener">{series.source.name} ↗</a> : series.source.name}</p>
        <p className="decision-note">不同市场与价格口径分别观察，曲线连接已有读数，不补造缺失日期。</p>
        <p className="decision-note">快照 {data?.snapshotVersion ?? '未提供版本'}；日期来自各序列的实际观测。</p>{series.notes.map(note => <p className="decision-note" key={note}>{note}</p>)}</details>
      </> : <p className="decision-note">{observation.status === 'loading' ? '等待本城观测。' : observation.status === 'error' ? '连接恢复后显示真实价格。' : '可在经营计划中使用自己的销售价格假设。'}</p>}
    </WorkbenchRail>
  </>;
}

function MarketHistoryChart({ series }: { series: MarketSeries }) {
  const points = series.observations;
  const times = points.map(point => Date.parse(`${point.date}T00:00:00Z`));
  const start = times[0]; const end = times.at(-1)!;
  const prices = points.map(point => point.pricePerKg);
  const low = Math.min(...prices); const high = Math.max(...prices);
  const pad = high === low ? Math.max(high * .05, .1) : (high - low) * .1;
  const min = Math.max(0, low - pad); const max = high + pad;
  const x = (time: number) => 64 + (time - start) / (end - start || 1) * 576;
  const y = (price: number) => 230 - (price - min) / (max - min) * 190;
  return <div className="market-observation__chart"><svg viewBox="0 0 680 290" role="img" aria-label={`${series.productName}在${series.marketName}的真实历史价格，单位元/kg`}>
    <text x="10" y="18">元/kg</text>
    {[min, (min + max) / 2, max].map(value => <g key={value}><line className="planning-chart__grid" x1="64" x2="640" y1={y(value)} y2={y(value)} /><text x="56" y={y(value) + 4} textAnchor="end">{formatNumber(value)}</text></g>)}
    <polyline className="market-observation__line" fill="none" points={points.map((point, index) => `${x(times[index])},${y(point.pricePerKg)}`).join(' ')} />
    {points.map((point, index) => <circle key={point.date} className="market-observation__point" cx={x(times[index])} cy={y(point.pricePerKg)} r="2"><title>{point.date}：{formatNumber(point.pricePerKg)} 元/kg</title></circle>)}
    <text x="64" y="264">{points[0].date}</text><text x="640" y="264" textAnchor="end">{points.at(-1)!.date}</text>
  </svg></div>;
}
