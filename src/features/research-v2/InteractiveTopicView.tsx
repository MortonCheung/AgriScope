import { Link } from 'react-router-dom';
import type { ResearchTopic } from '../../domain/research/catalog';
import { pointStatusLabel } from '../../domain/research/catalog/labels';
import { ROUTES } from '../../app/routes';
import { useArticle, useTable } from './useV2';
import { DataTable } from './DataTable';

/** 一张声明表：单独组件，保证 `useTable` 的调用位置稳定。 */
function TopicTable({ cityId, file, caption }: { cityId: string; file: string; caption: string }) {
  const state = useTable(cityId, file);
  if (state.status !== 'ready') return null;
  return <DataTable table={state.data} caption={caption} filterColumn="crop" maxRows={24} />;
}

/**
 * 方向页（本轮 §9/§15）。
 *
 * 进入 A2 时看到的是**这个方向在研究什么**：
 *   · 方向的全部研究点（研究侧冻结结构，数量按 catalog，不假定 11）
 *   · 本方向研究数据 —— 文章声明的表，按研究自己的列呈现
 *
 * 这里刻意不是"文章的另一种排版"：交互研究给数据，原文给连续正文（§15）。
 */
export function InteractiveTopicView({ cityId, topic }: { cityId: string; topic: ResearchTopic }) {
  const article = useArticle(cityId, topic.articleId);
  const tables = article.status === 'ready' ? article.data.tables : [];

  return (
    <div className="research__main">
      <header className="research__head">
        <p className="research__id">{topic.id}</p>
        <h1 className="research__title">{topic.title}</h1>
        <p className="research__article-title">{topic.articleTitle}</p>
        <p className="research__lead">{topic.points.length} 个研究点</p>
      </header>

      <section className="research__block">
        <h2 className="research__block-title">研究点</h2>
        <ol className="research__points">
          {topic.points.map((point) => (
            <li className="research__point" key={point.id}>
              <Link className="research__point-link" to={ROUTES.research(cityId, point.id)}>
                <span className="research__point-id">{point.id}</span>
                <span>{point.title}</span>
                {point.status !== 'ready' && (
                  <span className="research__point-state">{pointStatusLabel(point.status)}</span>
                )}
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {tables.length > 0 && (
        <section className="research__block">
          <h2 className="research__block-title">本方向研究数据</h2>
          {tables.map((table, index) => (
            <details className="research__data-table" key={table.file}>
              <summary>表 {index + 1}</summary>
              <TopicTable cityId={cityId} file={table.file} caption={`${topic.id} · 表 ${index + 1}`} />
            </details>
          ))}
        </section>
      )}
    </div>
  );
}
