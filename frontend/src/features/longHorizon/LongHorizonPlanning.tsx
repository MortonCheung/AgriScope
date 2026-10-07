import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { LongHorizonCapability, LongHorizonDecisionRequest, LongHorizonDecisionResult } from '../../domain/longHorizon/types';
import { getLongHorizonDecisionProvider } from '../../providers/longHorizon';
import { DualTargetView, FreshnessNote, STATUS_LABELS } from './LongHorizonPanel';
import type { HttpLongHorizonProvider } from '../../providers/longHorizon';

const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const cny = (v: number | null) => v === null ? '待补实际投入' : `${number.format(v)} 元`;

/** Same structured entry as the short decision, with an independent harvest contract. */
export function LongHorizonPlanning({ cityId, provider = getLongHorizonDecisionProvider() }: {
  cityId: string; provider?: Pick<HttpLongHorizonProvider, 'capabilities' | 'decision'>;
}) {
  const [cap, setCap] = useState<LongHorizonCapability | null>(null);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState('');
  const [area, setArea] = useState('');
  const [budget, setBudget] = useState('');
  const [risk, setRisk] = useState<'conservative' | 'balanced' | 'aggressive'>('balanced');
  const [horizon, setHorizon] = useState('');
  const [date, setDate] = useState('');
  const [crops, setCrops] = useState<string[]>([]);
  const [actualCrop, setActualCrop] = useState('');
  const [inputs, setInputs] = useState<Record<string, { cost: string; yield: string }>>({});
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<LongHorizonDecisionResult | null>(null);
  const [chosen, setChosen] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setCap(null); setError(''); setResult(null); setPending(false);
    if (cityId !== 'shenyang') return;
    provider.capabilities(cityId, { signal: controller.signal }).then(value => {
      if (controller.signal.aborted) return;
      setCap(value); setActualCrop(previous => previous || value.crops[0]?.id || '');
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '上市决策能力暂时不可用。'); });
    return () => { controller.abort(); active.current?.abort(); };
  }, [cityId, provider, retry]);
  const actual = inputs[actualCrop] ?? { cost: '', yield: '' };
  async function submit(e: FormEvent) {
    e.preventDefault(); setError('');
    if (!cap?.supported || !cap.asOf) { setError('上市决策快照暂时不可用。'); return; }
    if (![Number(area), Number(budget)].every(v => Number.isFinite(v) && v > 0)) { setError('请填写大于 0 的种植面积和预算。'); return; }
    if (!horizon && !date) { setError('请明确选择预计上市跨度或上市日。'); return; }
    const asOf = cap.asOf;
    const dateDays = date ? Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 86400000) : null;
    const days = horizon ? Number(horizon) : dateDays;
    if (days === null || !cap.horizons.includes(days)) { setError('上市日期必须对应已登记的跨度，不会自动改成附近日期。'); return; }
    if (dateDays !== null && days !== dateDays) { setError('预计上市日与所选跨度不一致，请按自己的计划修改。'); return; }
    const actualInputs: LongHorizonDecisionRequest['user_context']['actual_inputs'] = {};
    for (const [crop, values] of Object.entries(inputs)) {
      if (!values.cost.trim() && !values.yield.trim()) continue;
      const cost = values.cost.trim() ? Number(values.cost) : null;
      const yieldKg = values.yield.trim() ? Number(values.yield) : null;
      if ([cost, yieldKg].some(v => v !== null && (!Number.isFinite(v) || v <= 0))) { setError('实际成本和亩产需要大于 0。'); return; }
      actualInputs[crop] = { cost_per_mu: cost, yield_kg_per_mu: yieldKg };
    }
    const request: LongHorizonDecisionRequest = { contract_version: '2', user_context: {
      city_id: cityId, area_mu: Number(area), budget_cny: Number(budget) * 10000,
      risk_preference: risk, crop_preferences: crops, actual_inputs: actualInputs,
      market_context: { as_of: asOf, expected_harvest_horizon_days: days, expected_harvest_date: date || null },
    }, input_source: { kind: 'structured' } };
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setPending(true); setResult(null);
    try {
      const value = await provider.decision(request, { signal: controller.signal });
      if (!controller.signal.aborted) { setResult(value); setChosen(value.recommendation.crop ?? value.candidates[0]?.crop ?? ''); }
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '上市决策暂时无法加载。'); }
    finally { if (!controller.signal.aborted) setPending(false); }
  }
  if (cityId !== 'shenyang') return <section className="decision-input"><h1 className="ag-section-title">这个城市的上市决策待接入</h1><p className="decision-note">当前只有沈阳具备同口径长期市场数据。</p></section>;
  if (result) {
    const candidate = result.candidates.find(c => c.crop === chosen) ?? result.candidates[0];
    return <section className="long-horizon-result" aria-labelledby="long-result-title">
      <header className="decision-input__intro"><p className="ag-label">上市决策 · {result.horizon_days} 天 · {result.expected_harvest_date}</p><h1 id="long-result-title" className="ag-section-title">到上市时，市场怎样。</h1>
        <p className="ag-lead">{result.ranking_basis === 'profit_scenario' ? '按实际投入比较净收益情景。' : '按上市价格相对当前价格的变化比较市场环境；这不是利润排序。'}</p></header>
      <FreshnessNote freshness={result.freshness}/>
      {result.status === 'NO_FEASIBLE_PLAN' && <p role="status" className="decision-note">当前条件下没有可排序的可行方案。</p>}
      <div className="decision-toolbar"><label className="decision-toolbar__select">比较作物<select aria-label="上市决策比较作物" value={candidate?.crop ?? ''} onChange={e => setChosen(e.target.value)}>{result.candidates.map(c => <option key={c.crop} value={c.crop}>{c.crop} · {STATUS_LABELS[c.production_status]}</option>)}</select></label>
        <button type="button" className="ag-button" onClick={() => { setResult(null); setError(''); }}>修改上市条件</button></div>
      {candidate && <>
        <DualTargetView targets={candidate.targets} asOf={result.market_as_of} freshness={candidate.freshness} llmStatus={result.llm_status}/>
        <section className="long-horizon-result__context" aria-labelledby="long-context-title">
        <h2 className="ag-title" id="long-context-title">投入与当前风险</h2>
        <dl className="decision-detail__facts"><div><dt>实际投入净收益情景</dt><dd>{cny(candidate.profit.base)}</dd></div>
          {candidate.profit.available && <div><dt>下行 — 上行情景</dt><dd>{cny(candidate.profit.low)} — {cny(candidate.profit.high)}</dd></div>}
          <div><dt>预算可行性</dt><dd>{candidate.budget_feasible === null ? '实际成本待补' : candidate.budget_feasible ? '在预算内' : '超过预算，不参与排序'}</dd></div>
          <div><dt>当前市场 HRI / 市场风险</dt><dd>{candidate.current_market_context.hri === null ? '—' : number.format(candidate.current_market_context.hri)} / {candidate.current_market_context.market_risk === null ? '—' : number.format(candidate.current_market_context.market_risk)}</dd></div>
          <div><dt>风险数据日期</dt><dd>{candidate.current_market_context.as_of ?? '暂不可用'}</dd></div></dl>
        <p className="decision-note">气候暴露：{candidate.current_market_context.climate_exposure?.available ? '历史参考口径' : '缺少截止日可用来源，未参与比较。'}</p>
        {result.risk_preference_usage && <p className="decision-note">{result.risk_preference_usage.note}</p>}
        <p className="decision-note">风险描述当前市场环境，不是 {result.horizon_days} 天后的风险预报。成本与亩产均由你提供时才计算收益，价格范围仍是情景。</p>
        <ul className="decision-limitations">{[...new Set([...candidate.warnings, ...result.warnings])].map(w => <li key={w}>{w}</li>)}</ul>
        </section>
      </>}
      <p className="decision-boundary">长期结果仅供情景比较，不作强推荐；上市跨度来自你的计划，不是系统推断的生育期。</p>
    </section>;
  }
  return <section className="decision-input" aria-labelledby="long-input-title">
    <div className="decision-input__intro"><p className="ag-label">沈阳 · 上市决策</p><h1 id="long-input-title" className="ag-hero">预计上市时，怎么选。</h1><p className="ag-lead">先确认上市时间，再比较上市窗口价格与实际投入。</p>
      <p className="decision-note">市场数据基准 {cap?.asOf ?? '确认中'}。系统不猜测作物生长周期。</p></div>
    {error && <p className="decision-errors" role="alert">{error}</p>}
    {!cap ? <div className="ag-state" role="status">{error ? <button className="ag-button" onClick={() => setRetry(retry + 1)}>重新读取长期能力</button> : '读取上市决策范围'}</div>
      : !cap.supported ? <p role="status" className="decision-note">{cap.limitation ?? '上市决策暂时不可用。'}</p>
        : <form onSubmit={submit} noValidate className="decision-input__form">
          <div className="decision-input__fields"><label>种植面积 <span className="decision-input__unit">亩</span><input name="long-area" type="number" min="0" step="any" value={area} onChange={e => setArea(e.target.value)}/></label>
            <label>可用预算 <span className="decision-input__unit">万元</span><input name="long-budget" type="number" min="0" step="any" value={budget} onChange={e => setBudget(e.target.value)}/></label>
            <label>预计上市跨度<select name="expected-harvest-horizon" value={horizon} onChange={e => setHorizon(e.target.value)}><option value="">请按自己的计划选择</option>{cap.horizons.map(h => <option key={h} value={h}>{h} 天</option>)}</select></label>
            <label>预计上市日（可选）<input name="expected-harvest-date" type="date" value={date} onChange={e => setDate(e.target.value)}/></label>
            <label>这次更看重<select value={risk} onChange={e => setRisk(e.target.value as typeof risk)}><option value="conservative">稳健一些</option><option value="balanced">兼顾收益与风险</option><option value="aggressive">收益优先</option></select></label></div>
          <p className="decision-note">日期与跨度以数据基准日计算。只支持已登记档位；日期不会自动吸附到附近档位。150 / 180 天为探索性结果。</p>
          <fieldset className="decision-input__crops"><legend>比较哪些作物（不限制时比较全部）</legend>{cap.crops.map(c => <label key={c.id}><input type="checkbox" checked={crops.includes(c.id)} onChange={e => setCrops(e.target.checked ? [...crops, c.id] : crops.filter(v => v !== c.id))}/>{c.label}</label>)}</fieldset>
          <details className="decision-disclosure"><summary>实际成本与亩产</summary><div className="decision-input__fields"><label>实际投入对应作物<select aria-label="上市实际投入对应作物" value={actualCrop} onChange={e => setActualCrop(e.target.value)}>{cap.crops.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
            <label>实际亩均成本 <span className="decision-input__unit">元/亩</span><input name="long-cost" type="number" step="any" value={actual.cost} onChange={e => setInputs({ ...inputs, [actualCrop]: { ...actual, cost: e.target.value } })}/></label>
            <label>实际亩产 <span className="decision-input__unit">kg/亩</span><input name="long-yield" type="number" step="any" value={actual.yield} onChange={e => setInputs({ ...inputs, [actualCrop]: { ...actual, yield: e.target.value } })}/></label></div>
            <p className="decision-note">每种作物可分别填写。未同时提供成本与亩产时，不输出利润。</p></details>
          <FreshnessNote freshness={cap.freshness}/>
          <button className="ag-button ag-button--primary" type="submit" disabled={pending}>{pending ? '比较上市情景中' : '比较上市决策 →'}</button>
        </form>}
  </section>;
}
