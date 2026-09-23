import { useEffect, useMemo } from 'react';
import type { V2Article } from '../../domain/research/v2/types';
import { assetUrl } from '../../domain/research/v2/repository';
import { V2Figure } from './Figure';
import { ResearchSources } from './ResearchSources';
import { MarkdownBlocks, TableAsset } from './blocks';
import { useSources } from './useV2';
import { ROUTES } from '../../app/routes';
import './research-article.css';

/**
 * 原文模式（本轮 §15）：**完整的一篇方向文章**。
 *
 * 与交互研究的分工必须一眼可辨：
 *   交互研究 = 一个具体研究点 + 数据模块 + 研究侧原句；
 *   原文     = 窄目录 + 连续正文 + 图 + 表 + 来源，没有数据选择器、没有证据栏、没有后台式卡片。
 *
 * 从某个研究点切到原文时，`focusSection` 会把对应章节高亮并滚过去
 * （前提是 catalog 声明了 sectionId；没有声明就不假装能定位）。
 */
export function ResearchArticleView({ cityId, canonicalId, article, focusPointId, focusSection }: {
  cityId: string;
  canonicalId: string;
  article: V2Article;
  focusPointId?: string;
  focusSection?: number;
}) {
  const sourcesState = useSources(cityId);
  const allSources = sourcesState.status === 'ready' ? sourcesState.data : [];
  const sources = article.source_ids
    .map((id) => allSources.find((source) => source.source_id === id))
    .filter((source): source is (typeof allSources)[number] => Boolean(source));

  /** 图 / 表编号：按研究自己声明的顺序（§35）。 */
  const assetRefs = new Map<string, string>();
  article.tables.forEach((table, index) => assetRefs.set(table.file, `表 ${index + 1}`));
  article.figures.forEach((figure, index) => assetRefs.set(figure.file, `图 ${index + 1}`));

  /** 正文点名过的资产就近落位；谁也没点名的才在文末集中呈现。 */
  const placements = useMemo(() => {
    const looseTables = new Set(article.tables.map((table) => table.file));
    const looseFigures = new Set(article.figures.map((figure) => figure.file));
    const result = article.sections.map((section) => {
      const tables = article.tables.filter((table) => looseTables.has(table.file) && section.content.includes(table.file));
      const figures = article.figures.filter((figure) => looseFigures.has(figure.file) && section.content.includes(figure.file));
      tables.forEach((table) => looseTables.delete(table.file));
      figures.forEach((figure) => looseFigures.delete(figure.file));
      return { section, tables, figures };
    });
    return { result, looseTables, looseFigures };
  }, [article]);

  /** 从研究点切到原文：把对应章节滚进视野（只在声明过 sectionId 时）。 */
  useEffect(() => {
    if (!focusSection) return;
    const target = document.getElementById(`section-${focusSection}`);
    target?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, [focusSection]);

  const refOrder = (ref: string | undefined) => Number((ref ?? '').replace(/\D/g, '')) || 1;

  return (
    <article className="article">
      <nav className="article__toc" aria-label="目录">
        <ol>
          {article.sections.map((section) => (
            <li key={section.number}>
              <a href={`#section-${section.number}`} data-focus={String(section.number) === String(focusSection) || undefined}>
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="article__body">
        <header className="article__head">
          <p className="article__meta">{canonicalId} · 原文</p>
          <h1 className="article__title">{article.title}</h1>
          {article.frontend_summary && <p className="article__lead">{article.frontend_summary}</p>}
          {focusPointId && focusSection && (
            <p className="article__focus-note">正在对照研究点 {focusPointId}</p>
          )}
        </header>

        <section className="article__section">
          <h2 className="article__section-title">摘要</h2>
          <MarkdownBlocks source={article.abstract} refs={assetRefs} />
        </section>

        {placements.result.map(({ section, tables, figures }) => (
          <section
            className="article__section"
            id={`section-${section.number}`}
            key={section.number}
            data-focus={String(section.number) === String(focusSection) || undefined}
          >
            <h2 className="article__section-title">{section.title}</h2>
            <MarkdownBlocks source={section.content} refs={assetRefs} />
            {tables.map((table) => (
              <div className="article__asset" key={table.file}>
                <TableAsset cityId={cityId} file={table.file} caption={`${assetRefs.get(table.file) ?? ''} · ${section.title}`} />
              </div>
            ))}
            {figures.map((figure) => (
              <div className="article__asset" key={figure.file}>
                <V2Figure src={assetUrl.figure(cityId, figure.file)} alt={`${article.title} 配图`} index={refOrder(assetRefs.get(figure.file))} />
              </div>
            ))}
          </section>
        ))}

        {placements.looseFigures.size > 0 && (
          <section className="article__section">
            <h2 className="article__section-title">图表</h2>
            {article.figures.filter((figure) => placements.looseFigures.has(figure.file)).map((figure) => (
              <div className="article__asset" key={figure.file}>
                <V2Figure src={assetUrl.figure(cityId, figure.file)} alt={`${article.title} 配图`} index={refOrder(assetRefs.get(figure.file))} />
              </div>
            ))}
          </section>
        )}

        {placements.looseTables.size > 0 && (
          <section className="article__section">
            <h2 className="article__section-title">数据表</h2>
            {article.tables.filter((table) => placements.looseTables.has(table.file)).map((table) => (
              <div className="article__asset" key={table.file}>
                <TableAsset cityId={cityId} file={table.file} caption={`${assetRefs.get(table.file) ?? ''} · ${article.title}`} />
              </div>
            ))}
          </section>
        )}

        <section className="article__section article__section--wide">
          <h2 className="article__section-title">方法</h2>
          {article.methods.map((method, index) => <MarkdownBlocks key={index} source={method.summary} refs={assetRefs} />)}
        </section>

        <section className="article__section">
          <h2 className="article__section-title">结论</h2>
          <MarkdownBlocks source={article.conclusion} refs={assetRefs} />
        </section>

        {article.limitations.length > 0 && (
          <section className="article__section">
            <h2 className="article__section-title">研究限制</h2>
            <ul className="research-note__list">
              {article.limitations.map((item, index) => (
                <li key={index}><MarkdownBlocks source={item} refs={assetRefs} /></li>
              ))}
            </ul>
          </section>
        )}

        <ResearchSources sources={sources} />

        <p className="article__back">
          <a href={ROUTES.research(cityId, focusPointId ?? canonicalId)}>回到交互研究 →</a>
        </p>
      </div>
    </article>
  );
}
