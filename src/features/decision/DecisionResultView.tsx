import { TransitionLink } from '../../app/pageNavigation';
import { ROUTES } from '../../app/routes';
import type { DecisionCandidate, DecisionResult } from '../../domain/decision/types';
import { ConfidenceMark, dateWindow, formatNumber, money, RangePlot, rangeText, RiskScale } from './DecisionVisuals';

export function DecisionSummary({result,candidate,onDetail,onCompare,onEvidence,stressUrl}:{result:DecisionResult;candidate:DecisionCandidate;onDetail:()=>void;onCompare:()=>void;onEvidence:()=>void;stressUrl:string}){
  const noWinner=result.issues.includes('no_clear_winner');
  return <section className="decision-result" aria-labelledby="decision-plan-title">
    <div className="decision-result__main">
      <p className="ag-label">{noWinner||result.recommendation.candidate_id!==candidate.id?'一个可比较的选择':'当前推荐'}</p>
      <h1 className="decision-result__crop" id="decision-plan-title">{candidate.crop}<span>{formatNumber(candidate.area_mu)} 亩</span></h1>
      <p className="decision-result__window">{dateWindow(candidate.harvest_window)} 上市</p>
      <p className="decision-result__reason">{candidate.reasons[0]??'比较收益情景与风险，再决定是否适合这季。'}</p>
      <div className="decision-result__profit"><p className="ag-label">净收益情景 {candidate.profit.is_mock?'· 演示':''}</p><p className="decision-result__range">{rangeText(candidate.profit)}</p></div>
      <div className="decision-actions"><button type="button" className="ag-button ag-button--primary" onClick={onDetail}>看收益与风险</button><TransitionLink to={stressUrl} className="ag-button">如果条件变差 →</TransitionLink></div>
      <RangePlot title="方案净收益情景" rows={[{label:'下行 — 上行',range:candidate.profit}]}/>
    </div>
    <aside className="decision-result__aside">
      <ConfidenceMark confidence={result.recommendation.confidence}/>
      <div className="decision-result__caution"><p>{result.data_status==='mock'?'情景比较，尚无新的模型推荐。':noWinner?'方案差异较小，不作强烈推荐。':result.recommendation.confidence.level==='low'?'证据有限，先核对实际投入。':'结合实际投入再作选择。'}</p>{candidate.warnings.some(w=>w.includes('高估'))&&<p>成本可能缺项，收益可能高估。</p>}{result.issues.includes('high_risk')&&<p>市场压力偏高，留意下行情景。</p>}</div>
      <div className="decision-result__risk-summary"><p className="ag-label">主要留意</p><p>价格与产量变化会改变实际收益。</p><p className="decision-note">市场风险 {formatNumber(candidate.risks.market_risk)} / 100</p></div>
      <button type="button" className="decision-text-button" onClick={onCompare}>比较替代方案 →</button>
      <button type="button" className="decision-text-button" onClick={onEvidence}>查看依据 →</button>
    </aside>
  </section>;
}
export function DecisionDetail({candidate,result}:{candidate:DecisionCandidate;result:DecisionResult}){
  return <section className="decision-detail">
    <header className="decision-section-head"><p className="ag-label">{candidate.crop} · {formatNumber(candidate.area_mu)} 亩</p><h1 className="ag-section-title">收益与风险，分开看。</h1><ConfidenceMark confidence={result.recommendation.confidence}/></header>
    <div className="decision-detail__grid">
      <div className="decision-detail__finances">
        <h2 className="ag-title">价格情景</h2><RangePlot title="价格情景" rows={[{label:candidate.price.semantics==='historical_seasonal_scenario'?'历史同月':'模型情景',range:candidate.price}]}/>
        <dl className="decision-readings">{[['下行',candidate.price.low],['基准',candidate.price.base],['上行',candidate.price.high]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{formatNumber(value as number|null,' 元/kg')}</dd></div>)}</dl>
        <p className="decision-note">{candidate.price.is_calibrated_interval?'模型提供的价格区间，具体口径请查看依据。':candidate.price.semantics==='historical_seasonal_scenario'?'历史同月价格范围，未校准为概率区间。':'价格范围为比较情景，未校准为概率区间。'}</p>
        <h2 className="ag-title">净收益情景 {candidate.profit.is_mock&&<span className="decision-note">演示</span>}</h2>
        <RangePlot title="净收益情景" rows={[{label:'下行 — 上行',range:candidate.profit}]}/>
        <dl className="decision-readings"><div><dt>下行</dt><dd>{money(candidate.profit.low)}</dd></div><div><dt>基准</dt><dd>{money(candidate.profit.base)}</dd></div><div><dt>上行</dt><dd>{money(candidate.profit.high)}</dd></div></dl>
        <dl className="decision-detail__facts"><div><dt>投入回报率情景</dt><dd>{rangeText(candidate.roi)}</dd></div><div><dt>保本价格</dt><dd>{formatNumber(candidate.break_even_price,' 元/kg')}</dd></div><div><dt>亩均成本</dt><dd>{formatNumber(candidate.inputs.cost_per_mu,' 元/亩')}</dd></div><div><dt>亩产口径</dt><dd>{formatNumber(candidate.inputs.yield_kg_per_mu,' kg/亩')}</dd></div><div><dt>种植窗口</dt><dd>{dateWindow(candidate.planting_window)}</dd></div><div><dt>上市窗口</dt><dd>{dateWindow(candidate.harvest_window)}</dd></div></dl>
      </div>
      <div className="decision-detail__risks">
        <h2 className="ag-title">风险位置</h2>
        <RiskScale label="跟风风险 · HRI" value={candidate.risks.hri} note="扩种诱因评分，不是扩种概率。"/>
        <RiskScale label="市场风险" value={candidate.risks.market_risk} note="历史市场条件评分，不是跌价概率。"/>
        <RiskScale label="气候暴露" value={candidate.risks.climate_exposure} note="历史同期暴露，不是天气或减产预报。"/>
        <details className="decision-disclosure"><summary>可信程度与数据口径</summary><p className="decision-note">{result.recommendation.confidence.basis}</p><ConfidenceMark confidence={candidate.confidence} label="候选原始置信度"/><dl className="decision-detail__facts"><div><dt>成本</dt><dd>{candidate.inputs.cost_source}</dd></div><div><dt>亩产</dt><dd>{candidate.inputs.yield_source}</dd></div><div><dt>数据质量</dt><dd>{candidate.data_quality.label}</dd></div></dl>{candidate.data_quality.proxy_flags.length>0&&<p className="decision-note">参考口径：{candidate.data_quality.proxy_flags.join('、')}</p>}{candidate.data_quality.mock_fields.length>0&&<p className="decision-note">面积、投入、收益与可信程度含演示字段。</p>}</details>
      </div>
    </div>
    <details className="decision-disclosure"><summary>假设与限制</summary><ul className="decision-limitations">{[...new Set([...candidate.warnings,...result.warnings,...result.assumptions])].map(w=><li key={w}>{w}</li>)}</ul></details>
  </section>;
}
export function DecisionEvidence({candidate,result}:{candidate:DecisionCandidate;result:DecisionResult}){
  return <section className="decision-evidence">
    <header className="decision-section-head"><p className="ag-label">{candidate.crop}</p><h1 className="ag-section-title">这份比较，依据什么。</h1></header>
    <div className="decision-evidence__context"><p>决策数字来自{result.data_status==='legacy_model_fixture'?'旧模型历史样例':result.data_status==='mock'?'历史样例与公式情景':'模型返回结果'}。</p><p className="decision-note">{candidate.evidence.some(e=>e.role==='input')?'标为输入依据的内容由模型提供关联；研究背景用于理解市场，不证明方案收益。':'下列研究用于理解市场背景，不证明当前方案收益，也没有直接参与这份前端演算。'}</p></div>
    <ul className="decision-evidence__links">{candidate.evidence.map(e=><li key={`${e.city_id}:${e.research_id}`}><span className="ag-label">{e.role==='background'?'研究背景':'输入依据'}</span><TransitionLink to={ROUTES.research(e.city_id,e.research_id)}>{e.label} →</TransitionLink></li>)}</ul>
    <ConfidenceMark confidence={result.recommendation.confidence}/>
    <ul className="decision-limitations">{[...new Set([...candidate.warnings,...result.warnings,...result.assumptions])].map(w=><li key={w}>{w}</li>)}</ul>
  </section>;
}
