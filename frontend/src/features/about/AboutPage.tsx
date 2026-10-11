import { useEffect } from 'react';
import { STUDY_CITY_IDS, getCity } from '../../domain/geography/cities';
import { METRIC_DEFINITIONS, REANALYSIS_NOTE, VOLUME_UNIT_NOTE } from '../../domain/research/v2/metrics';
import { MarkdownBlocks } from '../research-v2/blocks';
import { renderInline, stripListPrefix } from '../research-v2/markdown';
import { useArticle, useReferences, useSources } from '../research-v2/useV2';
import { ModelEvidence, useProjectEvidence } from './ModelEvidence';
import './about.css';
const chapters=[['project','项目与问题'],['data-system','数据体系'],['processing','数据处理'],['models','分析与模型'],['validation','训练与验证'],['architecture','技术架构'],['data','来源与参考'],['metrics','指标定义'],['boundary','局限与边界']];
export function AboutPage(){
 const evidence=useProjectEvidence();const report=useArticle('shenyang','A9');
 useEffect(()=>{const show=()=>{const id=decodeURIComponent(window.location.hash.slice(1));const node=document.getElementById(id);if(!node)return;let parent=node.parentElement;while(parent){if(parent instanceof HTMLDetailsElement)parent.open=true;parent=parent.parentElement;}node.scrollIntoView?.({block:'start'});};show();window.addEventListener('hashchange',show);return()=>window.removeEventListener('hashchange',show);});
 return <main className="about about--publication"><nav className="about__outline" aria-label="关于页章节">{chapters.map(([id,title])=><a key={id} href={`#${id}`}>{title}</a>)}</nav><div className="about__article">
 <header className="about__head"><p className="ag-label">项目、方法与证据</p><h1 className="about__title">关于 AgriScope</h1><p className="about__lead">辽宁农业数据分析与决策平台。用可追溯的市场、生产与气候研究，帮助经营者比较实际投入、市场环境和上市情景。</p></header>
 <section className="about__section" id="project"><h2 className="about__section-title">项目与问题</h2><p className="about__paragraph">研究区为沈阳、铁岭、朝阳、锦州、丹东、大连。关注市场周期、气象响应和城市间差异；经营计划在六城都可按用户条件核算，价格模型与上市情景按本城实际能力开放。</p><p className="about__paragraph">研究原文、数据表、图表与来源按原产物呈现。研究结论、模型估计、历史观测和用户假设分别标注。</p></section>
 <section className="about__section" id="data-system"><h2 className="about__section-title">数据体系</h2><dl className="about__systems">{[
 ['市场价格','批发市场、农业主管部门及来源表登记的价格信息。沈阳、朝阳具备正式短期价格模型；锦州可读本城监测观测。各城市真实日期和粒度按原表展示。'],
 ['成交量','沈阳市场原始成交量记录。原始单位未公开，保留相对变化口径，不换算成吨，不进入这版冻结价格模型。'],
 ['农业生产','各市统计资料、农业部门资料及登记的公开生产数据。城市、区县与年度口径不同；年度观测不插值为日度行情。'],
 ['气象','ERA5 再分析温度与降水；历史年度指标用于暴露背景和城市比较，不代表站点实测或未来天气预报。'],
 ['土壤与环境','ERA5 土壤分层和研究中实际接入的环境变量，用于已有专题分析；未接入的城市或变量保持缺失。'],
 ['极端天气','研究算法按规则派生的事件与来源表中的官方通报分别呈现；事件关联不能直接解释为因果效应。'],
 ['研究证据','六城模块、跨城 A11 与综合解读直接读取已发布研究产物；草稿和待复核状态保留。'],
 ].map(([title,detail])=><div key={title}><dt>{title}</dt><dd>{detail}</dd></div>)}</dl><p className="about__paragraph about__paragraph--muted">{VOLUME_UNIT_NOTE} {REANALYSIS_NOTE}</p></section>
 <section className="about__section" id="processing"><h2 className="about__section-title">数据处理</h2><p className="about__paragraph">清洗使用实际日期、城市、作物、市场及来源标识，检查重复记录、非数值价格和不合理日期。只有可确认单位的价格才统一成元/kg；元/斤或元/500g 按真实单位乘 2，未知单位保持不可用。</p><ol className="about__list"><li>保留原始来源和价格层级，多源记录不混成一条虚构观测。</li><li>按观测日期对齐；缺失日不补成行情，不用研究年度数据替代市场日度数据。</li><li>使用质量标记识别异常值；生产检查保留原始值，待核验记录不作为正式市场模型输入。</li><li>研究的异常识别包含四分位距检查；异常标记不是自动删点，也不证明发生了市场冲击。</li><li>发布时校验快照、版本、输入指纹与资产摘要，正式模型和研究产物保留只读。</li></ol></section>
 <section className="about__section" id="models"><h2 className="about__section-title">分析与模型</h2><p className="about__paragraph">已有研究包含时间序列描述、市场周期、滞后关联、气象与生产响应、HRI 跟风环境和市场风险指标。具体方法、统计口径与阴性结果保留在对应原文及指标定义中。</p><p className="about__paragraph">短期价格按作物与期限选择注册表中的基线、LightGBM 或 CatBoost 方法。净收益以实际成本和亩产为条件核算，参考投入保持参考标记。长期分别估计上市窗口价格与周期市场均价；未通过独立生产门禁的结果仅作情景，150／180 天为探索参考。</p><p className="about__paragraph">研究中的平行情景和反事实实验未达到可靠预测门槛，保留为研究探索。相关性不等于因果；情景范围未经概率校准时不能解读为发生概率。</p></section>
 <section className="about__section" id="validation"><h2 className="about__section-title">训练与验证</h2>{evidence.data?<ModelEvidence data={evidence.data}/>:<div role={evidence.error?'alert':'status'}><p>{evidence.error||'读取冻结验证证据…'}</p>{evidence.error&&<button className="ag-button" onClick={evidence.retry}>重试验证证据</button>}</div>}</section>
 <section className="about__section" id="architecture"><h2 className="about__section-title">技术架构与发布</h2><Architecture/><p className="about__paragraph">前端使用 React、Vite 与 Three.js 空间场景；FastAPI 提供只读研究、市场、Daily 和模型接口。运行包只依赖自身 runtime，研发数据和模型通过 publishing 精选发布。模型在服务启动时绑定输入快照；请求不修改正式模型缓存路径。</p><p className="about__paragraph">Daily 链由已有采集、质量控制、快照生成、长期任务与选择性运行时发布组成。页面返回前台、重新进入和手动刷新重新读取有效快照。定时采集与部署启用属于后续运维步骤；本轮准备链路，不宣称已开启自动采集。</p></section>
 <section className="about__section" id="data"><h2 className="about__section-title">数据来源与参考</h2><p className="about__paragraph">来源名称、链接、等级和数据期来自每城真实来源表；未登记字段保持未登记。下列链接是来源登记记录，页面不把每条链接当前可访问性当作已验证事实。</p>{STUDY_CITY_IDS.map(city=><CitySources key={city} cityId={city}/>)}</section>
      <section className="about__section" id="metrics">
        <h2 className="about__section-title">指标定义</h2>
        <dl className="about__metrics">
          {METRIC_DEFINITIONS.map((metric) => (
            <div className="about__metric" id={`metric-${metric.id}`} key={metric.id}>
              <dt>
                {/*
                  单位写法（本轮 §22）：真实物理量写「指标 / 单位」，不用括号夹住；
                  没有单位就不写（绝不写「无量纲」）。
                */}
                {metric.label}
                {metric.unit && <span className="about__metric-unit">{` / ${metric.unit}`}</span>}
              </dt>
              {metric.definition && <dd>{metric.definition}</dd>}
              {metric.formula && <dd className="about__metric-formula">计算：{metric.formula}</dd>}
              {metric.interpretation && <dd className="about__metric-note">解读：{metric.interpretation}</dd>}
              {metric.sourceIds && metric.sourceIds.length > 0 && (
                <dd className="about__metric-source">出处：{metric.sourceIds.join('、')}</dd>
              )}
            </div>
          ))}
        </dl>
        <p className="about__paragraph about__paragraph--muted">
          仅收录研究正文与方法中明确写过的定义；尚未给出定义的自定义指标不在此列出，也不由前端补写。
        </p>
      </section>


 <section className="about__section" id="boundary"><h2 className="about__section-title">局限与边界</h2><ul className="about__list"><li>六城研究区不等于全省汇总，不推断未接入城市的生产或市场数据。</li><li>更新延迟按真实观测截止日展示；成功读取文件不等于成功采集新数据。</li><li>公式核算依赖用户假设；价格与情景不保证产量、收益或实际成交。</li><li>市场风险和气候暴露描述当前或历史环境，不代表未来损失概率。</li><li>保留不显著、阴性和不支持结果，不通过删点增强结论。</li></ul>{report.status==='ready'&&<details><summary>沈阳综合研究原始限制</summary><ul className="about__list">{report.data.limitations.map((item,i)=><li key={i}>{renderInline(stripListPrefix(item),`bound-${i}`)}</li>)}</ul></details>}</section>
 </div><aside className="about__metadata" aria-label="项目证据版本"><p className="ag-label">当前冻结记录</p>{evidence.data?<dl><dt>模型</dt><dd>{evidence.data.modelVersion}</dd><dt>训练数据</dt><dd>{evidence.data.dataVersion}</dd><dt>报告生成</dt><dd>{evidence.data.reportGeneratedAt}</dd><dt>训练完成</dt><dd>未独立登记</dd><dt>代码指纹</dt><dd>{evidence.data.fingerprint}</dd></dl>:<p>版本待核对</p>}<p className="about__paragraph--muted">模型报告生成、市场观测与运行时发布时间分别记录。</p></aside></main>;
}
function Architecture(){return <svg className="about__architecture" viewBox="0 0 720 260" role="img" aria-label="研发数据与模型经精选发布进入运行时，后端只读服务连接前端"><defs><marker id="about-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#7d766c"/></marker></defs>{[{x:20,y:25,w:185,title:'研发数据 / 模型',note:'采集 · 处理 · 训练 · 研究'},{x:265,y:25,w:185,title:'精选发布',note:'质量校验 · 清单 · 摘要'},{x:510,y:25,w:185,title:'运行时资产',note:'数据快照 · 模型 · 研究'},{x:265,y:165,w:185,title:'前端体验',note:'空间主页 · 三栏工作台'},{x:510,y:165,w:185,title:'只读后端',note:'市场 · Daily · 模型 · 研究'}].map(box=><g key={box.title}><rect x={box.x} y={box.y} width={box.w} height="70" fill="none" stroke="#c9c2b8"/><text x={box.x+12} y={box.y+28}>{box.title}</text><text className="about__diagram-note" x={box.x+12} y={box.y+52}>{box.note}</text></g>)}<g stroke="#7d766c" fill="none" markerEnd="url(#about-arrow)"><path d="M205 60H260"/><path d="M450 60H505"/><path d="M600 95V158"/><path d="M510 200H457"/></g></svg>}
function CitySources({cityId}:{cityId:string}){
 const sources=useSources(cityId);const refs=useReferences(cityId);
 useEffect(()=>{const id=decodeURIComponent(window.location.hash.slice(1));if(!id.startsWith('data-'))return;const node=document.getElementById(id);if(node){const details=node.closest('details');if(details)details.open=true;node.scrollIntoView?.({block:'start'});}},[sources.status]);
 const knowledge=refs.status==='ready'?refs.data.split('## 二、参考文献')[1]?.trim()??refs.data:'';
 return <details className="about__city-sources" open={cityId==='shenyang'}><summary>{getCity(cityId)?.shortName} · 来源与参考</summary>{sources.status==='ready'?<ul className="about__source-list">{sources.data.map(source=><li className="about__source" id={cityId==='shenyang'?`data-${source.source_id.toLowerCase()}`:`data-${cityId}-${source.source_id.toLowerCase()}`} key={source.source_id}><span className="about__source-publisher">{source.publisher||'发布机构未登记'}</span><span className="about__source-dataset">{source.url?<a href={source.url} target="_blank" rel="noreferrer noopener">{source.title} ↗</a>:source.title}</span><span className="about__source-meta">{source.data_period||'数据期未登记'}{source.source_grade?` · 等级 ${source.source_grade}`:''}</span></li>)}</ul>:<p role={sources.status==='error'?'alert':'status'}>{sources.status==='loading'?'来源载入中':'来源读取失败'}</p>}{knowledge&&<div className="about__references" id={cityId==='shenyang'?'knowledge':undefined}><h3>研究与知识来源</h3><MarkdownBlocks source={knowledge}/></div>}</details>;
}
