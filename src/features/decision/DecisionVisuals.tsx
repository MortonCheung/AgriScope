import { motion, useReducedMotion } from 'motion/react';
import type { Confidence, ScenarioRange } from '../../domain/decision/types';
import { MOTION_DURATION, MOTION_EASE } from '../../design/motion';

const number=new Intl.NumberFormat('zh-CN',{maximumFractionDigits:1});
export function formatNumber(value:number|null,unit=''):string{return value===null?'—':`${number.format(value)}${unit}`;}
export function money(value:number|null):string{
  if(value===null)return '—';
  if(Math.abs(value)>=10000)return `${new Intl.NumberFormat('zh-CN',{maximumFractionDigits:Math.abs(value)>=1000000?0:1}).format(value/10000)} 万元`;
  return `${new Intl.NumberFormat('zh-CN',{maximumFractionDigits:0}).format(value)} 元`;
}
export function rangeText(range:ScenarioRange):string{
  const format=range.unit==='CNY'?money:range.unit==='ratio'?(v:number|null)=>formatNumber(v===null?null:v*100,'%'):(v:number|null)=>formatNumber(v,' 元/kg');
  if(range.low===null&&range.high===null)return range.base===null?'待补充':`${format(range.base)}（范围待补充）`;
  return `${format(range.low)} — ${format(range.high)}`;
}
export function dateWindow(window:{start:string;end:string}|null){
  if(!window)return '待补充';
  const format=(s:string)=>`${Number(s.slice(5,7))}月${Number(s.slice(8,10))}日`;
  return window.start===window.end?`${window.start.slice(0,4)}年 ${format(window.start)}`:`${window.start.slice(0,4)}年 ${format(window.start)}—${format(window.end)}`;
}
const LEVELS:Record<Confidence['level'],string>={high:'高可信',medium:'中可信',low:'低可信',unknown:'可信程度待评估',reported:'模型评分'};
export function ConfidenceMark({confidence,label='决策可信程度'}:{confidence:Confidence;label?:string}){
  const filled={high:3,medium:2,low:1,unknown:0,reported:0}[confidence.level];
  return <div className="decision-confidence" data-level={confidence.level}>
    <span className="ag-label">{label}</span>
    <div className="decision-confidence__value">{confidence.level!=='reported'&&<span className="decision-confidence__ticks" aria-hidden="true">{[1,2,3].map(i=><i key={i} data-filled={i<=filled||undefined}/>)}</span>}<strong>{LEVELS[confidence.level]}</strong>{confidence.score!==null&&<span className="decision-note">{formatNumber(confidence.score)} / 100</span>}{confidence.is_mock&&<span className="decision-note">演示</span>}</div>
  </div>;
}
export function RiskScale({label,value,note}:{label:string;value:number|null;note:string}){
  return <div className="decision-risk"><div className="decision-risk__heading"><span>{label}</span><span>{formatNumber(value)}</span></div>
    <svg viewBox="0 0 360 32" role="img" aria-label={`${label}：${value===null?'数据待补充':`${formatNumber(value)}，评分范围0到100`}`}>
      <line x1="4" y1="10" x2="356" y2="10" className="decision-plot__axis"/>
      {[0,50,100].map(v=><g key={v}><line x1={4+v*3.52} x2={4+v*3.52} y1="6" y2="14" className="decision-plot__axis"/><text x={4+v*3.52} y="30" textAnchor={v===0?'start':v===100?'end':'middle'}>{v}</text></g>)}
      {value!==null&&<circle cx={4+value*3.52} cy="10" r="4" className="decision-plot__point"/>}
    </svg><p className="decision-note">{note}</p></div>;
}
export function RangePlot({rows,domainRanges,title}:{rows:{label:string;range:ScenarioRange;baseline?:boolean}[];domainRanges?:ScenarioRange[];title:string}){
  const reduced=Boolean(useReducedMotion());
  const values=(domainRanges??rows.map(r=>r.range)).flatMap(r=>[r.low,r.base,r.high]).filter((v):v is number=>v!==null&&Number.isFinite(v));
  if(!values.length)return <div className="decision-plot__empty" role="status">情景范围待补充</div>;
  const unit=rows[0].range.unit;
  const {min,max,lower,upper}=rangeDomain(values,unit);
  const x=(v:number)=>38+(v-lower)/(upper-lower)*564;
  const transition={duration:reduced?0:MOTION_DURATION.normal,ease:MOTION_EASE.out};
  const format=(v:number|null)=>unit==='CNY'?money(v):unit==='ratio'?formatNumber(v===null?null:v*100,'%'):formatNumber(v,' 元/kg');
  return <figure className="decision-plot">
    <figcaption className="ag-sr-only">{title}</figcaption>
    <svg viewBox={`0 0 640 ${88+rows.length*66}`} role="img" aria-label={`${title}。${rows.map(r=>`${r.label}：下行${format(r.range.low)}，基准${format(r.range.base)}，上行${format(r.range.high)}`).join('。')}`}>
      {lower<=0&&upper>=0&&<line x1={x(0)} x2={x(0)} y1="18" y2={28+rows.length*66} className="decision-plot__zero"/>}
      {rows.map((row,i)=>{
        const y=40+i*66;const {low,base,high}=row.range;
        return <g key={i} data-baseline={row.baseline||undefined}>
          {low!==null&&high!==null&&<motion.line animate={{x1:x(low),x2:x(high)}} initial={false} y1={y} y2={y} className="decision-plot__range" strokeDasharray={row.range.is_mock?'2 5':'6 4'} transition={transition}/>}
          {[{v:low,key:'low'},{v:high,key:'high'}].map(p=>p.v===null?null:<motion.line key={p.key} initial={false} animate={{x1:x(p.v),x2:x(p.v)}} y1={y-7} y2={y+7} className="decision-plot__range" transition={transition}/>)}
          {base!==null&&<motion.circle initial={false} animate={{cx:x(base)}} cy={y} r="5" className="decision-plot__point" transition={transition}/>}
          <text x="38" y={y+30}>{row.label}</text>
          <text x="602" y={y+30} textAnchor="end">{base===null?'基准待补充':`基准 ${format(base)}`}</text>
        </g>;
      })}
      <line x1="38" x2="602" y1={42+rows.length*66} y2={42+rows.length*66} className="decision-plot__axis"/>
      <text x="38" y={65+rows.length*66}>{format(min)}</text><text x="602" y={65+rows.length*66} textAnchor="end">{format(max)}</text>
    </svg>
  </figure>;
}
export function rangeDomain(values:number[],unit:ScenarioRange['unit']){
  const min=Math.min(...values,...(unit==='CNY/kg'?[]:[0])),max=Math.max(...values,...(unit==='CNY/kg'?[]:[0]));
  const padding=(max-min||Math.abs(max)*.1||1)*.08;
  return {min,max,lower:min-padding,upper:max+padding};
}
