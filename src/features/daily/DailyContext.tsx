import { findDailyCrop } from '../../domain/daily/adapter';
import type { DailyCrop, DailyFreshness, DailySignal } from '../../domain/daily/types';
import { useDaily } from './useDaily';
import './daily.css';

const SIGNAL_LABELS: Record<DailySignal, string> = { NORMAL: '常态', WATCH: '留意', HIGH: '偏高', VERY_HIGH: '高度关注', UNKNOWN: '信号待评估' };
const FRESHNESS_LABELS: Record<DailyFreshness, string> = { FRESH: '', DELAYED: '发布延迟', STALE: '数据较旧', MISSING: '近期数据缺失' };
const decimal = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
export function dailyChangeText(value: number | null): string { return value === null ? '—' : percent.format(value); }
function dateLabel(date: string | null): string { return date ? `${date.slice(0, 4)}年${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日` : '日期待补充'; }

export function DailyContext({ cityId, crop }: { cityId: string; crop?: string }) {
  const state = useDaily(cityId);
  if (state.status === 'unsupported') return null;
  if (state.status === 'loading') return <section className="daily-context" aria-label="最新市场" aria-busy="true"><p className="daily-context__label">最新市场</p><span className="daily-context__pending">读取官方日度数据</span></section>;
  if (state.status === 'error') return <section className="daily-context" aria-label="最新市场"><p className="daily-context__label">最新市场</p><p className="daily-context__pending" role="status">市场数据暂时无法加载</p></section>;
  const snapshot = state.data;
  const matching = crop ? findDailyCrop(snapshot, crop) : null;
  // These are already-published attention signals, not a crop recommendation or score.
  const attention = snapshot.crops.filter(item => item.signal && ['WATCH', 'HIGH', 'VERY_HIGH'].includes(item.signal));
  const visible = crop ? matching ? [matching] : [] : (attention.length ? attention : snapshot.crops).slice(0, 3);
  const freshness = matching?.freshness ?? snapshot.freshness;
  const legacy = snapshot.sourceMeta.modelStatus === 'LEGACY_FALLBACK' || visible.some(item => item.modelStatus === 'LEGACY_FALLBACK');
  const date = matching?.dataDate ?? snapshot.latestDataDate;
  return <section className="daily-context" aria-label={crop ? `${crop}最新市场` : '最新市场'} data-freshness={freshness}>
    <header className="daily-context__head"><p className="daily-context__label">最新市场</p><p className="daily-context__date">数据截至 {dateLabel(date)}{FRESHNESS_LABELS[freshness] && <span> · {FRESHNESS_LABELS[freshness]}</span>}</p></header>
    {!visible.length ? <p className="daily-context__pending">{crop ? `${crop}的每日市场数据暂未接入` : '暂无可用市场记录'}</p> : <>
      <ul className="daily-context__rows">{visible.map(item => <li key={item.crop}><span className="daily-context__crop">{item.crop}</span><span>{item.pricePerKg === null ? '价格待补充' : `${decimal.format(item.pricePerKg)} 元/kg`}</span><span className="daily-context__signal">{legacy ? '历史信号 · ' : ''}{SIGNAL_LABELS[item.signal ?? 'UNKNOWN']}</span></li>)}</ul>
      <p className="daily-context__source">官方批发观测；市场信号为发布时的{legacy ? '历史模型' : '模型'}评估。</p>
      <details className="daily-context__details"><summary>查看近期变化</summary>
        {visible.map(item => <Trend key={item.crop} crop={item} dated={date} />)}
        {snapshot.sources.map(source => <a className="daily-context__source-link" key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.name} ↗</a>)}
      </details>
    </>}
  </section>;
}

function Trend({ crop, dated }: { crop: DailyCrop; dated: string | null }) {
  return <div className="daily-context__trend">
    <p className="daily-context__trend-label">{crop.crop}{crop.dataDate !== dated ? ` · 数据截至 ${dateLabel(crop.dataDate)}` : ''}</p>
    <dl><div><dt>前一观测</dt><dd>{dailyChangeText(crop.changePreviousObservation)}</dd></div><div><dt>7 日变化</dt><dd>{dailyChangeText(crop.change7d)}</dd></div><div><dt>30 日变化</dt><dd>{dailyChangeText(crop.change30d)}</dd></div></dl>
  </div>;
}
