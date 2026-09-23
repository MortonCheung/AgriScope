import { Link } from 'react-router-dom';
import type { ResearchPoint, ResearchTopic } from '../../domain/research/catalog';
import { pointStatusLabel, quoteLabel } from '../../domain/research/catalog/labels';
import { ROUTES } from '../../app/routes';
import { useArticle } from './useV2';
import { ResearchQuote } from './blocks';
import { renderInline } from './markdown';

/**
 * 城市研究 App 的右侧预览（本轮 §22）。
 *
 * 它回答"我选中的到底是哪一条研究"，而**不是**把整篇文章塞进来：
 *   选中方向（A1）→ 方向标题 / 正式文章标题 / frontend_summary / 研究点数量与状态分布 / 简短点位列表；
 *   选中研究点（A1.6）→ 研究点标题 / 研究问题（研究侧有才显示）/ 状态 / 数据状态 / 一条研究侧引句。
 *
 * 进入研究**只有**这里一个入口（§21/§30）。文本一律过 `renderInline`（§53），
 * 任何来自研究侧的文字都不会把 `**` 或数据文件名泄进 DOM。
 */

export interface StatusCounts {
  ready: number;
  pending: number;
  unsupported: number;
}

/** 方向的 ready / pending / unsupported 分布（纯统计，不改变任何研究结论）。 */
export function countStatuses(topic: ResearchTopic): StatusCounts {
  const counts: StatusCounts = { ready: 0, pending: 0, unsupported: 0 };
  for (const point of topic.points) counts[point.status] += 1;
  return counts;
}

/** 研究点的数据状态（前端只描述表现形式，不生成数值）。 */
function dataStatusLabel(point: ResearchPoint): string {
  if (!point.binding) return '暂无数据绑定';
  return point.binding.view === 'chart' ? '交互图表' : '结果表';
}

export function CityResearchPreview({ cityId, topics, selectedId }: {
  cityId: string;
  topics: ResearchTopic[];
  selectedId: string | null;
}) {
  const topic = topics.find((entry) => entry.id === selectedId)
    ?? topics.find((entry) => entry.points.some((point) => point.id === selectedId))
    ?? null;
  const point = topic?.points.find((entry) => entry.id === selectedId) ?? null;

  /** 方向的摘要来自研究侧 frontend_summary；hook 位置固定，不能放进条件里。 */
  const article = useArticle(cityId, topic?.articleId ?? null);

  if (!topic) {
    return <div className="city-preview__empty">从左侧选择一个方向或研究点</div>;
  }

  if (!point) {
    const counts = countStatuses(topic);
    const summary = article.status === 'ready' ? article.data.frontend_summary : '';
    return (
      <article className="city-preview" data-kind="topic" data-animate="in" key={topic.id}>
        <p className="city-preview__id">{topic.id}</p>
        <h2 className="city-preview__title">{topic.title}</h2>
        <p className="city-preview__subtitle">{topic.articleTitle}</p>

        {summary && <p className="city-preview__summary">{renderInline(summary, 'summary')}</p>}

        <dl className="city-preview__counts">
          <div><dt>研究点</dt><dd>{topic.points.length}</dd></div>
          <div><dt>已有内容</dt><dd>{counts.ready}</dd></div>
          <div><dt>待接入</dt><dd>{counts.pending}</dd></div>
          <div><dt>数据不足</dt><dd>{counts.unsupported}</dd></div>
        </dl>

        <section className="city-preview__section">
          <h3 className="city-preview__label">研究点</h3>
          <ol className="city-preview__points">
            {topic.points.map((entry) => (
              <li className="city-preview__point" key={entry.id}>
                <span className="city-preview__point-id">{entry.id}</span>
                <span className="city-preview__point-title">{entry.title}</span>
                {entry.status !== 'ready' && (
                  <span className="city-preview__point-state">{pointStatusLabel(entry.status)}</span>
                )}
              </li>
            ))}
          </ol>
        </section>

        <Link className="city-preview__enter" to={ROUTES.research(cityId, topic.id)}>进入 {topic.id} 研究 →</Link>
      </article>
    );
  }

  const citation = point.citations?.[0];
  return (
    <article className="city-preview" data-kind="point" data-animate="in" key={point.id}>
      <p className="city-preview__id">{point.id}</p>
      <h2 className="city-preview__title">{point.title}</h2>
      <p className="city-preview__subtitle">{topic.id} · {topic.title}</p>

      {point.question && <p className="city-preview__question">{renderInline(point.question, 'question')}</p>}

      <dl className="city-preview__counts">
        <div><dt>研究状态</dt><dd>{pointStatusLabel(point.status)}</dd></div>
        <div><dt>数据状态</dt><dd>{dataStatusLabel(point)}</dd></div>
      </dl>

      {point.reason && <p className="city-preview__reason">{renderInline(point.reason, 'reason')}</p>}

      {citation && (
        <section className="city-preview__section">
          <h3 className="city-preview__label">研究侧原句</h3>
          <ResearchQuote quote={citation.quote} cite={quoteLabel(point.articleId, citation.section)} />
        </section>
      )}

      <Link className="city-preview__enter" to={ROUTES.research(cityId, point.id)}>进入研究 →</Link>
    </article>
  );
}
