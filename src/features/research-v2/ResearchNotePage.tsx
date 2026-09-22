import { useMemo } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { getCity } from '../../domain/geography/cities';
import { ROUTES } from '../../app/routes';
import type { V2Article, V2Source } from '../../domain/research/v2/types';
import { V2Repository, v2AssetUrl } from '../../domain/research/v2/repository';
import { DataTable } from './DataTable';
import { V2Figure } from './Figure';
import { ResearchSources } from './ResearchSources';
import { parseMarkdownBlocks, renderInline } from './markdown';
import { useV2Article, useV2Manifest, useV2Sources, useV2Table } from './useV2';
import { VOLUME_UNIT_NOTE } from '../../domain/research/v2/metrics';
import './research-note.css';

type Mode = 'interactive' | 'article';

/** 只有被研究正文点名的表才配口径注；成交量口径只在出现成交量表时出现一次。 */
function tableNote(file: string): string | undefined {
  return /price_volume|daily_response|seasonal|trend|lag/i.test(file) ? VOLUME_UNIT_NOTE : undefined;
}

/** 一节里被点名的资产落位渲染；报告页复用同一套（V5 §74）。 */
export function TableAsset({ file, caption }: { file: string; caption: string }) {
  const table = useV2Table(file);
  if (table.status === 'loading') return <div className="research-note__asset-skeleton" aria-hidden />;
  if (table.status === 'error') return null;
  return <DataTable table={table.data} caption={caption} filterColumn="crop" note={tableNote(file)} />;
}

/** 有限 markdown 渲染（研究正文真实形态）；报告页复用。
 * `refs` 把正文里的文件名换成已渲染资产的编号（表 2 / 图 1），既保留引用语义又不泄漏文件名（§38）。 */
export function MarkdownBlocks({ source, refs }: { source: string; refs?: Map<string, string> }) {
  const blocks = useMemo(() => parseMarkdownBlocks(source), [source]);
  return (
    <>
      {blocks.map((block, index) => {
        const key = `md-${index}`;
        if (block.kind === 'heading') {
          const Tag = block.level <= 3 ? 'h3' : 'h4';
          return <Tag key={key} className="research-note__subheading">{renderInline(block.text, key, refs)}</Tag>;
        }
        if (block.kind === 'list') {
          return (
            <ul key={key} className="research-note__list">
              {block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`, refs)}</li>)}
            </ul>
          );
        }
        if (block.kind === 'table') {
          return (
            <div key={key} className="research-note__inline-table">
              <table>
                <thead><tr>{block.header.map((cell, cellIndex) => <th key={cellIndex}>{renderInline(cell, `${key}-h${cellIndex}`, refs)}</th>)}</tr></thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{renderInline(cell, `${key}-${rowIndex}-${cellIndex}`, refs)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p key={key} className="research-note__paragraph">{renderInline(block.text, key, refs)}</p>;
      })}
    </>
  );
}

/** 研究设计（V5 §30）：时间 / 数据 / 方法，全部来自研究自己的字段。 */
function ResearchDesign({ article, refs }: { article: V2Article; refs?: Map<string, string> }) {
  return (
    <section className="research-note__design">
      <h2 className="research-note__section-title">研究设计</h2>
      <div className="research-note__design-block">
        <p className="research-note__design-label">数据</p>
        <MarkdownBlocks source={article.data_scope.summary} refs={refs} />
      </div>
      <div className="research-note__design-block">
        <p className="research-note__design-label">方法</p>
        {article.methods.map((method, index) => <MarkdownBlocks key={index} source={method.summary} refs={refs} />)}
      </div>
    </section>
  );
}

export function ResearchNotePage() {
  const { cityId = '', articleId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const mode: Mode = params.get('mode') === 'article' ? 'article' : 'interactive';
  const city = getCity(cityId);
  const manifest = useV2Manifest();
  const sourcesState = useV2Sources();
  const articleState = useV2Article(articleId || null);

  const notes = manifest.status === 'ready' ? manifest.data.articles.filter((item) => item.id !== 'A09') : [];
  const allSources: V2Source[] = sourcesState.status === 'ready' ? sourcesState.data : [];

  const assets = useMemo(() => {
    if (articleState.status !== 'ready') return { perSection: new Map<string, { tables: string[]; figures: string[] }>(), figures: [], tables: [] };
    const article = articleState.data;
    const perSection = new Map<string, { tables: string[]; figures: string[] }>();
    const claimedTables = new Set<string>();
    const claimedFigures = new Set<string>();
    for (const section of article.sections) {
      const tables = article.tables.map((t) => t.file).filter((file) => !claimedTables.has(file) && section.content.includes(file));
      const figures = article.figures.map((f) => f.file).filter((file) => !claimedFigures.has(file) && section.content.includes(file));
      tables.forEach((file) => claimedTables.add(file));
      figures.forEach((file) => claimedFigures.add(file));
      perSection.set(section.number, { tables, figures });
    }
    return {
      perSection,
      tables: article.tables.map((t) => t.file).filter((file) => !claimedTables.has(file)),
      figures: article.figures.map((f) => f.file).filter((file) => !claimedFigures.has(file)),
    };
  }, [articleState]);

  const figureOrder = useMemo(() => {
    const order = new Map<string, number>();
    let index = 0;
    for (const section of articleState.status === 'ready' ? articleState.data.sections : []) {
      for (const file of assets.perSection.get(section.number)?.figures ?? []) { index += 1; order.set(file, index); }
    }
    for (const file of assets.figures) { index += 1; order.set(file, index); }
    return order;
  }, [articleState, assets]);

  const articleSources = useMemo(() => {
    if (articleState.status !== 'ready') return [];
    const ids = articleState.data.source_ids;
    return ids.map((id) => allSources.find((source) => source.source_id === id)).filter((source): source is V2Source => Boolean(source));
  }, [articleState, allSources]);

  /** 表序号：与资产落位顺序一致。 */
  const tableOrder = useMemo(() => {
    const order = new Map<string, number>();
    let index = 0;
    for (const section of articleState.status === 'ready' ? articleState.data.sections : []) {
      for (const file of assets.perSection.get(section.number)?.tables ?? []) { index += 1; order.set(file, index); }
    }
    for (const file of assets.tables) { index += 1; order.set(file, index); }
    return order;
  }, [articleState, assets]);

  /** 正文里的文件名 → 编号（§38：可见文本不得出现 .csv/.png）。 */
  const assetRefs = useMemo(() => {
    const refs = new Map<string, string>();
    tableOrder.forEach((number, file) => refs.set(file, `表 ${number}`));
    figureOrder.forEach((number, file) => refs.set(file, `图 ${number}`));
    return refs;
  }, [figureOrder, tableOrder]);

  if (!city || !articleId) return <Navigate to={ROUTES.root} replace />;

  if (articleState.status === 'error') {
    return (
      <main className="research-note">
        <div className="research-note__shell">
          <article className="research-note__body">
            <p className="research-note__meta">{articleId} · {city.shortName}</p>
            <h1 className="research-note__title">研究条目不存在</h1>
            <p className="research-note__lead">这一条研究内容不在当前已发布的研究清单里。</p>
            <Link className="ag-button" to={ROUTES.city(cityId)}>返回 {city.shortName}</Link>
          </article>
        </div>
      </main>
    );
  }

  const article = articleState.status === 'ready' ? articleState.data : null;

  return (
    <main className="research-note" data-mode={mode}>
      <div className="research-note__shell">
        {mode === 'interactive' ? (
          <aside className="research-note__tree" aria-label="研究条目">
            <Link className="research-note__crumb" to={ROUTES.city(cityId)}>{city.shortName}</Link>
            <ol className="research-note__tree-list">
              {notes.map((note) => (
                <li key={note.id} data-current={note.id === articleId || undefined}>
                  <Link to={ROUTES.researchNote(cityId, note.id)}>{note.title}</Link>
                </li>
              ))}
            </ol>
          </aside>
        ) : (
          <nav className="research-note__toc" aria-label="目录">
            <ol>
              {(article?.sections ?? []).map((section) => (
                <li key={section.number}><a href={`#section-${section.number}`}>{section.title}</a></li>
              ))}
            </ol>
          </nav>
        )}

        <article className="research-note__body">
          <header className="research-note__header">
            <p className="research-note__meta">{articleId} · {city.shortName}</p>
            <h1 className="research-note__title">{article?.title ?? '读取中'}</h1>
            {article && <p className="research-note__lead">{article.frontend_summary}</p>}
            <div className="research-note__modes" role="tablist" aria-label="阅读模式">
              <button type="button" role="tab" aria-selected={mode === 'interactive'} onClick={() => setParams({})}>交互研究</button>
              <button type="button" role="tab" aria-selected={mode === 'article'} onClick={() => setParams({ mode: 'article' })}>原文</button>
            </div>
          </header>

          {article && mode === 'article' && <ResearchDesign article={article} refs={assetRefs} />}

          {(article?.sections ?? []).map((section) => (
            <section className="research-note__section" id={`section-${section.number}`} key={section.number}>
              <h2 className="research-note__section-title">{section.title}</h2>
              <MarkdownBlocks source={section.content} refs={assetRefs} />
              {(assets.perSection.get(section.number)?.tables ?? []).map((file) => (
                <TableAsset key={file} file={file} caption={`表 · ${section.title}`} />
              ))}
              {(assets.perSection.get(section.number)?.figures ?? []).map((file) => (
                <V2Figure key={file} src={v2AssetUrl.figure(file)} alt={`${article?.title ?? ''} 配图`} index={figureOrder.get(file) ?? 1} />
              ))}
            </section>
          ))}

          {assets.tables.length + assets.figures.length > 0 && (
            <section className="research-note__section">
              <h2 className="research-note__section-title">数据与图表</h2>
              {assets.tables.map((file) => <TableAsset key={file} file={file} caption={`表 · ${file.split('_')[0]} ${file.split('_').slice(1).join(' ').replace('.csv', '')}`} />)}
              {assets.figures.map((file) => (
                <V2Figure key={file} src={v2AssetUrl.figure(file)} alt={`${article?.title ?? ''} 配图`} index={figureOrder.get(file) ?? 1} />
              ))}
            </section>
          )}

          {article && (
            <section className="research-note__section research-note__conclusion">
              <h2 className="research-note__section-title">结论与边界</h2>
              <p className="research-note__paragraph">{article.conclusion}</p>
              {mode === 'article' && article.limitations.length > 0 && (
                <>
                  <h3 className="research-note__subheading">研究限制</h3>
                  <ul className="research-note__list">
                    {article.limitations.map((item, index) => <li key={index}>{renderInline(item, `lim-${index}`)}</li>)}
                  </ul>
                </>
              )}
            </section>
          )}

          <ResearchSources sources={articleSources} />
        </article>

        {mode === 'interactive' && article && (
          <aside className="research-note__rail" aria-label="研究信息">
            <div className="research-note__rail-block">
              <p className="research-note__rail-label">研究对象</p>
              <p>{article.research_questions[0] ?? '—'}</p>
            </div>
            <div className="research-note__rail-block">
              <p className="research-note__rail-label">关键词</p>
              <p>{article.keywords.join(' · ')}</p>
            </div>
            {article.limitations.length > 0 && (
              <div className="research-note__rail-block">
                <p className="research-note__rail-label">限制</p>
                <p>{article.limitations[0]}</p>
              </div>
            )}
            <div className="research-note__rail-block">
              <p className="research-note__rail-label">来源</p>
              <p>{articleSources.map((source) => source.publisher).join('；') || '来源待补充'}</p>
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
