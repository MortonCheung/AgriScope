import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { getCity } from '../../domain/geography/cities';
import {
  getPoint,
  getTopic,
  listTopics,
  researchIdKind,
  topicOfPoint,
} from '../../domain/research/catalog';
import { ROUTES, canonicalResearchId, isLegacyPayloadResearchId } from '../../app/routes';
import { useArticle, useSources } from './useV2';
import { ResearchTree } from './ResearchTree';
import { InteractivePointView } from './InteractivePointView';
import { InteractiveTopicView } from './InteractiveTopicView';
import { ResearchArticleView } from './ResearchArticleView';
import { ResearchSources } from './ResearchSources';
import { renderInline, stripListPrefix } from './markdown';
import './research.css';

/**
 * 研究路由页（本轮 §9/§15/§28/§29）。
 *
 * 一个路由承载两个层级与两种模式：
 *   /cities/:cityId/research/A2        方向入口
 *   /cities/:cityId/research/A2.2      研究点（交互研究主战场）
 *   ?mode=article                      完整原文（从研究点进来时定位到对应章节）
 *
 * 布局（§28）：交互研究是**一个固定高度工作台**，左（研究树）/ 中 / 右（证据栏）
 * 各自独立滚动 —— 滚左不会带动中右。
 *
 * 模式切换（§29）：切换条挂在交互研究与原文的**共同父层**，两种模式都常驻、sticky 在
 * 内容滚动区顶部。本轮删除了所有重复的原文入口（§30）：右栏的「原文 →」、原文底部的
 * 「回到交互研究 →」、研究点里那段"方法与结论…打开原文"，模式切换只有这一处。
 *
 * 注意：所有 hook 都在最前面调用，编号兼容的重定向放在 hook 之后，
 * 这样同一路由在不同 researchId 之间切换时 hook 顺序不变。
 */
export function ResearchRoutePage() {
  const { cityId = '', researchId = '' } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') === 'article' ? 'article' : 'interactive';

  const canonical = canonicalResearchId(researchId);
  const city = getCity(cityId);
  const topics = listTopics(cityId);
  const kind = researchIdKind(cityId, canonical);
  const topic = kind === 'point' ? topicOfPoint(cityId, canonical) : getTopic(cityId, canonical);
  const point = kind === 'point' ? getPoint(cityId, canonical) : null;

  const articleId = topic?.articleId ?? null;
  const article = useArticle(cityId, articleId);
  const sourcesState = useSources(cityId);

  /** 旧链接用载荷编号（A01）；正式 URL 用 canonical（A1）。保留查询串再跳。 */
  if (isLegacyPayloadResearchId(researchId)) {
    return <Navigate to={`${ROUTES.research(cityId, canonical)}${location.search}`} replace />;
  }

  if (!city || !topic || kind === null) {
    return (
      <main className="research" data-mode="interactive">
        <div className="research__shell">
          <div className="research__main">
            <header className="research__head">
              <p className="research__id">{cityId} / {researchId}</p>
              <h1 className="research__title">研究条目不存在</h1>
            </header>
            <p className="research__paragraph">
              这个编号不在当前研究契约里。
              <Link to={ROUTES.city(cityId)}> 返回 {city?.shortName ?? cityId} 研究目录 →</Link>
            </p>
          </div>
        </div>
      </main>
    );
  }

  const allSources = sourcesState.status === 'ready' ? sourcesState.data : [];
  const resolvedSources = (article.status === 'ready' ? article.data.source_ids : [])
    .map((id) => allSources.find((source) => source.source_id === id))
    .filter((source): source is (typeof allSources)[number] => Boolean(source));
  const limitations = article.status === 'ready' ? article.data.limitations : [];
  const targetId = point?.id ?? topic.id;

  return (
    <main className="research" data-mode={mode} data-research-kind={kind}>
      <div className="research__shell">
        {mode === 'interactive' && (
          <aside className="research__tree">
            <Link className="research__crumb" to={ROUTES.city(cityId)}>← {city.shortName}</Link>
            <ResearchTree
              cityId={cityId}
              topics={topics}
              variant="rail"
              currentTopicId={topic.id}
              currentPointId={point?.id}
            />
          </aside>
        )}

        {/*
          中栏 = 模式切换条 + 内容，两者始终是**同一个**网格子项，且切换条两种模式都在（§29）。
          key 让"切换研究点 / 切换模式"时重放一次入场动效（§32）。
        */}
        <div className="research__column" key={`${targetId}:${mode}`}>
          <div className="research__modes" role="tablist" aria-label="阅读方式">
            <Link to={ROUTES.research(cityId, targetId)} aria-current={mode === 'interactive' ? 'page' : undefined}>交互研究</Link>
            <Link to={`${ROUTES.research(cityId, targetId)}?mode=article`} aria-current={mode === 'article' ? 'page' : undefined}>原文</Link>
          </div>
          <div className="research__stage">
            {mode === 'article' && article.status === 'ready' ? (
              <ResearchArticleView
                cityId={cityId}
                canonicalId={articleId as string}
                article={article.data}
                focusPointId={point?.id}
                focusSection={point?.sectionId ? Number(point.sectionId) : undefined}
              />
            ) : point ? (
              <InteractivePointView cityId={cityId} point={point} topic={topic} />
            ) : (
              <InteractiveTopicView cityId={cityId} topic={topic} />
            )}
          </div>
        </div>

        {mode === 'interactive' && (
          <aside className="research__rail">
            {/* 方向上下文只在交互研究右栏出现；进入原文的唯一入口是顶部切换条（§30）。 */}
            <div className="research__rail-block">
              <p className="research__rail-label">方向</p>
              <p>{topic.id} · {topic.title}</p>
            </div>

            {resolvedSources.length > 0 && (
              <div className="research__rail-block">
                <p className="research__rail-label">本方向来源</p>
                <ResearchSources sources={resolvedSources} compact />
              </div>
            )}

            {limitations.length > 0 && (
              <div className="research__rail-block">
                <p className="research__rail-label">本方向限制</p>
                <ul className="research__rail-list">
                  {limitations.map((item, index) => (
                    <li key={index}>{renderInline(stripListPrefix(item), `lim-${index}`)}</li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        )}
      </div>
    </main>
  );
}
