import type { V2Article } from '../../domain/research/v2/types';
import { assetUrl } from '../../domain/research/v2/repository';
import { MarkdownBlocks, TableAsset } from '../research-v2/blocks';
import { renderInline } from '../research-v2/markdown';
import { V2Figure } from '../research-v2/Figure';
import { productSections, productText } from './productContent';

/** Publication order is preserved. Each named asset is placed exactly once. */
export function reportArticleModel(article: V2Article) {
  const assetRefs = new Map<string, string>();
  article.tables.forEach((table, index) => assetRefs.set(table.file, `表 ${index + 1}`));
  article.figures.forEach((figure, index) => assetRefs.set(figure.file, `图 ${index + 1}`));
  const sections = productSections(article.sections);
  const showConclusion = !sections.some(section => section.title.includes('结论'));
  const showMethods = !sections.some(section => section.title.includes('方法'));
  const looseTables = new Set(article.tables.map(table => table.file));
  const looseFigures = new Set(article.figures.map(figure => figure.file));
  const placements = sections.map(section => {
    const tables = article.tables.filter(table => looseTables.has(table.file) && section.content.includes(table.file));
    const figures = article.figures.filter(figure => looseFigures.has(figure.file) && section.content.includes(figure.file));
    tables.forEach(table => looseTables.delete(table.file));
    figures.forEach(figure => looseFigures.delete(figure.file));
    return { section, tables, figures };
  });
  const navigation = [
    { id: 'abstract', title: '摘要' },
    ...sections.map(section => ({ id: `section-${section.number}`, title: section.title })),
    ...(looseFigures.size ? [{ id: 'report-figures', title: '图表' }] : []),
    ...(looseTables.size ? [{ id: 'report-tables', title: '数据表' }] : []),
    ...(showConclusion ? [{ id: 'report-conclusion', title: '结论' }] : []),
    ...(showMethods ? [{ id: 'report-methods', title: '方法' }] : []),
  ];
  return { assetRefs, placements, looseTables, looseFigures, showConclusion, showMethods, navigation };
}

export function ReportArticle({ article, scope, model }: { article: V2Article; scope: string; model: ReturnType<typeof reportArticleModel> }) {
  const { assetRefs, placements, looseTables, looseFigures, showConclusion, showMethods } = model;
  const refOrder = (ref: string | undefined) => Number((ref ?? '').replace(/\D/g, '')) || 1;
  return <article className="report__body">
    <header className="report__head">
      <h1 className="report__title">{article.title}</h1>
      <p className="report__summary">{renderInline(productText(article.frontend_summary), 'summary')}</p>
    </header>
    <section className="report__section" id="abstract">
      <h2 className="report__section-title">摘要</h2>
      <MarkdownBlocks source={productText(article.abstract)} refs={assetRefs} />
    </section>
    {placements.map(({ section, tables, figures }) => <section className="report__section" id={`section-${section.number}`} key={section.number}>
      <h2 className="report__section-title">{section.title}</h2>
      <MarkdownBlocks source={section.content} refs={assetRefs} />
      {tables.map(table => <div className="report__asset-wide" key={table.file}>
        <TableAsset cityId={scope} file={table.file} caption={`${assetRefs.get(table.file) ?? ''} · ${section.title}`} />
      </div>)}
      {figures.map(figure => <div className="report__asset-wide" key={figure.file}>
        <V2Figure src={assetUrl.figure(scope, figure.file)} alt={`${article.title} 配图`} index={refOrder(assetRefs.get(figure.file))} />
      </div>)}
    </section>)}
    {looseFigures.size > 0 && <section className="report__section" id="report-figures">
      <h2 className="report__section-title">图表</h2>
      {article.figures.filter(figure => looseFigures.has(figure.file)).map(figure => <div className="report__asset-wide" key={figure.file}>
        <V2Figure src={assetUrl.figure(scope, figure.file)} alt={`${article.title} 配图`} index={refOrder(assetRefs.get(figure.file))} />
      </div>)}
    </section>}
    {looseTables.size > 0 && <section className="report__section" id="report-tables">
      <h2 className="report__section-title">数据表</h2>
      {article.tables.filter(table => looseTables.has(table.file)).map(table => <div className="report__asset-wide" key={table.file}>
        <TableAsset cityId={scope} file={table.file} caption={`${assetRefs.get(table.file) ?? ''} · ${article.title}`} />
      </div>)}
    </section>}
    {showConclusion && <section className="report__section" id="report-conclusion">
      <h2 className="report__section-title">结论</h2>
      <MarkdownBlocks source={productText(article.conclusion)} refs={assetRefs} />
    </section>}
    {showMethods && <section className="report__section" id="report-methods">
      <h2 className="report__section-title">方法</h2>
      {article.methods.map((method, index) => <MarkdownBlocks key={index} source={productText(method.summary)} refs={assetRefs} />)}
    </section>}
  </article>;
}
