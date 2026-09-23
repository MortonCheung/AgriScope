import { reportArticleId, listCatalogCityIds } from '../../domain/research/catalog';
import { METRIC_DEFINITIONS, REANALYSIS_NOTE, VOLUME_UNIT_NOTE } from '../../domain/research/v2/metrics';
import { MarkdownBlocks } from '../research-v2/blocks';
import { renderInline } from '../research-v2/markdown';
import { useArticle, useReferences, useSources } from '../research-v2/useV2';
import './about.css';

/**
 * 「关于」描述的是当前城市的正式研究。
 * 城市从 catalog 注册表取第一个（只有一个城市时就是它），
 * 不把 shenyang 字符串散落在组件里（§6）。
 */
const ABOUT_CITY_ID = listCatalogCityIds()[0] ?? '';

/**
 * 关于（V5 §49–§53）：把「关于」做成**研究溯源索引**，而不是开发说明。
 *
 * 结构：项目 / 数据来源 / 研究与知识来源 / 指标定义 / 证据规范 / 研究边界 / 求索研究系列。
 * §51：数据来源从研究侧真正的 source table 读，不显示 `weather.csv` 这类文件。
 * §52：知识来源只展示研究侧已给引用的条目；没有引用的记入 KNOWLEDGE_SOURCE_GAPS，不编 DOI。
 * §82：数据来源与指标定义都带 anchor，文章里可以跳过来。
 */
export function AboutPage() {
  const cityId = ABOUT_CITY_ID;
  const sourcesState = useSources(cityId);
  const referencesState = useReferences(cityId);
  const reportState = useArticle(cityId, reportArticleId(cityId));

  const sources = sourcesState.status === 'ready' ? sourcesState.data : [];
  /** references.md 的「一、数据来源」与上面的表格重复，只取「二、参考文献」。 */
  const knowledge = referencesState.status === 'ready'
    ? referencesState.data.split('## 二、参考文献')[1]?.trim() ?? referencesState.data
    : '';
  const limitations = reportState.status === 'ready' ? reportState.data.limitations : [];

  return (
    <main className="about">
      <header className="about__head">
        <h1 className="about__title">关于 AgriScope</h1>
        <p className="about__lead">
          辽宁省农业气候风险研究：以沈阳为主的农产品批发市场与农业生产在气象条件下的表现，
          以及极端天气事件的市场响应。研究成果以「研究」逐条呈现，以「报告」整体成文，以「推演」做平行情景实验。
        </p>
      </header>

      <section className="about__section" id="project">
        <h2 className="about__section-title">项目</h2>
        <p className="about__paragraph">
          研究覆盖 10 种主要蔬菜的日度批发价格与成交量、ERA5 再分析气象与分层土壤条件、
          算法派生的极端天气事件，以及 8 个农业区县的生产数据。
          所有数字来自研究工程重新执行的分析，并逐条对应到可追溯的来源。
        </p>
        <p className="about__paragraph">
          <strong>读数口径</strong>：{VOLUME_UNIT_NOTE} {REANALYSIS_NOTE}
        </p>
      </section>

      <section className="about__section" id="data">
        <h2 className="about__section-title">数据来源</h2>
        {sources.length === 0
          ? <p className="about__paragraph">来源待补充</p>
          : (
            <ul className="about__source-list">
              {sources.map((source) => (
                <li className="about__source" id={`data-${source.source_id.toLowerCase()}`} key={source.source_id}>
                  <span className="about__source-publisher">{source.publisher}</span>
                  <span className="about__source-dataset">
                    {source.url ? <a href={source.url} target="_blank" rel="noreferrer noopener">{source.title} ↗</a> : source.title}
                  </span>
                  <span className="about__source-meta">
                    {source.data_period}{source.source_grade ? ` · 等级 ${source.source_grade}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
      </section>

      <section className="about__section" id="knowledge">
        <h2 className="about__section-title">研究与知识来源</h2>
        <p className="about__paragraph">
          方法、统计工具与参考框架的出处，逐条来自研究工程自己的参考文献清单（含已核验 DOI）。
        </p>
        {knowledge ? <MarkdownBlocks source={knowledge} /> : <p className="about__paragraph">来源待补充</p>}
      </section>

      <section className="about__section" id="metrics">
        <h2 className="about__section-title">指标定义</h2>
        <dl className="about__metrics">
          {METRIC_DEFINITIONS.map((metric) => (
            <div className="about__metric" id={`metric-${metric.id}`} key={metric.id}>
              <dt>
                {metric.label}
                {metric.unit && <span className="about__metric-unit">（{metric.unit}）</span>}
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

      <section className="about__section" id="evidence">
        <h2 className="about__section-title">证据规范</h2>
        <ul className="about__list">
          <li>气象为 ERA5 再分析，<strong>不写作</strong>气象站实测。</li>
          <li>成交量原始单位未公开，所有成交量结论只作相对口径，<strong>禁止</strong>换算为吨或箱。</li>
          <li>算法派生的极端天气事件与官方通报<strong>分开</strong>呈现，不互相替代。</li>
          <li>阴性结果与不显著结果按原样保留，不做筛选展示。</li>
          <li>平行情景实验未达到可靠反事实预测门槛，只作情景演示，不作预测。</li>
        </ul>
      </section>

      {limitations.length > 0 && (
        <section className="about__section" id="boundary">
          <h2 className="about__section-title">研究边界</h2>
          <ul className="about__list">
            {limitations.slice(0, 6).map((item, index) => (
              <li key={index}>{renderInline(item, `bound-${index}`)}</li>
            ))}
          </ul>
        </section>
      )}

      <footer className="about__foot">
        <span>求索研究系列 / 001</span>
        <span>AgriScope</span>
      </footer>
    </main>
  );
}
