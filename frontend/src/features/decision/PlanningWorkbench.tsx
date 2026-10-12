import { useEffect, useId, useLayoutEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { isKnownCrop, readContextFromSearch, useAppContext, writeContextToSearch } from '../../app/context/appContext';
import { STUDY_CITY_IDS, getCity } from '../../domain/geography/cities';
import {
  PLANNING_FIELDS, SENSITIVITY_CHANGES, calculatePlanning, emptyPlanningDraft, planningSensitivity, readPlanningSession,
  updatePlanningDraft, validatePlanningDraft, validPlanningSaleDate, writePlanningSession,
  type PlanningDraft, type PlanningResult, type PlanningSession, type SensitivityLine,
} from '../../domain/decision/planning';
import { createCityDecisionData, productCropOptions, productPriceFor, type ProductPrice } from '../../domain/decision/productDecision';
import { WorkbenchMain, WorkbenchRail } from '../../components/workbench/WorkbenchLayout';
import { ChoiceButtons } from '../../components/controls/ChoiceButtons';
import { useMarketObservation } from './useMarketObservation';
import './planning.css';
import { cropIdentity } from '../../domain/decision/cropIdentity';
import { useProductDecision } from './useProductDecision';
import type { ProductDecisionRequest } from '../../domain/decision/productApi';

export interface PlanningWorkbenchProps { cityId: string }
const number = (n: number, digits = 2) => n.toLocaleString('zh-CN', { maximumFractionDigits: digits });
const value = (n: number | null, unit: string) => n === null ? '—' : `${number(n)} ${unit}`;
const CUSTOM = '__custom__';

function draftFor(session: PlanningSession, crop: string, price: ProductPrice): PlanningDraft {
  const saved = Object.prototype.hasOwnProperty.call(session.drafts, crop) ? session.drafts[crop] : null;
  const draft = saved ?? { ...emptyPlanningDraft(), salePercent: '100' };
  return session.priceOverrides?.includes(crop) ? draft : { ...draft, pricePerKg: price.price === null ? draft.pricePerKg : String(price.price) };
}

/** Stable product choices survive API failure; city/crop drafts remain independent. */
export function PlanningWorkbench({ cityId }: PlanningWorkbenchProps) {
  if (!(STUDY_CITY_IDS as readonly string[]).includes(cityId)) return <p role="alert">请选择一个城市。</p>;
  return <PlanningCity key={cityId} cityId={cityId} crops={productCropOptions()}/>;
}

function PlanningCity({ cityId, crops }: { cityId: string; crops: string[] }) {
  const city = getCity(cityId)!;
  const id = useId();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [session, setSession] = useState(() => {
    const context = readContextFromSearch(params.toString());
    const pathCity = /^\/cities\/([^/]+)/.exec(location.pathname)?.[1];
    const requested = pathCity === cityId || !context.cityId || context.cityId === cityId ? context.crop : null;
    const saved = readPlanningSession(cityId, requested);
    if (!requested) return saved;
    return { ...saved, activeCrop: saved.activeCrop === CUSTOM && saved.customCrop.trim() === requested ? CUSTOM : cropIdentity(requested) };
  });
  const [touched, setTouched] = useState<Partial<Record<keyof PlanningDraft | 'crop' | 'budget' | 'saleDate', boolean>>>({});
  const crop = session.activeCrop === CUSTOM ? session.customCrop.trim() : session.activeCrop;
  const market = useMarketObservation(cityId, crop || undefined);
  const price = productPriceFor(cityId, crop, market.status === 'ready' ? market.data : undefined);
  const draft = draftFor(session, crop, price);
  const validation = validatePlanningDraft(draft, crop);
  const budgetText = session.budgetCny ?? '';
  const budget = budgetText.trim() ? Number(budgetText) : null;
  const budgetError = budget !== null && (!Number.isFinite(budget) || budget < 0) ? '可用预算必须是大于或等于 0 的数字。' : undefined;
  const saleDate = session.saleDate ?? '';
  const saleError = saleDate && !validPlanningSaleDate(saleDate) ? '请选择有效的销售时间。' : undefined;
  const cropError = crop && !isKnownCrop(crop) ? '作物名请使用 1–12 个汉字、字母、数字、中点或连字符。' : validation.errors.crop;
  const data = validation.inputs && !cropError && !budgetError && !saleError ? createCityDecisionData({ city: cityId, crop, conditions: validation.inputs, budgetCny: budget, target: session.target, saleDate, priceSource: session.priceOverrides?.includes(crop) ? 'user' : price.origin }) : null;
  const productRequest: ProductDecisionRequest | null = data && validation.inputs ? {
    contract_version: 'product-1', city_id: data.city, crop,
    area_mu: validation.inputs.areaMu, yield_kg_per_mu: validation.inputs.yieldKgPerMu,
    cost_per_mu: validation.inputs.costPerMu, sale_price_per_kg: validation.inputs.pricePerKg,
    sale_fraction: validation.inputs.saleFraction, budget_cny: budget, target: session.target ?? 'balanced',
    sale_date: saleDate || null, price_is_user: session.priceOverrides?.includes(crop) ?? false,
    as_of: readContextFromSearch(params.toString()).asOf ?? (market.status === 'ready' ? market.data?.series[0]?.observations.at(-1)?.date : null) ?? null,
  } : null;
  const product = useProductDecision(productRequest);
  const recommended = product?.candidates.find(candidate => candidate.id === product.recommendation.candidate_id);
  const suggestedResult = recommended && validation.inputs ? calculatePlanning({ ...validation.inputs, areaMu: recommended.area_mu, pricePerKg: recommended.price_per_kg }) : null;
  const result = suggestedResult ?? data?.result;
  const window = recommended?.sales_window ?? data?.salesWindow;
  const recommendationReasons = recommended ? product!.recommendation.reasons : data?.reasons;
  const lines = data && validation.inputs ? planningSensitivity(validation.inputs) : null;
  const calculationError = validation.inputs && !cropError && !budgetError && !saleError && !data ? '数值过大，请缩小输入范围。' : undefined;
  useEffect(() => writePlanningSession(cityId, session), [cityId, session]);
  useLayoutEffect(() => {
    const context = readContextFromSearch(params.toString());
    const pathCity = /^\/cities\/([^/]+)/.exec(location.pathname)?.[1];
    const requested = !context.cityId || context.cityId === cityId || pathCity === cityId ? context.crop : undefined;
    if (requested) setSession(previous => previous.activeCrop === requested || previous.activeCrop === CUSTOM && previous.customCrop.trim() === requested ? previous : { ...previous, activeCrop: cropIdentity(requested) });
  }, [cityId, location.pathname, params]);
  useLayoutEffect(() => {
    const state = useAppContext.getState();
    const requested = readContextFromSearch(params.toString());
    state.setCity(cityId); state.setCrop(isKnownCrop(crop) ? crop : null);
    if (requested.horizon !== undefined) state.setHorizon(requested.horizon);
    if (requested.asOf !== undefined) state.setAsOf(requested.asOf);
    // Restore this city's context once; user events explicitly synchronize later edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId]);
  const syncCrop = (next: string) => {
    const state = useAppContext.getState();
    state.setCity(cityId); state.setCrop(isKnownCrop(next) ? next : null);
    setParams(previous => new URLSearchParams(writeContextToSearch(previous.toString(), { ...useAppContext.getState(), cityId })), { replace: true });
  };
  const updateDraft = (key: keyof PlanningDraft, next: string) => {
    setTouched(previous => ({ ...previous, [key]: true }));
    setSession(previous => {
      const updated = updatePlanningDraft(previous, crop, { ...draftFor(previous, crop, price), [key]: next }, true);
      return key === 'pricePerKg' ? { ...updated, priceOverrides: [...new Set([...(previous.priceOverrides ?? []), crop])] } : updated;
    });
  };
  const chooseCrop = (next: string) => {
    setSession(previous => ({ ...previous, activeCrop: next }));
    setTouched({});
    syncCrop(next === CUSTOM ? session.customCrop.trim() : next);
  };
  const options = [...crops, ...(crop && isKnownCrop(crop) && session.activeCrop !== CUSTOM && !crops.includes(crop) ? [crop] : [])];
  return <>
    <WorkbenchMain label="输入条件"><div className="planning-workbench">
      <h1 className="workbench__title">农业决策</h1>
      <section className="planning-form" aria-label={`${city.shortName}经营条件`}>
        <h2 className="ag-title">输入条件</h2>
        <ChoiceButtons label="作物" value={session.activeCrop} onChange={chooseCrop} options={[...options.map(name => ({ value: name, label: name })), { value: CUSTOM, label: '自定义作物' }]}/>
        {session.activeCrop === CUSTOM && <label className="planning-field planning-custom" htmlFor={`${id}-custom`}><span>作物名称</span><input id={`${id}-custom`} maxLength={12} value={session.customCrop} onChange={event => { const customCrop = event.target.value; setSession(previous => ({ ...previous, customCrop })); setTouched(previous => ({ ...previous, crop: true })); syncCrop(customCrop.trim()); }}/></label>}
        {touched.crop && cropError && <p className="planning-error" role="alert">{cropError}</p>}
        <div className="planning-inputs">
          {PLANNING_FIELDS.filter(({ key }) => key === 'areaMu').map(field => <PlanningField key={field.key} field={field} id={id} draft={draft} error={touched[field.key] ? validation.errors[field.key] : undefined} onChange={updateDraft}/>)}
          <label className="planning-field" htmlFor={`${id}-budget`}><span>可用预算<small>元</small></span><input id={`${id}-budget`} name="budget" type="number" inputMode="decimal" min="0" step="any" value={budgetText} onChange={event => { setSession(previous => ({ ...previous, budgetCny: event.target.value })); setTouched(previous => ({ ...previous, budget: true })); }} aria-invalid={Boolean(budgetError)} aria-describedby={budgetError ? `${id}-budget-error` : undefined}/>{budgetError && <em id={`${id}-budget-error`} className="planning-error" role="alert">{budgetError}</em>}</label>
          <label className="planning-field" htmlFor={`${id}-saleDate`}><span>销售时间</span><input id={`${id}-saleDate`} name="saleDate" type="date" value={saleDate} onChange={event => { setSession(previous => ({ ...previous, saleDate: event.target.value })); setTouched(previous => ({ ...previous, saleDate: true })); }} aria-invalid={Boolean(saleError)}/>{saleError && <em className="planning-error" role="alert">{saleError}</em>}</label>
        </div>
        <ChoiceButtons label="目标" value={session.target ?? 'balanced'} onChange={target => setSession(previous => ({ ...previous, target: target as PlanningSession['target'] }))} options={[{ value: 'balanced', label: '兼顾收益与风险' }, { value: 'conservative', label: '控制风险' }, { value: 'aggressive', label: '收益优先' }]}/>
        <div className="planning-inputs">
          {PLANNING_FIELDS.filter(({ key }) => key !== 'areaMu').map(field => <PlanningField key={field.key} field={field} id={id} draft={draft} error={touched[field.key] ? validation.errors[field.key] : undefined} onChange={updateDraft}/>)}
        </div>
        {calculationError && <p className="planning-error" role="alert">{calculationError}</p>}
      </section>
      {lines && <section className="planning-section" aria-labelledby={`${id}-sensitivity`}><h2 className="ag-title" id={`${id}-sensitivity`}>收益变化</h2><SensitivityChart lines={lines}/></section>}
    </div></WorkbenchMain>
    <WorkbenchRail><section className="planning-result" aria-label="农业决策结果" aria-live="polite">
      <h2 className="ag-title">实时结果</h2>
      {data ? <>
        <div className="planning-recommendation"><p className="ag-label">推荐方案</p><h3>{recommended ? recommended.area_mu < validation.inputs!.areaMu ? '调整种植规模' : '按推荐条件安排生产' : data.suggestion}</h3><p>{crop} · {number(recommended?.area_mu ?? validation.inputs!.areaMu)} 亩</p>{recommended && <p>参考售价 {number(recommended.price_per_kg)} 元/kg</p>}{recommended?.horizon_days && !recommended.sales_window && <p>价格参考周期 {recommended.horizon_days} 天</p>}</div>
        <ResultReadings result={result!}/>
        <dl className="planning-result__facts"><div><dt>经营风险</dt><dd data-risk={recommended?.risk ?? data.risk}>{recommended?.risk ?? data.risk}</dd></div><div><dt>销售窗口</dt><dd>{recommended && (product?.origin.window_choices?.length ?? 0) > 1 ? <ul className="planning-window-options" aria-label="可比较销售时段">{product!.origin.window_choices!.map(period => <li key={period.start}>{period.start} — {period.end}</li>)}</ul> : window ? window.start === window.end ? window.start : `${window.start} — ${window.end}` : '选择销售时间'}</dd></div></dl>
        {!recommended && data.budget.shortfall > 0 && <p className="planning-budget-warning">预算缺口 {number(data.budget.shortfall)} 元</p>}
        <h3 className="ag-label">建议原因</h3><ul className="planning-reasons">{recommendationReasons?.map(reason => <li key={reason}>{reason}</li>)}</ul>
      </> : <p className="planning-empty">{budgetError || cropError && touched.crop || calculationError ? '请修正输入条件。' : '填写作物、面积、亩产和成本，即可查看结果。'}</p>}
    </section></WorkbenchRail>
  </>;
}

function PlanningField({ field, id, draft, error, onChange }: { field: typeof PLANNING_FIELDS[number]; id: string; draft: PlanningDraft; error?: string; onChange: (key: keyof PlanningDraft, next: string) => void }) {
  return <label className="planning-field" htmlFor={`${id}-${field.key}`}><span>{field.label}<small>{field.unit}</small></span><input id={`${id}-${field.key}`} name={field.key} type="number" inputMode="decimal" min={field.key === 'areaMu' ? '0.01' : '0'} max={field.key === 'salePercent' ? '100' : undefined} step="any" value={draft[field.key]} onChange={event => onChange(field.key, event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-${field.key}-error` : undefined}/>{error && <em id={`${id}-${field.key}-error`} className="planning-error" role="alert">{error}</em>}</label>;
}

function ResultReadings({ result }: { result: PlanningResult }) {
  return <dl className="planning-readings">{[['预计收益', result.profitCny, '元'], ['销售收入', result.revenueCny, '元'], ['总成本', result.costCny, '元'], ['保本价格', result.breakEvenPrice, '元/kg'], ['保本亩产', result.breakEvenYield, 'kg/亩']].map(([label, n, unit]) => <div key={String(label)} data-primary={label === '预计收益' || undefined} data-negative={Number(n) < 0}><dt>{label}</dt><dd>{value(n as number | null, String(unit))}</dd></div>)}</dl>;
}

function SensitivityChart({ lines }: { lines: SensitivityLine[] }) {
  const all = lines.flatMap(line => line.points.map(point => point.profitCny));
  const low = Math.min(0, ...all); const high = Math.max(0, ...all);
  const span = high - low || 1;
  const x = (change: number) => 68 + (change + 20) / 40 * 590;
  const y = (n: number) => 220 - (n - low) / span * 185;
  return <div className="planning-chart"><svg viewBox="0 0 720 280" role="img" aria-label="价格、亩产、成本各变化正负20%时的利润敏感性">
    <text x="8" y="18">收益（元）</text>
    {[low, (low + high) / 2, high].map((n, index) => <g key={index}><line className="planning-chart__grid" x1="68" x2="658" y1={y(n)} y2={y(n)}/><text x="61" y={y(n) + 4} textAnchor="end">{number(n, 0)}</text></g>)}
    <line className="planning-chart__zero" x1="68" x2="658" y1={y(0)} y2={y(0)}/>
    {lines.map((line, index) => <g key={line.variable} className={`planning-chart__series planning-chart__series--${index}`}><polyline points={line.points.map(point => `${x(point.change)},${y(point.profitCny)}`).join(' ')}/>{line.points.map(point => <circle key={point.change} cx={x(point.change)} cy={y(point.profitCny)} r="3"><title>{line.label} {point.change}%：收益 {number(point.profitCny)} 元</title></circle>)}</g>)}
    {SENSITIVITY_CHANGES.map(change => <text key={change} x={x(change)} y="246" textAnchor="middle">{change > 0 ? '+' : ''}{change}%</text>)}
    <text x="365" y="271" textAnchor="middle">相对当前条件的变化幅度</text>
  </svg><ul className="planning-legend" aria-label="收益变化图例">{lines.map((line, index) => <li key={line.variable} className={`planning-legend--${index}`}>{line.label}</li>)}</ul></div>;
}
