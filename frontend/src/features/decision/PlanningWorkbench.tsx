import { useEffect, useId, useLayoutEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { isKnownCrop, readContextFromSearch, useAppContext, writeContextToSearch } from '../../app/context/appContext';
import { STUDY_CITY_IDS, getCity } from '../../domain/geography/cities';
import { useObservations } from '../../domain/observations/useObservations';
import type { CityObservation, ClimateYear } from '../../domain/observations/types';
import {
  PLANNING_FIELDS, SENSITIVITY_CHANGES, calculatePlanning, emptyPlanningDraft,
  planningSensitivity, readPlanningSession, samePlanningDraft, updatePlanningDraft, validatePlanningDraft, writePlanningSession,
  type PlanningClimateMetric, type PlanningDraft, type PlanningResult, type PlanningSession, type SensitivityLine,
} from '../../domain/decision/planning';
import { EvidenceDrawer, type EvidenceContext } from '../evidence/EvidenceDrawer';
import { WorkbenchMain, WorkbenchRail } from '../../components/workbench/WorkbenchLayout';
import { ChoiceButtons } from '../../components/controls/ChoiceButtons';
import './planning.css';

export interface PlanningWorkbenchProps { cityId: string }
const number = (n: number, digits = 2) => n.toLocaleString('zh-CN', { maximumFractionDigits: digits });
const value = (n: number | null, unit: string) => n === null ? '无法计算' : `${number(n)} ${unit}`;
const CUSTOM = '__custom__';
const draftFor = (session: PlanningSession, crop: string) => Object.prototype.hasOwnProperty.call(session.drafts, crop) ? session.drafts[crop] : emptyPlanningDraft();

/** 城市切换重新挂载内部表单，防止旧城市结果在新城市出现一帧。 */
export function PlanningWorkbench({ cityId }: PlanningWorkbenchProps) {
  const observations = useObservations();
  if (!(STUDY_CITY_IDS as readonly string[]).includes(cityId)) return <p role="alert">经营工具目前只开放给六城研究区。</p>;
  const observation = observations.status === 'ready' ? observations.data.cities.find(c => c.city_id === cityId) : undefined;
  return <PlanningCity key={cityId} cityId={cityId} observation={observation} observationStatus={observations.status} observationError={observations.status === 'error' ? observations.error : undefined}/>;
}

function PlanningCity({ cityId, observation, observationStatus, observationError }: {
  cityId: string; observation?: CityObservation; observationStatus: string; observationError?: string;
}) {
  const city = getCity(cityId)!;
  const id = useId();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  // 订阅上下文供显式导航生成四要素链接；URL 写入仅由下面的用户操作负责。
  useAppContext();
  const [session, setSession] = useState(() => {
    const saved = readPlanningSession(cityId);
    const context = readContextFromSearch(params.toString());
    const pathCity = /^\/cities\/([^/]+)/.exec(location.pathname)?.[1];
    const requested = pathCity === cityId || !context.cityId || context.cityId === cityId ? context.crop : null;
    if (!requested) return saved;
    return { ...saved, activeCrop: saved.activeCrop === CUSTOM && saved.customCrop.trim() === requested ? CUSTOM : requested };
  });
  const [submitted, setSubmitted] = useState(false);
  const [drawer, setDrawer] = useState<{ open: boolean; context: EvidenceContext }>({ open: false, context: { cityId } });
  useEffect(() => writePlanningSession(cityId, session), [cityId, session]);
  const productionCrops = observation?.production.items.map(item => item.crop) ?? [];
  const listedCrop = productionCrops.includes(session.activeCrop);
  useLayoutEffect(() => {
    const context=readContextFromSearch(params.toString());
    const pathCity=/^\/cities\/([^/]+)/.exec(location.pathname)?.[1];
    const requested=(!context.cityId || context.cityId===cityId || pathCity===cityId) ? context.crop : undefined;
    const metric=params.get('metric');
    if(metric && ['precipitation_mm','mean_temp_c','growing_season_precipitation_mm','growing_season_mean_temp_c'].includes(metric))setSession(previous=>previous.climateMetric===metric?previous:{...previous,climateMetric:metric as PlanningClimateMetric});
    if (requested) setSession(previous => previous.activeCrop === requested || (previous.activeCrop === CUSTOM && previous.customCrop.trim() === requested) ? previous : { ...previous, activeCrop: requested });
  }, [params]);
  const crop = session.activeCrop === CUSTOM ? session.customCrop.trim() : session.activeCrop;
  // 恢复本城会话时只投影到内存上下文，不由 effect 反写 URL。
  useLayoutEffect(() => {
    const state = useAppContext.getState();
    const requested = readContextFromSearch(params.toString());
    state.setCity(cityId); state.setCrop(isKnownCrop(crop) ? crop : null);
    if (requested.horizon !== undefined) state.setHorizon(requested.horizon);
    if (requested.asOf !== undefined) state.setAsOf(requested.asOf);
    // 城市表单重新挂载时恢复一次；后续用户事件显式同步，不设双向 effect。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId]);
  const draft = draftFor(session, crop);
  const validation = validatePlanningDraft(draft, crop);
  const result = validation.inputs ? calculatePlanning(validation.inputs) : null;
  const lines = validation.inputs ? planningSensitivity(validation.inputs) : null;
  const errors = { ...validation.errors, ...(crop && !isKnownCrop(crop) ? { crop: '作物名请使用 1–12 个汉字、字母、数字、中点或连字符。' } : {}), ...(validation.inputs && (!result || !lines) ? { calculation: '数值过大，无法完成有限数值核算，请缩小输入。' } : {}) };
  const calculatedDraft = Object.prototype.hasOwnProperty.call(session.calculatedDrafts, crop) ? session.calculatedDrafts[crop] : undefined;
  const restoredCalculation = calculatedDraft && samePlanningDraft(calculatedDraft, draft);
  const showResult = (submitted || restoredCalculation) && !errors.crop && result && lines;
  const baselineCheck = session.baseline ? validatePlanningDraft(session.baseline.draft, session.baseline.crop) : null;
  const baselineResult = baselineCheck?.inputs ? calculatePlanning(baselineCheck.inputs) : null;
  const openEvidence = (topic?: string) => setDrawer({ open: true, context: { cityId, crop: crop || undefined, topic } });
  const syncCropContext = (next: string) => {
    const state = useAppContext.getState();
    state.setCity(cityId); state.setCrop(isKnownCrop(next) ? next : null);
    setParams(previous => new URLSearchParams(writeContextToSearch(previous.toString(), { ...useAppContext.getState(), cityId })), );
  };
  const updateDraft = (key: keyof PlanningDraft, next: string) => {
    if (restoredCalculation) setSubmitted(true);
    setSession(previous => updatePlanningDraft(previous, crop, { ...draftFor(previous, crop), [key]: next }, Boolean(isKnownCrop(crop) && (submitted || Object.prototype.hasOwnProperty.call(previous.calculatedDrafts, crop)))));
  };
  const chooseCrop = (next: string) => {
    setSession(previous => ({ ...previous, activeCrop: next })); setSubmitted(false);
    syncCropContext(next === CUSTOM ? session.customCrop.trim() : next);
  };
  const calculate = () => {
    setSubmitted(true);
    if (!errors.crop && result && lines) setSession(previous => updatePlanningDraft(previous, crop, draft, true));
  };

  return <><WorkbenchMain label="经营计划操作"><div className="planning-workbench">
    <h1 className="workbench__title">经营计划</h1>
    <p className="decision-note">填写自己的条件，核算收入、成本与盈亏。</p>
      <form className="planning-form" noValidate onSubmit={event => { event.preventDefault(); calculate(); }} aria-label={`${city.shortName}经营条件`}>
        <h2 className="ag-title">我的条件</h2>
        <ChoiceButtons label="计划作物" value={session.activeCrop} onChange={chooseCrop} options={[
          ...productionCrops.map(name => ({ value: name, label: name })),
          ...(session.activeCrop && session.activeCrop !== CUSTOM && !listedCrop ? [{ value: session.activeCrop, label: `${session.activeCrop}（当前条件）` }] : []),
          { value: CUSTOM, label: '自定义作物' },
        ]}/>
        {session.activeCrop === CUSTOM && <label className="planning-field" htmlFor={`${id}-custom`}><span>作物名称</span><input id={`${id}-custom`} maxLength={12} value={session.customCrop} onChange={event => { setSession(previous => ({ ...previous, customCrop: event.target.value })); setSubmitted(false); syncCropContext(event.target.value.trim()); }}/></label>}
        {submitted && errors.crop && <p className="planning-error" role="alert">{errors.crop}</p>}
        <div className="planning-inputs">
          {PLANNING_FIELDS.map(({ key, label, unit }) => <label key={key} className="planning-field" htmlFor={`${id}-${key}`}>
            <span>{label}<small>{unit}</small></span>
            <input id={`${id}-${key}`} name={key} type="number" inputMode="decimal" min={key === 'areaMu' ? '0.01' : '0'} max={key === 'salePercent' ? '100' : undefined} step="any" value={draft[key]} onChange={event => updateDraft(key, event.target.value)} aria-invalid={submitted && Boolean(errors[key])} aria-describedby={submitted && errors[key] ? `${id}-${key}-error` : undefined}/>
            {submitted && errors[key] && <em id={`${id}-${key}-error`} className="planning-error" role="alert">{errors[key]}</em>}
          </label>)}
        </div>
        {submitted && errors.calculation && <p className="planning-error" role="alert">{errors.calculation}</p>}
        <button type="submit" className="ag-button ag-button--primary">核算我的计划</button>
      </form>

    {showResult && <section className="planning-section" aria-labelledby={`${id}-sensitivity`}>
      <header className="decision-section-head"><p className="ag-label">条件变化</p><h2 className="ag-title" id={`${id}-sensitivity`}>价格、亩产和成本，谁会改变盈亏</h2><p className="decision-note">分别将一项条件调整 −20% 至 +20%，其他条件保持不变。</p></header>
      <SensitivityChart lines={lines}/>
    </section>}
    {session.baseline && baselineResult && <section className="planning-section" aria-labelledby={`${id}-comparison`}>
      <header className="decision-section-head"><p className="ag-label">两方案比较</p><h2 className="ag-title" id={`${id}-comparison`}>方案 A 与当前方案</h2><p className="decision-note">方案 A 保存的是当时的输入条件。比较允许不同作物或规模，请结合这些差异阅读。</p></header>
      <details className="decision-disclosure"><summary>查看方案 A 完整比较</summary><Comparison baselineCrop={session.baseline.crop} baselineDraft={session.baseline.draft} baseline={baselineResult} crop={crop} draft={draft} current={showResult ? result : null}/></details>
      <button type="button" className="ag-button" onClick={() => setSession(previous => ({ ...previous, baseline: null }))}>移除方案 A</button>
    </section>}
    <details className="planning-background"><summary>本城生产与历史气候</summary><section className="planning-section" aria-labelledby={`${id}-observations`}>
      <header className="decision-section-head"><p className="ag-label">已有观测</p><h2 className="ag-title" id={`${id}-observations`}>{city.shortName}的农业结构与历史气候</h2><p className="decision-note">用于了解本地生产与气候背景，独立于上方用户情景。</p></header>
      {observationStatus === 'loading' ? <p role="status">农业观测载入中</p> : observationStatus === 'error' ? <p role="alert">{observationError} 仍可填写自定义作物完成核算。</p> : !observation ? <p>该城市暂无可用农业观测。</p> : <>
        <div className="planning-observations">
          <ProductionStructure observation={observation}/>
          <ClimateHistory observation={observation} metricKey={session.climateMetric} onMetricChange={climateMetric => {setSession(previous => ({ ...previous, climateMetric }));setParams(previous=>{const next=new URLSearchParams(previous);next.set('metric',climateMetric);return next;});}}/>
        </div>

      </>}
    </section></details>
    </div></WorkbenchMain>
    <WorkbenchRail>
      <section className="planning-result" aria-label="经营核算结果" aria-live="polite">
        <p className="ag-label">{city.shortName}</p><p className="ag-label">情景估算 · 用户假设</p>
        {showResult ? <>
          <h2 className="ag-title">{crop} · {number(validation.inputs!.areaMu)} 亩</h2>
          <ResultReadings result={result}/>
          <p className="decision-note">可销售数量 {number(result.soldKg)} kg。保本读数已计入销售比例；“无法计算”表示当前价格、亩产或销售比例为零。</p>
          <button type="button" className="ag-button" onClick={() => setSession(previous => ({ ...previous, baseline: { crop, draft: { ...draft } } }))}>保存为方案 A</button>
        </> : <div className="planning-empty"><h2 className="ag-title">从你的实际条件开始</h2><p className="decision-note">补全作物与五项条件后生成结果。观测面积不会自动成为你的亩产、成本或销售价格。</p></div>}
        <details className="decision-disclosure"><summary>方法与数据</summary>
          <p className="decision-note">输入均为用户假设。收入 = 面积 × 亩产 × 销售比例 × 价格；总成本 = 面积 × 每亩总成本。</p>
          <p className="decision-note">每亩总成本需包含全部计划支出；可销售比例扣除未出售部分。保本价格与亩产计入销售比例。</p>
          <p className="planning-boundary">公式核算不保证未来价格、产量或收益。敏感性幅度不代表事件发生概率；生产与历史气候观测只作背景，不参与上述核算。</p>
          <button type="button" className="ag-button" onClick={() => openEvidence()}>查看本城数据依据</button>
        </details>
      </section>
    </WorkbenchRail>
    <EvidenceDrawer open={drawer.open} onClose={() => setDrawer(previous => ({ ...previous, open: false }))} context={drawer.context}/>
  </>;
}

function ResultReadings({ result }: { result: PlanningResult }) {
  return <dl className="planning-readings">
    {[['销售收入', result.revenueCny, '元'], ['总成本', result.costCny, '元'], ['利润', result.profitCny, '元'], ['保本价格', result.breakEvenPrice, '元/kg'], ['保本亩产', result.breakEvenYield, 'kg/亩']].map(([label, n, unit]) => <div key={String(label)} data-negative={Number(n) < 0}><dt>{label}</dt><dd>{value(n as number | null, String(unit))}</dd></div>)}
  </dl>;
}

function SensitivityChart({ lines }: { lines: SensitivityLine[] }) {
  const all = lines.flatMap(line => line.points.map(point => point.profitCny));
  const low = Math.min(0, ...all); const high = Math.max(0, ...all);
  const span = high - low || 1;
  const x = (change: number) => 68 + (change + 20) / 40 * 590;
  const y = (n: number) => 220 - (n - low) / span * 185;
  return <div className="planning-chart">
    <svg viewBox="0 0 720 280" role="img" aria-label="价格、亩产、成本各变化正负20%时的利润敏感性">
      <text x="8" y="18">利润（元）</text>
      {[low, (low + high) / 2, high].map((n, index) => <g key={index}><line className="planning-chart__grid" x1="68" x2="658" y1={y(n)} y2={y(n)}/><text x="61" y={y(n) + 4} textAnchor="end">{number(n, 0)}</text></g>)}
      <line className="planning-chart__zero" x1="68" x2="658" y1={y(0)} y2={y(0)}/>
      {lines.map((line, index) => <g key={line.variable} className={`planning-chart__series planning-chart__series--${index}`}><polyline points={line.points.map(point => `${x(point.change)},${y(point.profitCny)}`).join(' ')}/>{line.points.map(point => <circle key={point.change} cx={x(point.change)} cy={y(point.profitCny)} r="3"><title>{line.label} {point.change}%：利润 {number(point.profitCny)} 元</title></circle>)}</g>)}
      {SENSITIVITY_CHANGES.map(change => <text key={change} x={x(change)} y="246" textAnchor="middle">{change > 0 ? '+' : ''}{change}%</text>)}
      <text x="365" y="271" textAnchor="middle">相对当前条件的变化幅度</text>
    </svg>
    <ul className="planning-legend" aria-label="敏感性图例">{lines.map((line, index) => <li key={line.variable} className={`planning-legend--${index}`}>{line.label}</li>)}</ul>
    <details><summary>查看各情景利润</summary><div className="planning-table-scroll"><table><caption>单项条件变化后的利润（元）</caption><thead><tr><th>变化项</th>{SENSITIVITY_CHANGES.map(change => <th key={change}>{change > 0 ? '+' : ''}{change}%</th>)}</tr></thead><tbody>{lines.map(line => <tr key={line.variable}><th scope="row">{line.label}</th>{line.points.map(point => <td key={point.change}>{number(point.profitCny)}</td>)}</tr>)}</tbody></table></div></details>
  </div>;
}

function Comparison({ baselineCrop, baselineDraft, baseline, crop, draft, current }: { baselineCrop: string; baselineDraft: PlanningDraft; baseline: PlanningResult; crop: string; draft: PlanningDraft; current: PlanningResult | null }) {
  const rows = [{ label: '收入', key: 'revenueCny', unit: '元' }, { label: '总成本', key: 'costCny', unit: '元' }, { label: '利润', key: 'profitCny', unit: '元' }, { label: '保本价格', key: 'breakEvenPrice', unit: '元/kg' }, { label: '保本亩产', key: 'breakEvenYield', unit: 'kg/亩' }] as const;
  return <div className="planning-table-scroll"><table aria-label="两方案经营结果比较"><thead><tr><th>条件 / 结果</th><th>方案 A · {baselineCrop}</th><th>当前 · {crop || '未选作物'}</th><th>当前 − A</th></tr></thead><tbody>
    {PLANNING_FIELDS.map(({ key, label, unit }) => <tr key={key}><th scope="row">{label}</th><td>{baselineDraft[key]} {unit}</td><td>{draft[key] ? `${draft[key]} ${unit}` : '未填写'}</td><td>—</td></tr>)}
    {rows.map(({ label, key, unit }) => <tr key={key}><th scope="row">{label}</th><td>{value(baseline[key], unit)}</td><td>{current ? value(current[key], unit) : '等待核算'}</td><td>{current && current[key] !== null && baseline[key] !== null ? value(current[key] - baseline[key], unit) : '—'}</td></tr>)}
  </tbody></table></div>;
}

function ProductionStructure({ observation }: { observation: CityObservation }) {
  const data = observation.production;
  const max = Math.max(1, ...data.items.map(item => item.area_ha));
  return <section className="planning-observation" aria-label="年度生产结构"><h3 className="ag-title">年度生产结构</h3>
    {!data.available ? <p>生产数据暂无可用来源。</p> : <><p className="decision-note">已发布年份 {data.period_start}–{data.period_end} · 以下为 {data.latest_year} 年面积（公顷）。</p>
      <ul className="planning-production">{data.items.map(item => <li key={item.crop}><div><span>{item.crop}</span><strong>{number(item.area_ha, 1)} 公顷{item.share === null ? '' : ` · ${(item.share * 100).toFixed(1)}%`}</strong></div><i aria-hidden="true" style={{ width: `${item.area_ha / max * 100}%` }}/></li>)}</ul>
      <p className="decision-note">横条按面积长度比较；仅在来源提供份额时显示百分比，不合计存在包含关系的类别。</p>
      {data.limitations.map(note => <p key={note} className="decision-note">{note}</p>)}</>}
  </section>;
}

const CLIMATE_METRICS = [
  { key: 'precipitation_mm', label: '全年降水', unit: 'mm' },
  { key: 'growing_season_precipitation_mm', label: '生长季降水', unit: 'mm' },
  { key: 'mean_temp_c', label: '全年平均气温', unit: '℃' },
  { key: 'growing_season_mean_temp_c', label: '生长季平均气温', unit: '℃' },
] as const;
function ClimateHistory({ observation, metricKey, onMetricChange }: { observation: CityObservation; metricKey: PlanningClimateMetric; onMetricChange: (key: PlanningClimateMetric) => void }) {
  const metric = CLIMATE_METRICS.find(item => item.key === metricKey)!;
  const series = [...observation.climate.series].sort((a, b) => a.year - b.year);
  const latest = series.find(year => year.year === observation.climate.complete_year);
  return <section className="planning-observation" aria-label="历史气候变化"><h3 className="ag-title">历史气候变化</h3>
    {!observation.climate.available || !series.length ? <p>历史气候暂无可用来源。</p> : <>
      <ChoiceButtons label="历史气候指标" value={metricKey} onChange={next => onMetricChange(next as typeof metricKey)} options={CLIMATE_METRICS.map(item => ({ value: item.key, label: item.label }))}/>

      <p className="decision-note">{observation.climate.period_start}–{observation.climate.period_end} 年 · 最新完整年 {observation.climate.complete_year}{latest ? ` · ${metric.label} ${number(latest[metricKey])} ${metric.unit}` : ''}</p>
      <ClimateChart series={series} metric={metric}/>
      <p className="decision-note">历史气候暴露背景，用于观察年际变化。再分析气候不代表气象站实测，不等于未来风险或灾害损失预测。</p>
      {observation.climate.limitations.map(note => <p key={note} className="decision-note">{note}</p>)}
    </>}
  </section>;
}
function ClimateChart({ series, metric }: { series: ClimateYear[]; metric: typeof CLIMATE_METRICS[number] }) {
  const values = series.map(year => year[metric.key]);
  const low = Math.min(...values); const high = Math.max(...values);
  const span = high - low || 1;
  const first = series[0].year; const last = series[series.length - 1].year;
  const x = (year: number) => 62 + (year - first) / (last - first || 1) * 390;
  const y = (n: number) => 178 - (n - low) / span * 137;
  return <div className="planning-chart"><svg viewBox="0 0 480 230" role="img" aria-label={`${first}至${last}年${metric.label}历史序列，单位${metric.unit}`}>
    <text x="8" y="18">{metric.label}（{metric.unit}）</text>
    {[low, (low + high) / 2, high].map((n, i) => <g key={i}><line className="planning-chart__grid" x1="62" x2="452" y1={y(n)} y2={y(n)}/><text x="55" y={y(n) + 4} textAnchor="end">{number(n, 1)}</text></g>)}
    <g className={`planning-chart__series planning-chart__series--${metric.unit === 'mm' ? 0 : 2}`}><polyline points={series.map(year => `${x(year.year)},${y(year[metric.key])}`).join(' ')}/>{series.map(year => <circle key={year.year} cx={x(year.year)} cy={y(year[metric.key])} r="2.5"><title>{year.year}：{number(year[metric.key])} {metric.unit}</title></circle>)}</g>
    {[first, Math.round((first + last) / 2), last].map(year => <text key={year} x={x(year)} y="205" textAnchor="middle">{year}</text>)}
  </svg><details><summary>查看年度观测值</summary><div className="planning-table-scroll"><table><caption>{metric.label}（{metric.unit}）</caption><thead><tr><th>年份</th><th>观测值</th></tr></thead><tbody>{series.map(year => <tr key={year.year}><th scope="row">{year.year}</th><td>{number(year[metric.key])}</td></tr>)}</tbody></table></div></details></div>;
}
