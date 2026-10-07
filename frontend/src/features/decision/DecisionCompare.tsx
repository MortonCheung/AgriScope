import { useState } from 'react';
import type { DecisionCandidate, DecisionResult } from '../../domain/decision/types';
import { ConfidenceMark, dateWindow, formatNumber, RangePlot, rangeText } from './DecisionVisuals';
import { actualProfit, evaluationLabel, shownConfidence } from './presentation';

export function DecisionCompare({result,initialId,onChoose}:{result:DecisionResult;initialId:string;onChoose:(id:string)=>void}){
  const [leftId,setLeft]=useState(initialId);
  const [rightId,setRight]=useState(result.candidates.find(c=>c.id!==initialId)?.id??initialId);
  const left=result.candidates.find(c=>c.id===leftId)??result.candidates[0];
  const right=result.candidates.find(c=>c.id===rightId)??left;
  const choose=(side:'left'|'right',id:string)=>{
    if(side==='left'){if(id===right.id)setRight(left.id);setLeft(id);}
    else{if(id===left.id)setLeft(right.id);setRight(id);}
  };
  if(result.candidates.length<2)return <section className="ag-state"><h1 className="ag-section-title">目前只有一个可比较选择</h1><p>可调整作物或上市范围，再看看其他方向。</p></section>;
  const calibrated=[left,right].every(c=>[c.price,c.profit,c.roi].every(range=>range.is_calibrated_interval));
  const metrics:{label:string;read:(c:DecisionCandidate)=>string}[]=[
    {label:'种植面积',read:c=>formatNumber(c.area_mu,' 亩')},
    {label:left.market_context?'市场评估':'上市窗口',read:c=>c.market_context?evaluationLabel(c):dateWindow(c.harvest_window)},
    {label:'价格情景',read:c=>rangeText(c.price)},
    {label:'净收益情景',read:c=>rangeText(c.profit)},
    {label:'投入回报率情景',read:c=>rangeText(c.roi)},
    {label:'跟风风险 · HRI',read:c=>formatNumber(c.risks.hri)},
    {label:'市场风险',read:c=>formatNumber(c.risks.market_risk)},
    {label:'气候暴露',read:c=>formatNumber(c.risks.climate_exposure)},
    {label:'数据质量',read:c=>c.data_quality.label},
  ];
  return <section className="decision-compare">
    <header className="decision-section-head"><p className="ag-label">两个选择，同一把尺</p><h1 className="ag-section-title">多一些收益，还是少一些压力。</h1><ConfidenceMark confidence={shownConfidence(result,left)}/></header>
    <div className="decision-compare__selectors">{[left,right].map((c,i)=><label key={i}>{i===0?'当前选择':'替代选择'}<select aria-label={i===0?'当前比较方案':'替代比较方案'} value={c.id} onChange={e=>choose(i===0?'left':'right',e.target.value)}>{result.candidates.map(option=><option key={option.id} value={option.id}>{option.crop} · {evaluationLabel(option)}</option>)}</select></label>)}</div>
    <RangePlot title={actualProfit(left)&&actualProfit(right)?'两个方案净收益比较':'两个方案价格情景比较'} rows={[{label:left.crop,range:actualProfit(left)&&actualProfit(right)?left.profit:left.price,baseline:true},{label:right.crop,range:actualProfit(left)&&actualProfit(right)?right.profit:right.price}]}/>
    <dl className="decision-compare__rows">{metrics.map(m=><div key={m.label}><dt>{m.label}</dt><dd><span className="ag-sr-only">{left.crop}：</span>{m.read(left)}</dd><dd><span className="ag-sr-only">{right.crop}：</span>{m.read(right)}</dd></div>)}</dl>
    <div className="decision-compare__foot"><p className="decision-note">— 表示数据待补充。风险评分不是概率；{calibrated?'高低区间由模型标记为已校准。':'部分高低情景没有校准为概率区间。'}部分候选只有基准收益，不能据此比较完整下行风险。</p></div>
    <div className="decision-actions"><button className="ag-button" onClick={()=>onChoose(left.id)}>查看{left.crop}</button><button className="ag-button" onClick={()=>onChoose(right.id)}>查看{right.crop}</button></div>
  </section>;
}
