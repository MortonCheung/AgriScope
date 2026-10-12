import { useEffect } from 'react';
import { STUDY_CITY_IDS, getCity } from '../../domain/geography/cities';
import { METRIC_DEFINITIONS } from '../../domain/research/v2/metrics';
import { MarkdownBlocks } from '../research-v2/blocks';
import { useReferences, useSources } from '../research-v2/useV2';
import './about.css';

const chapters = [['project', '项目介绍'], ['data', '数据来源'], ['methods', '方法说明']] as const;

export function AboutPage() {
  useEffect(() => {
    const show = () => {
      let id: string;
      try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
      const node = document.getElementById(id);
      if (!node) return;
      let parent = node.parentElement;
      while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; }
      node.scrollIntoView?.({ block: 'start' });
    };
    show();
    window.addEventListener('hashchange', show);
    return () => window.removeEventListener('hashchange', show);
  }, []);
  return <main className="about about--publication ag-paper-enter">
    <nav className="about__outline" aria-label="关于页章节">{chapters.map(([id, title]) => <a key={id} href={`#${id}`}>{title}</a>)}</nav>
    <div className="about__article">
      <header className="about__head"><h1 className="about__title">关于</h1></header>
      <section className="about__section" id="project">
        <h2 className="about__section-title">项目介绍</h2>
        <p className="about__lead">辽宁农业数据分析与决策平台。通过市场、生产与气候研究，帮助经营者比较投入、市场环境和上市情景。</p>
        <p className="about__paragraph">覆盖沈阳、铁岭、朝阳、锦州、丹东、大连，连接城市报告、经营计划与市场观察。</p>
      </section>
      <section className="about__section" id="data">
        <h2 className="about__section-title">数据来源</h2>
        {STUDY_CITY_IDS.map(city => <CitySources key={city} cityId={city} />)}
      </section>
      <section className="about__section" id="methods">
        <h2 className="about__section-title">方法说明</h2>
        <p className="about__paragraph">经营计划按面积、亩产、投入与售价核算收益，并比较单项条件变化带来的收益敏感性。风险比较结合预算，对单项条件作 ±20% 压力比较；结果表达情景差异，不表示损失概率。报告使用时间序列、季节波动与滞后关联等统计方法。</p>
        <div className="about__section" id="metrics"><h3 className="about__section-title">指标定义</h3>
          <dl className="about__metrics">{METRIC_DEFINITIONS.map(metric => <div className="about__metric" id={`metric-${metric.id}`} key={metric.id}>
            <dt>{metric.label}{metric.unit && <span className="about__metric-unit">{` / ${metric.unit}`}</span>}</dt>
            {metric.definition && <dd>{metric.definition}</dd>}
            {metric.formula && <dd className="about__metric-formula">计算：{metric.formula}</dd>}
            {metric.interpretation && <dd className="about__metric-note">解读：{metric.interpretation}</dd>}
            {metric.sourceIds?.length ? <dd className="about__metric-source">出处：{metric.sourceIds.join('、')}</dd> : null}
          </div>)}</dl>
        </div>
      </section>
    </div>
  </main>;
}

function CitySources({cityId}:{cityId:string}){
 const sources=useSources(cityId);const refs=useReferences(cityId);
 useEffect(()=>{let id:string;try{id=decodeURIComponent(window.location.hash.slice(1));}catch{return;}if(!id.startsWith('data-'))return;const node=document.getElementById(id);if(node){const details=node.closest('details');if(details)details.open=true;node.scrollIntoView?.({block:'start'});}},[sources.status]);
 const knowledge=refs.status==='ready'?refs.data.split('## 二、参考文献')[1]?.trim()??refs.data:'';
 return <details className="about__city-sources" open={cityId==='shenyang'}><summary>{getCity(cityId)?.shortName} · 来源与参考</summary>{sources.status==='ready'?<ul className="about__source-list">{sources.data.map(source=><li className="about__source" id={cityId==='shenyang'?`data-${source.source_id.toLowerCase()}`:`data-${cityId}-${source.source_id.toLowerCase()}`} key={source.source_id}><span className="about__source-publisher">{source.publisher||''}</span><span className="about__source-dataset">{source.url?<a href={source.url} target="_blank" rel="noreferrer noopener">{source.title} ↗</a>:source.title}</span><span className="about__source-meta">{source.data_period||''}</span></li>)}</ul>:<p role={sources.status==='error'?'alert':'status'}>{sources.status==='loading'?'来源载入中':'来源读取失败'}</p>}{knowledge&&<div className="about__references" id={cityId==='shenyang'?'knowledge':undefined}><h3>研究与知识来源</h3><MarkdownBlocks source={knowledge}/></div>}</details>;
}
