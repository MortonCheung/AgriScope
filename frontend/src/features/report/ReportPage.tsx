import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { getCity } from '../../domain/geography/cities';
import { ROUTES } from '../../app/routes';
import { assetUrl } from '../../domain/research/v2/repository';
import { reportArticleId } from '../../domain/research/catalog';
import { MarkdownBlocks, TableAsset } from '../research-v2/blocks';
import { renderInline, stripListPrefix } from '../research-v2/markdown';
import { V2Figure } from '../research-v2/Figure';
import { ModuleEvidenceRail } from '../research-v2/EvidenceRail';
import { WorkbenchLayout, WorkbenchMain, WorkbenchRail } from '../../components/workbench/WorkbenchLayout';
import { usePageNavigate } from '../../app/pageNavigation';
import { structuralParent } from '../../app/routes';
import { useArticle } from '../research-v2/useV2';
import '../research-v2/research.css';
import './reports.css';

/**
 * 正式报告（V5 §42/§72/§73/§74）。
 *
 * 与 Research Note 的区别：更完整、更连续、包含结论 / 方法 / 限制 / 来源。
 * 结构直接来自研究侧 A09，不再用前端自己拼的「风险画像 / 整城问答 / 专题卡片」当主报告。
 */
export function ReportPage() {
  const { cityId = '' } = useParams();
  const city = getCity(cityId);
  const location = useLocation();
  const navigate = usePageNavigate();
  const [activeSection, setActiveSection] = useState('abstract');
  const onEscape = () => navigate(structuralParent(location.pathname, location.search) ?? ROUTES.reports);
  /** 城市综合报告（A9）：它不属于研究树，因此单独由 catalog 声明（§29）。 */
  const reportId = reportArticleId(cityId);
  const articleState = useArticle(cityId, reportId);
  if (!city) {
    /**
     * §29：报告入口包含「城市正式报告」与「辽宁六城综合报告」两级。
     * `/reports/liaoning` 是省级综合报告的位置，研究侧尚未产出该报告的载荷——
     * 那就如实说明「研究内容待接入」，而不是谎称"未知城市"（§13：不编造、不谎报）。
     */
    const isProvinceReport = cityId !== '' && ROUTES.cityReport(cityId) === ROUTES.provinceReport;
    return (
      <WorkbenchLayout className="report-workbench" resetKey={cityId} sidebarLabel="报告章节" railLabel="报告依据" sidebar={() => null} onEscape={onEscape}><WorkbenchMain>
        <div className="report__body">
          <p className="report__meta">{isProvinceReport ? '综合 · 报告' : '报告'}</p>
          <h1 className="report__title">{isProvinceReport ? '辽宁六城综合研究' : '报告目录里没有这个入口'}</h1>
          <p className="report__empty">{isProvinceReport ? '研究内容待接入' : '请从报告目录进入。'}</p>
          <Link className="ag-button" to={ROUTES.reports}>返回报告目录</Link>
        </div>
      </WorkbenchMain><WorkbenchRail>{null}</WorkbenchRail></WorkbenchLayout>
    );
  }

  if (articleState.status !== 'ready') {
    return (
      <WorkbenchLayout className="report-workbench" resetKey={cityId} sidebarLabel="报告章节" railLabel="报告依据" sidebar={() => null} onEscape={onEscape}><WorkbenchMain>
        <div className="report__body">
          <header className="report__head">
            <p className="report__meta">{city.shortName} · 报告</p>
            <h1 className="report__title">{city.shortName}</h1>
          </header>
          <p className="report__empty" role={articleState.status === 'error' ? 'alert' : 'status'}>{articleState.status === 'loading' ? '研究正文载入中' : '研究正文读取失败；不展示占位内容。'}</p>
        </div>
      </WorkbenchMain><WorkbenchRail>{null}</WorkbenchRail></WorkbenchLayout>
    );
  }

  const article = articleState.data;
  /**
   * 图 / 表编号（V5 §35）：报告按研究自己声明的顺序编号，
   * 正文里的文件名因此可以换成「表 2」「图 1」，既不泄漏文件名又能对上号（§38）。
   */
  const assetRefs = new Map<string, string>();
  article.tables.forEach((table, index) => assetRefs.set(table.file, `表 ${index + 1}`));
  article.figures.forEach((figure, index) => assetRefs.set(figure.file, `图 ${index + 1}`));

  /**
   * A09 自己的章节已经包含「研究方法 / 研究局限 / 结论」。
   * 前端如果再把它们当独立区块追加一次，页面上就会出现两遍同名小节（§73/§74：
   * 不要另拼一套结构覆盖研究原文）。因此**只在原文章节没有覆盖时才补**。
   */
  const sectionTitles = article.sections.map((section) => section.title);
  const covered = (keywords: string[]) => sectionTitles.some((title) => keywords.some((word) => title.includes(word)));
  const showConclusion = !covered(['结论']);
  const showMethods = !covered(['方法']);
  const showLimitations = !covered(['限制', '局限']);

  /** 正文点名过的图 / 表就近落位；谁也没点名的才在文末集中呈现（避免出现两遍）。 */
  const looseTables = new Set(article.tables.map((table) => table.file));
  const looseFigures = new Set(article.figures.map((figure) => figure.file));
  const placements = article.sections.map((section) => {
    const tables = article.tables.filter((table) => looseTables.has(table.file) && section.content.includes(table.file));
    const figures = article.figures.filter((figure) => looseFigures.has(figure.file) && section.content.includes(figure.file));
    tables.forEach((table) => looseTables.delete(table.file));
    figures.forEach((figure) => looseFigures.delete(figure.file));
    return { section, tables, figures };
  });

  /** 「图 2」→ 2；只用于图注编号，取不到就退回 1。 */
  const refOrder = (ref: string | undefined) => Number((ref ?? '').replace(/\D/g, '')) || 1;

  return (
    <WorkbenchLayout className="report-workbench" resetKey={cityId} sidebarLabel="报告章节" railLabel="报告依据" onEscape={onEscape}
      sidebar={close => <ol className="workbench__menu">
        {[{ id: 'abstract', title: '摘要' }, ...article.sections.map(section => ({ id: `section-${section.number}`, title: section.title })),
          ...(looseFigures.size ? [{ id: 'report-figures', title: '图表' }] : []), ...(looseTables.size ? [{ id: 'report-tables', title: '数据表' }] : []),
          ...(showConclusion ? [{ id: 'report-conclusion', title: '结论' }] : []), ...(showMethods ? [{ id: 'report-methods', title: '方法' }] : []),
          ...(showLimitations && article.limitations.length ? [{ id: 'report-limitations', title: '研究限制' }] : [])].map(section => <li key={section.id}>
            <button type="button" aria-pressed={activeSection === section.id} onClick={() => { setActiveSection(section.id); const node = document.getElementById(section.id); node?.scrollIntoView?.({ block: 'start' }); const heading = node?.querySelector<HTMLElement>('h2'); heading?.setAttribute('tabindex', '-1'); heading?.focus({ preventScroll: true }); close(); }}>{section.title}</button>
          </li>)}
      </ol>}
    ><WorkbenchMain>
      <div className="report__body">
        <header className="report__head">
          <p className="report__meta">{reportId} · {city.shortName} · 综合研究</p>
          <h1 className="report__title">{article.title}</h1>
          <p className="report__summary">{renderInline(article.frontend_summary, 'summary')}</p>
        </header>

        <section className="report__section" id="abstract">
          <h2 className="report__section-title">摘要</h2>
          <MarkdownBlocks source={article.abstract} refs={assetRefs} />
        </section>

        {placements.map(({ section, tables, figures }) => (
          <section className="report__section" id={`section-${section.number}`} key={section.number}>
            <h2 className="report__section-title">{section.title}</h2>
            <MarkdownBlocks source={section.content} refs={assetRefs} />
            {tables.map((table) => (
              <div className="report__asset-wide" key={table.file}>
                <TableAsset cityId={cityId} file={table.file} caption={`${assetRefs.get(table.file) ?? ''} · ${section.title}`} />
              </div>
            ))}
            {figures.map((figure) => (
              <div className="report__asset-wide" key={figure.file}>
                <V2Figure src={assetUrl.figure(cityId, figure.file)} alt={`${article.title} 配图`} index={refOrder(assetRefs.get(figure.file))} />
              </div>
            ))}
          </section>
        ))}

        {looseFigures.size > 0 && (
          <section className="report__section" id="report-figures">
            <h2 className="report__section-title">图表</h2>
            {article.figures.filter((figure) => looseFigures.has(figure.file)).map((figure) => (
              <div className="report__asset-wide" key={figure.file}>
                <V2Figure src={assetUrl.figure(cityId, figure.file)} alt={`${article.title} 配图`} index={refOrder(assetRefs.get(figure.file))} />
              </div>
            ))}
          </section>
        )}

        {looseTables.size > 0 && (
          <section className="report__section" id="report-tables">
            <h2 className="report__section-title">数据表</h2>
            {article.tables.filter((table) => looseTables.has(table.file)).map((table) => (
              <div className="report__asset-wide" key={table.file}>
                <TableAsset cityId={cityId} file={table.file} caption={`${assetRefs.get(table.file) ?? ''} · ${article.title}`} />
              </div>
            ))}
          </section>
        )}

        {showConclusion && (
          <section className="report__section" id="report-conclusion">
            <h2 className="report__section-title">结论</h2>
            <MarkdownBlocks source={article.conclusion} refs={assetRefs} />
          </section>
        )}

        {showMethods && (
          <section className="report__section" id="report-methods">
            <h2 className="report__section-title">方法</h2>
            {article.methods.map((method, index) => <MarkdownBlocks key={index} source={method.summary} refs={assetRefs} />)}
          </section>
        )}

        {showLimitations && article.limitations.length > 0 && (
          <section className="report__section" id="report-limitations">
            <h2 className="report__section-title">研究限制</h2>
            <ul className="report__list">
              {article.limitations.map((item, index) => (
                <li key={index}>{renderInline(stripListPrefix(item), `lim-${index}`)}</li>
              ))}
            </ul>
          </section>
        )}


      </div>
    </WorkbenchMain><WorkbenchRail><ModuleEvidenceRail cityId={cityId} moduleId={reportId} title={article.title} article={article} /></WorkbenchRail></WorkbenchLayout>
  );
}
