import type { LongHorizonEntry, LongHorizonStatus } from '../../domain/longHorizon/types';
import { useLongHorizon } from './useLongHorizon';
import './longHorizon.css';

const STATUS_LABELS: Record<LongHorizonStatus, string> = {
  PRODUCTION_POINT: '正式长期估计',
  SCENARIO_ONLY: '仅情景参考',
  EXPLORATORY_SCENARIO_ONLY: '探索级情景',
};
const SOURCE_LABELS: Record<LongHorizonEntry['source'], string> = {
  seasonal: '季节统计', long_horizon_model: '长期统计模型', scenario_only: '情景化',
};
const decimal = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const money = (v: number | null) => (v === null ? '—' : `${decimal.format(v)} 元/kg`);

/** 长期（60–180 天窗口均价）情景面板：只读预生成快照，不做点位承诺。 */
export function LongHorizonPanel({ cityId, crop }: { cityId: string; crop?: string }) {
  const state = useLongHorizon(cityId, crop ?? '');
  if (state.status === 'unsupported') return null;
  if (state.status === 'loading') {
    return <section className="long-horizon" aria-label="长期情景" aria-busy="true">
      <p className="long-horizon__label">长期情景</p>
      <span className="long-horizon__pending">读取长期预测快照</span>
    </section>;
  }
  if (state.status === 'error') {
    return <section className="long-horizon" aria-label="长期情景">
      <p className="long-horizon__label">长期情景</p>
      <p className="long-horizon__pending" role="status">长期预测暂时无法加载</p>
    </section>;
  }
  const { data, capability } = state;
  const statusLabel = STATUS_LABELS[data.productionStatus];
  const rangeNote = data.rangeType === 'prediction_interval'
    ? '区间经覆盖校准，可作预测区间参考。'
    : '区间为情景范围，未校准为概率区间。';
  return <section className="long-horizon" aria-label={`${data.crop}长期情景`}
    data-status={data.productionStatus}>
    <header className="long-horizon__head">
      <p className="long-horizon__label">长期情景 · {data.horizon} 天窗口均价</p>
      <p className="long-horizon__status">{statusLabel}{data.fallbackUsed ? ' · 降级回退' : ''}</p>
    </header>
    {!data.available
      ? <p className="long-horizon__pending">该窗口暂时没有可用估计。</p>
      : <ul className="long-horizon__rows">
        <li><span>下行</span><span>{money(data.rangeLow)}</span></li>
        <li><span>基准</span><span>{money(data.pointForecast)}</span></li>
        <li><span>上行</span><span>{money(data.rangeHigh)}</span></li>
      </ul>}
    <p className="long-horizon__meta">
      来源 {SOURCE_LABELS[data.source]}{data.modelDisagreementPct === null ? '' : ` · 模型分歧 ${decimal.format(data.modelDisagreementPct)}%`}
      {capability.horizons.length > 1 ? ` · 可选 ${capability.horizons.map(h => `${h.days}天`).join('/')}` : ''}
    </p>
    <p className="long-horizon__note">
      {data.horizon} 天窗口均价的情景化估计，不是第 {data.horizon} 天的点位承诺；{rangeNote}
      {data.productionStatus !== 'PRODUCTION_POINT' ? '该档位未通过正式生产门禁。' : ''}
    </p>
  </section>;
}