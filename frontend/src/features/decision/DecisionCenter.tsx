/**
 * 决策中心首屏（Frontend V3 §10–§14）。
 *
 * 回答四件事 + 一个为什么：
 *   现在怎么样（daily 当前市场状态）/ 未来怎么样（短期 7·14·30 与长期 30–180）/
 *   风险是什么（§14 风险剖面）/ 我应该关注什么（§13 作物比较）/ 为什么（Evidence Drawer）。
 *
 * 红线：所有数字来自真实端点；判断句由规则模板拼装；不足就如实显示
 * INSUFFICIENT_MARKET_DATA；长期与短期语义分区；不给作物评分、不排名、不推荐。
 */
import { useState } from 'react';
import { TransitionLink } from '../../app/pageNavigation';
import { ROUTES } from '../../app/routes';
import { getCity } from '../../domain/geography/cities';
import type { DecisionRequest } from '../../domain/decision/types';
import type { DailySnapshot } from '../../domain/daily/types';
import { EvidenceDrawer, type EvidenceContext } from '../evidence/EvidenceDrawer';
import { dailyRowFor, LONG_HORIZONS, SHORT_HORIZONS, useDecisionCenter, type CompareRow, type LongRow, type ShortRow } from './useDecisionCenter';
import {
  buildRiskProfile, compareConclusion, confidenceBand, evidenceStatus, forecastDirection, historyAnchors,
  judgmentSentence, marketState, riskBandFromScore,
  COMPARE_LABELS, CONFIDENCE_LABEL, EVIDENCE_LABEL, FORECAST_LABEL, LONG_CERTAINTY_LABEL, MARKET_STATE_LABEL, RISK_LABEL,
  type CompareLabel, type RiskItem,
} from './centerModel';
import { ForecastChart, HorizonSpread, LongBands } from './centerCharts';
import { formatNumber } from './DecisionVisuals';
import './decision.css';

const UNIT = '元/kg';
const n2 = (value: number | null | undefined) => value === null || value === undefined ? '—' : formatNumber(value);
const pctText = (value: number | null | undefined) => value === null || value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;

function relativeWidth(row: ShortRow | undefined): number | null {
  if (!row || row.low === null || row.high === null || row.mid === null || row.mid <= 0) return null;
  return (row.high - row.low) / row.mid;
}

export function DecisionCenter({ cityId, savedRequest, onAdjustConditions }: {
  cityId: string; savedRequest: DecisionRequest | null; onAdjustConditions: () => void;
}) {
  const city = getCity(cityId);
  const [crop, setCrop] = useState('');
  const [shortHorizon, setShortHorizon] = useState<number>(7);
  const [longHorizon, setLongHorizon] = useState<number>(90);
  const [drawer, setDrawer] = useState<{ open: boolean; context: EvidenceContext }>({ open: false, context: { cityId } });

  const saved = savedRequest && savedRequest.contract_version === '1' ? savedRequest : null;
  const { capabilities, daily, short, longRows, compare, marketAsOf, activeCrop } = useDecisionCenter(cityId, crop, saved);

  const supportedCrops = capabilities.data?.crops ?? [];
  const activeDaily = dailyRowFor(daily.data, activeCrop);
  const shortState = short[shortHorizon];
  const shortData = shortState?.status === 'ready' ? shortState.data : undefined;

  const openEvidence = (topic: string, horizon?: number) => setDrawer({
    open: true, context: { cityId, crop: activeCrop || undefined, horizon: horizon ?? shortHorizon, topic },
  });

  if (!city) return null;

  if (capabilities.status === 'error') {
    return <section className="ag-state" role="alert">
      <h1 className="ag-section-title">决策数据暂时无法加载</h1>
      <p>{capabilities.error}</p>
      <p className="decision-note">这里不会显示任何备用数字，请稍后重试。</p>
    </section>;
  }
  if (capabilities.status !== 'ready') {
    return <section className="center-loading" role="status" aria-busy="true">
      <h1 className="ag-section-title">读取{city.shortName}的决策数据</h1>
      <div className="ag-state ag-state--loading" aria-hidden="true"><i className="ag-skeleton"/><i className="ag-skeleton"/><i className="ag-skeleton"/></div>
    </section>;
  }

  const capability = capabilities.data;
  if (!capability) return null;
  if (!capability.supported || !supportedCrops.length || !marketAsOf) {
    return <section className="center-insufficient" role="status">
      <p className="ag-label">INSUFFICIENT_MARKET_DATA</p>
      <h1 className="ag-section-title">{city.shortName}的决策数据待接入</h1>
      <p className="decision-note">{capability.limitation ?? '这个城市暂时没有与沈阳同一价格口径的可用市场数据，因此不提供模型判断，也不做回退估算。'}</p>
      <dl className="decision-detail__facts">
        <div><dt>能力层级</dt><dd>{capability.tier}</dd></div>
        <div><dt>市场数据日期</dt><dd>{capability.market_as_of ?? '未就绪'}</dd></div>
        <div><dt>模型版本</dt><dd>{capability.model_version}</dd></div>
      </dl>
      <p className="decision-actions"><TransitionLink to={ROUTES.city(cityId)} className="ag-button">返回{city.shortName}研究</TransitionLink></p>
    </section>;
  }

  const state = marketState(activeDaily?.historicalPercentile ?? null);
  const direction = forecastDirection(shortData?.mid ?? null, activeDaily?.pricePerKg ?? null);
  const risk = riskBandFromScore(shortData?.marketRisk ?? null);
  const hri = riskBandFromScore(shortData?.hri ?? null);
  const confidence = confidenceBand(shortData?.confidence ?? null);
  const evidence = evidenceStatus(shortData?.calibrated ? 'prediction_interval' : 'scenario_range', shortData?.rangeStatus ?? null);

  const sentence = judgmentSentence({
    cityName: city.shortName, crop: activeCrop, horizon: shortHorizon, state,
    percentile: activeDaily?.historicalPercentile ?? null, direction, mid: shortData?.mid ?? null,
    low: shortData?.low ?? null, high: shortData?.high ?? null, unit: UNIT,
    risk, hri, confidence, evidence,
  });

  const profile = buildRiskProfile({
    marketRisk: shortData?.marketRisk ?? null, priceRelWidth: relativeWidth(shortData),
    climateExposure: shortData?.climateExposure ?? null, hri: shortData?.hri ?? null,
    confidence: shortData?.confidence ?? null, priceLow: shortData?.low ?? null, priceHigh: shortData?.high ?? null, unit: UNIT,
  });

  const anchors = activeDaily
    ? historyAnchors(activeDaily.pricePerKg, [
      { daysAgo: 1, relative: activeDaily.changePreviousObservation },
      { daysAgo: 7, relative: activeDaily.change7d },
      { daysAgo: 30, relative: activeDaily.change30d },
    ])
    : [];

  const spreadRows = SHORT_HORIZONS.map((h) => {
    const row = h === shortHorizon ? shortData : (short[h]?.status === 'ready' ? short[h].data : undefined);
    return { horizon: h, low: row?.low ?? null, high: row?.high ?? null, mid: row?.mid ?? null };
  });

  const longRowList: LongRow[] = LONG_HORIZONS.map((h) => {
    const resource = longRows[h];
    if (resource?.status === 'ready' && resource.data) return resource.data;
    return { horizon: h, point: null, low: null, high: null, productionStatus: 'unknown', confidence: null, rangeType: null };
  });
  const longLoading = LONG_HORIZONS.every((h) => longRows[h]?.status === 'loading');
  const longError = LONG_HORIZONS.map((h) => longRows[h]).find((resource) => resource?.status === 'error')?.error;

  return <>
    <header className="center-hero">
      <p className="ag-label">决策中心 · {city.shortName}</p>
      <h1 className="ag-hero">现在怎么样，未来会怎样。</h1>
      <p className="decision-note">数据基准 {marketAsOf} · 模型 {capability.model_version} · 数据版本 {capability.data_version} · 日度快照 {daily.data?.sourceMeta.snapshotHash?.slice(0, 8) ?? '—'}</p>
      <div className="center-selectors">
        <label>城市<input name="center-city" value={city.shortName} readOnly aria-readonly="true" aria-label="当前城市"/></label>
        <label>作物<select name="center-crop" aria-label="选择作物" value={activeCrop} onChange={(e) => setCrop(e.target.value)}>
          {supportedCrops.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
        <label>短期周期<select name="center-short-horizon" aria-label="选择短期周期" value={shortHorizon} onChange={(e) => setShortHorizon(Number(e.target.value))}>
          {SHORT_HORIZONS.map((h) => <option key={h} value={h}>{h} 天</option>)}
        </select></label>
      </div>
    </header>

    <section className="center-judgment" aria-labelledby="center-judgment-title">
      <p className="ag-label" id="center-judgment-title">当前判断</p>
      {shortState?.status === 'error'
        ? <p className="center-judgment__sentence" role="alert">{shortState.error}</p>
        : <p className="center-judgment__sentence">{shortData ? sentence : '真实状态载入中'}</p>}
      <div className="center-judgment__facts">
        <div><span className="ag-label">当前价（{activeDaily?.dataDate ?? '—'}）</span><strong>{n2(activeDaily?.pricePerKg)}</strong><em>{UNIT}</em></div>
        <div><span className="ag-label">近 6 年分位</span><strong>{activeDaily?.historicalPercentile === null || activeDaily?.historicalPercentile === undefined ? '—' : `${(activeDaily.historicalPercentile * 100).toFixed(0)}%`}</strong></div>
        <div><span className="ag-label">7 日变化</span><strong>{pctText(activeDaily?.change7d)}</strong></div>
        <div><span className="ag-label">30 日变化</span><strong>{pctText(activeDaily?.change30d)}</strong></div>
      </div>
      <p className="decision-note">判断句由 market_state（分位）/ forecast_direction（中心值 vs 当前价）/ risk_band（市场风险、HRI）/ confidence / evidence_status 经固定模板拼装，不调用在线 LLM。</p>
      <button type="button" className="ag-button" onClick={() => openEvidence('forecast')}>为什么？看这句结论的来源</button>
    </section>

    <section className="center-ops" aria-label="操作区">
      <button type="button" className="ag-button" onClick={onAdjustConditions}>调整条件</button>
      <TransitionLink to={ROUTES.scenario} className="ag-button">情景模拟</TransitionLink>
      <button type="button" className="ag-button ag-button--primary" onClick={() => openEvidence('forecast')}>为什么？</button>
    </section>

    <div className="center-divider" aria-hidden="true">
      <span className="center-divider__short">短期预测 ──── 7 / 14 / 30</span>
      <span className="center-divider__long">长期场景 ──── 30 / 60 / 90 / 120 / 150 / 180</span>
    </div>

    <section className="center-section" aria-labelledby="center-short-title">
      <header className="decision-section-head">
        <p className="ag-label">§11 短期预测 · 7 / 14 / 30</p>
        <h2 className="ag-title" id="center-short-title">未来价格参考：中心值与情景区间</h2>
      </header>
      <nav className="center-horizon-tabs" aria-label="短期周期">
        {SHORT_HORIZONS.map((h) => <button key={h} type="button" aria-pressed={shortHorizon === h} onClick={() => setShortHorizon(h)}>{h} 天</button>)}
      </nav>
      {shortState?.status === 'loading' && !shortData ? <div className="decision-plot__empty" role="status">读取 {shortHorizon} 天真实结果</div> : null}
      <ForecastChart anchors={anchors} horizon={shortHorizon} mid={shortData?.mid ?? null} low={shortData?.low ?? null} high={shortData?.high ?? null} unit={UNIT}
        label={`${city.shortName}${activeCrop}历史价格与${shortHorizon}天预测`}/>
      <p className="decision-note">
        {FORECAST_LABEL[direction]} · 中心 {n2(shortData?.mid)} {UNIT} · 区间 {n2(shortData?.low)}–{n2(shortData?.high)} · 更新 {marketAsOf} · 模型 {capability.model_version} · horizon {shortHorizon} 天 · {EVIDENCE_LABEL[evidence]}
      </p>
      <HorizonSpread unit={UNIT} rows={spreadRows}/>
      <p className="decision-note">切换 7 / 14 / 30 只更新本区块的图表与读数，不重载整页；区间与中心值都来自对应跨度的真实模型输出。</p>
    </section>

    <section className="center-section center-section--long" aria-labelledby="center-long-title">
      <header className="decision-section-head">
        <p className="ag-label">§12 长期场景 · 30 / 60 / 90 / 120 / 150 / 180</p>
        <h2 className="ag-title" id="center-long-title">长期上市窗口的行情场景</h2>
        <p className="center-long-fixed">用于种植与上市周期参考，不等同于短期生产预测。</p>
      </header>
      <nav className="center-horizon-tabs" aria-label="长期周期">
        {LONG_HORIZONS.map((h) => <button key={h} type="button" aria-pressed={longHorizon === h} onClick={() => setLongHorizon(h)}>{h} 天</button>)}
      </nav>
      {longError
        ? <p className="decision-note" role="alert">{longError}</p>
        : longLoading
          ? <div className="decision-plot__empty" role="status">读取长期情景</div>
          : <LongBands rows={longRowList} unit={UNIT} selected={longHorizon} onSelect={setLongHorizon}/>}
      <p className="decision-note">150 / 180 天为探索性结果（production_status = EXPLORATORY_SCENARIO_ONLY），已降低视觉确定性，不装成精确答案。长期结果只读取预生成快照，不触发训练或采集。</p>
      <button type="button" className="ag-button" onClick={() => openEvidence('long-horizon', longHorizon)}>为什么？看长期依据</button>
    </section>

    <section className="center-section" aria-labelledby="center-compare-title">
      <header className="decision-section-head">
        <p className="ag-label">§13 作物比较</p>
        <h2 className="ag-title" id="center-compare-title">同一市场环境下，谁更值得关注</h2>
        <p className="decision-note">结论仅取「{COMPARE_LABELS.join(' / ')}」五个词，由真实档位判定；不做评分、不排名、不推荐具体种什么。</p>
      </header>
      {compare.status === 'error'
        ? <p className="decision-note" role="alert">{compare.error}</p>
        : compare.status !== 'ready'
          ? <div className="decision-plot__empty" role="status">读取作物长期对比</div>
          : <CompareTable crops={supportedCrops.map((c) => c.id)} compare={compare.data ?? []} daily={daily.data}
              onWhy={(cropId) => setDrawer({ open: true, context: { cityId, crop: cropId, horizon: 90, topic: 'compare' } })}/>}
    </section>

    <section className="center-section" aria-labelledby="center-risk-title">
      <header className="decision-section-head">
        <p className="ag-label">§14 风险剖面</p>
        <h2 className="ag-title" id="center-risk-title">风险不是一个数</h2>
        <p className="decision-note">横向拆成五个条，每一个都对应一个真实字段；点击展开来源、真实数值与研究链接。</p>
      </header>
      <RiskProfile items={profile} onWhy={(item) => openEvidence(`risk:${item.id}`)} researchHref={(id) => ROUTES.research(cityId, id)}/>
    </section>

    <p className="decision-boundary">
      决策中心只呈现真实模型与快照结果，不做回退估算。短期（7/14/30）与长期（30–180）语义分区，两者不可混为一谈；
      情景区间未校准为概率区间，长期结果不能当作短期生产预测使用。
    </p>

    <EvidenceDrawer open={drawer.open} onClose={() => setDrawer((previous) => ({ ...previous, open: false }))} context={drawer.context}/>
  </>;
}

function RiskProfile({ items, onWhy, researchHref }: { items: RiskItem[]; onWhy: (item: RiskItem) => void; researchHref: (id: string) => string }) {
  const [open, setOpen] = useState<string | null>(null);
  return <ul className="center-risk" aria-label="风险剖面">
    {items.map((item) => {
      const expanded = open === item.id;
      return <li key={item.id} className="center-risk__item" data-band={item.band}>
        <button type="button" className="center-risk__head" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : item.id)}>
          <span className="center-risk__label">{item.label}</span>
          <span className="center-risk__value">{item.value}</span>
          <span className="center-risk__band">{RISK_LABEL[item.band]}</span>
        </button>
        <div className="center-risk__track" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, item.width))}%` }}/></div>
        {expanded && <div className="center-risk__detail">
          <p className="decision-note">{item.why}</p>
          <dl className="decision-detail__facts">
            {item.sources.map((source) => <div key={source.label}><dt>{source.label}</dt><dd>{source.value}</dd></div>)}
          </dl>
          <p className="decision-actions">
            <TransitionLink to={researchHref(item.researchId)} className="ag-button">研究依据：{item.researchLabel} →</TransitionLink>
            <button type="button" className="ag-button" onClick={() => onWhy(item)}>为什么？</button>
          </p>
        </div>}
      </li>;
    })}
  </ul>;
}

function CompareTable({ crops, compare, daily, onWhy }: {
  crops: string[]; compare: CompareRow[]; daily: DailySnapshot | undefined; onWhy: (crop: string) => void;
}) {
  return <div className="center-compare" role="group" aria-label="作物比较">
    <div className="center-compare__head" aria-hidden="true">
      <span>作物</span><span>市场环境</span><span>价格风险</span><span>数据支持</span><span>生产集中风险</span><span>长期不确定性</span><span>结论</span>
    </div>
    <ul className="center-compare__rows">
      {crops.map((cropName) => {
        const day = dailyRowFor(daily, cropName);
        const cmp = compare.find((item) => item.crop === cropName);
        const risk = riskBandFromScore(day?.marketRisk ?? null);
        const hri = riskBandFromScore(day?.hri ?? null);
        const conf = confidenceBand(day?.confidence ?? null);
        const dir = cmp?.direction ?? 'unknown';
        const lc = cmp?.longCertainty ?? 'unknown';
        const conclusion: CompareLabel = compareConclusion({ hasData: Boolean(day) && Boolean(cmp), direction: dir, risk, hri, confidence: conf, longCertainty: lc });
        return <li key={cropName} data-conclusion={conclusion}>
          <span className="center-compare__crop">{cropName}</span>
          <span>{MARKET_STATE_LABEL[marketState(day?.historicalPercentile ?? null)]}</span>
          <span>{RISK_LABEL[risk]}</span>
          <span>{CONFIDENCE_LABEL[conf]}</span>
          <span>{RISK_LABEL[hri]}</span>
          <span>{LONG_CERTAINTY_LABEL[lc]}</span>
          <span className="center-compare__conclusion">{conclusion}
            <button type="button" className="center-compare__why" aria-label={`${cropName} 结论为什么`} onClick={() => onWhy(cropName)}>为什么？</button>
          </span>
        </li>;
      })}
    </ul>
  </div>;
}