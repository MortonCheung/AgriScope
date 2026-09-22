import { Link, useParams } from 'react-router-dom';
import { getCity } from '../../domain/geography/cities';
import { ROUTES } from '../../app/routes';
import { REPORT_ARTICLE_ID, v2AssetUrl } from '../../domain/research/v2/repository';
import { MarkdownBlocks, TableAsset } from '../research-v2/ResearchNotePage';
import { V2Figure } from '../research-v2/Figure';
import { ResearchSources } from '../research-v2/ResearchSources';
import { useV2Article, useV2Sources } from '../research-v2/useV2';
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
  const articleState = useV2Article(cityId === 'shenyang' ? REPORT_ARTICLE_ID : null);
  const sourcesState = useV2Sources();
  const allSources = sourcesState.status === 'ready' ? sourcesState.data : [];

  if (!city) {
    return (
      <main className="report">
        <div className="report__body">
          <p className="report__meta">报告</p>
          <h1 className="report__title">未知城市</h1>
          <Link className="ag-button" to={ROUTES.reports}>返回报告目录</Link>
        </div>
      </main>
    );
  }

  if (articleState.status !== 'ready') {
    return (
      <main className="report">
        <div className="report__body">
          <header className="report__head">
            <p className="report__meta">{city.shortName} · 报告</p>
            <h1 className="report__title">{city.shortName}</h1>
          </header>
          <p className="report__empty">研究内容待接入</p>
        </div>
      </main>
    );
  }

  const article = articleState.data;
  const sources = article.source_ids
    .map((id) => allSources.find((source) => source.source_id === id))
    .filter((source): source is (typeof allSources)[number] => Boolean(source));

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
    <main className="report">
      <div className="report__body">
        <header className="report__head">
          <p className="report__meta">{REPORT_ARTICLE_ID} · {city.shortName} · 综合研究</p>
          <h1 className="report__title">{article.title}</h1>
          <p className="report__summary">{article.frontend_summary}</p>
        </header>

        <section className="report__section">
          <h2 className="report__section-title">摘要</h2>
          <MarkdownBlocks source={article.abstract} refs={assetRefs} />
        </section>

        {placements.map(({ section, tables, figures }) => (
          <section className="report__section" id={`section-${section.number}`} key={section.number}>
            <h2 className="report__section-title">{section.title}</h2>
            <MarkdownBlocks source={section.content} refs={assetRefs} />
            {tables.map((table) => (
              <div className="report__asset-wide" key={table.file}>
                <TableAsset file={table.file} caption={`${assetRefs.get(table.file) ?? ''} · ${section.title}`} />
              </div>
            ))}
            {figures.map((figure) => (
              <div className="report__asset-wide" key={figure.file}>
                <V2Figure src={v2AssetUrl.figure(figure.file)} alt={`${article.title} 配图`} index={refOrder(assetRefs.get(figure.file))} />
              </div>
            ))}
          </section>
        ))}

        {looseFigures.size > 0 && (
          <section className="report__section">
            <h2 className="report__section-title">图表</h2>
            {article.figures.filter((figure) => looseFigures.has(figure.file)).map((figure) => (
              <div className="report__asset-wide" key={figure.file}>
                <V2Figure src={v2AssetUrl.figure(figure.file)} alt={`${article.title} 配图`} index={refOrder(assetRefs.get(figure.file))} />
              </div>
            ))}
          </section>
        )}

        {looseTables.size > 0 && (
          <section className="report__section">
            <h2 className="report__section-title">数据表</h2>
            {article.tables.filter((table) => looseTables.has(table.file)).map((table) => (
              <div className="report__asset-wide" key={table.file}>
                <TableAsset file={table.file} caption={`${assetRefs.get(table.file) ?? ''} · ${article.title}`} />
              </div>
            ))}
          </section>
        )}

        {showConclusion && (
          <section className="report__section">
            <h2 className="report__section-title">结论</h2>
            <MarkdownBlocks source={article.conclusion} refs={assetRefs} />
          </section>
        )}

        {showMethods && (
          <section className="report__section">
            <h2 className="report__section-title">方法</h2>
            {article.methods.map((method, index) => <MarkdownBlocks key={index} source={method.summary} refs={assetRefs} />)}
          </section>
        )}

        {showLimitations && article.limitations.length > 0 && (
          <section className="report__section">
            <h2 className="report__section-title">研究限制</h2>
            <ul className="report__list">
              {article.limitations.map((item, index) => (
                <li key={index}><MarkdownBlocks source={item} refs={assetRefs} /></li>
              ))}
            </ul>
          </section>
        )}

        <ResearchSources sources={sources} />
      </div>
    </main>
  );
}
