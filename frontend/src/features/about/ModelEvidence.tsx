import { useEffect, useState } from 'react';
import { ChoiceButtons } from '../../components/controls/ChoiceButtons';
interface ModelRow {cityId:string;crop:string;horizon:number;algorithm:string;status:string;wape:number;mae:number;baselineWape:number}
interface Fold {name:string;trainStart:string;trainEnd:string;trainEndMax:string;validationStart:string;validationStartMax:string;validationEnd:string;validationEndMax:string}
export interface ProjectEvidence {schemaVersion:string;modelVersion:string;dataVersion:string;fingerprint:string;reportGeneratedAt:string;trainingCompletedAt:null;seed:number;features:string;models:ModelRow[];folds:Fold[];baseline:string;metricSemantics:string}
export function useProjectEvidence(){
 const [data,setData]=useState<ProjectEvidence|null>(null);const [error,setError]=useState('');const [attempt,setAttempt]=useState(0);
 useEffect(()=>{const controller=new AbortController();setError('');const timer=setTimeout(()=>{controller.abort();setError('验证证据读取超时');},10000);
 void fetch('/api/project/evidence',{signal:controller.signal,cache:'no-store'}).then(async response=>{if(!response.ok)throw Error('冻结验证证据暂时不可用');const value=await response.json() as ProjectEvidence;
 if(value.schemaVersion!=='1'||value.metricSemantics!=='WAPE_percent_MAE_CNY_per_kg'||!Array.isArray(value.models)||!value.models.length||value.models.some(row=>![row.wape,row.mae,row.baselineWape].every(n=>Number.isFinite(n)&&n>=0))||!Array.isArray(value.folds)||!value.folds.length)throw Error('冻结验证证据格式不完整');if(!controller.signal.aborted)setData(value);
 }).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'证据读取失败');}).finally(()=>clearTimeout(timer));return()=>{clearTimeout(timer);controller.abort();};},[attempt]);
 return {data,error,retry:()=>setAttempt(v=>v+1)};
}
const decimal=(n:number)=>n.toLocaleString('zh-CN',{maximumFractionDigits:4});const range=(a:string,b:string)=>a===b?a:`${a} 至 ${b}`;
export function ModelEvidence({data}:{data:ProjectEvidence}){
 const [city,setCity]=useState('shenyang');const [crop,setCrop]=useState('西红柿');const [h,setH]=useState(30);
 const crops=[...new Set(data.models.filter(row=>row.cityId===city).map(row=>row.crop))];const currentCrop=crops.includes(crop)?crop:crops[0];const row=data.models.find(m=>m.cityId===city&&m.crop===currentCrop&&m.horizon===h);const max=Math.max(row?.wape??0,row?.baselineWape??0,1)*1.15;
 return <><p className="about__paragraph">冻结价格模型仅使用价格历史特征；成交量与天气没有进入这版价格特征。历史扩展窗口按时间先后划分，验证数据始终晚于训练截止日。短期能力以实际登记的 7／14／30 天为准；长期 150／180 天为探索性情景。</p>
 <div className="about__folds">{data.folds.map((fold,i)=><section key={fold.name}><p className="ag-label">时间切分 {i+1}</p><h3>{i===2?'2026 截尾验证':`${2024+i} 年验证`}</h3><dl><div><dt>训练起点</dt><dd>{fold.trainStart}（各作物起点略有差异）</dd></div><div><dt>训练截止</dt><dd>{range(fold.trainEnd,fold.trainEndMax)}</dd></div><div><dt>验证起点</dt><dd>{range(fold.validationStart,fold.validationStartMax)}</dd></div><div><dt>验证终点</dt><dd>{range(fold.validationEnd,fold.validationEndMax)}</dd></div></dl></section>)}</div>
 <p className="about__paragraph about__paragraph--muted">区间表示不同作物实际观测日期的差异，验证期不补造缺失日。随机种子 {data.seed}；报告生成于 {data.reportGeneratedAt}，独立训练完成时间未登记。</p>
 <ChoiceButtons label="验证城市" value={city} options={[{value:'shenyang',label:'沈阳'},{value:'chaoyang',label:'朝阳'}]} onChange={setCity}/><ChoiceButtons label="验证作物" value={currentCrop} options={crops.map(value=>({value,label:value}))} onChange={setCrop}/><ChoiceButtons label="验证期限" value={String(h)} options={[7,14,30].map(n=>({value:String(n),label:`${n} 天`}))} onChange={value=>setH(Number(value))}/>
 {row?<><svg className="about__comparison" viewBox="0 0 720 158" role="img" aria-label={`${city==='shenyang'?'沈阳':'朝阳'}${currentCrop}${h}天 WAPE ${decimal(row.wape)}%，基线 ${decimal(row.baselineWape)}%`}><text x="0" y="20">WAPE · % · 越小越好</text>{[{label:row.status==='BASELINE'?'已采用最近价格基线':'已登记价格模型',value:row.wape},{label:'最近价格基线',value:row.baselineWape}].map((item,i)=><g key={i}><text x="0" y={63+i*58}>{item.label}</text><rect x="190" y={44+i*58} width={item.value/max*420} height="24" fill={i===0?'#5b7666':'#c5bdaa'}/><text x={200+item.value/max*420} y={63+i*58}>{decimal(item.value)}</text></g>)}</svg><p className="about__paragraph">该行 MAE：{decimal(row.mae)} 元/kg。{row.status==='BASELINE'?'实际采用基线，不能宣称模型优于基线。':'采用注册表中的最终模型；不同作物和期限逐行选择方法。'}</p><details><summary>查看真实登记方法</summary><p>{row.algorithm} · {row.status} · {data.modelVersion} · {data.dataVersion}</p></details></>:<p role="status">这个组合没有已登记验证结果。</p>}</>;
}
