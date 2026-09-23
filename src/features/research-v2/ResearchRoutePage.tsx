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
import './research.css';

/** 证据栏放的是提示性摘句，取研究侧原句的第一句，不改写。 */
function firstSentence(text: string): string {
  const match = /^[^。；\n]{4,120}/.exec(text.trim());
  return match ? `${match[0]}。` : text;
}

/**
 * 研究路由页（本轮 §9/§15）。
 *
 * 一个路由承载两个层级与两种模式：
 *   /cities/:cityId/research/A2        方向入口
 *   /cities/:cityId/research/A2.2      研究点（交互研究主战场）
 *   ?mode=article                      完整原文（从研究点进来时定位到对应章节）
 *
 * 交互研究与原文的 DOM 必须明显不同：
 *   交互研究有数据模块容器与右侧证据栏；原文有连续正文与窄目录、没有证据栏。
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

        {mode === 'article' && article.status === 'ready' ? (
          <ResearchArticleView
            cityId={cityId}
            canonicalId={articleId as string}
            article={article.data}
            focusPointId={point?.id}
            focusSection={point?.sectionId ? Number(point.sectionId) : undefined}
          />
        ) : (
          /* 交互研究的中栏是**一个**网格子项：模式切换条 + 研究正文。
             二者必须是同一个 children，否则网格会把切换条当成中栏、
             把正文挤进右侧 250px 的证据栏（§31：中栏是阅读区，不是窄栏）。 */
          <div className="research__column" key={`${point?.id ?? topic.id}:${mode}`}>
            <div className="research__modes" role="tablist" aria-label="阅读方式">
              <Link to={ROUTES.research(cityId, point?.id ?? topic.id)} aria-current={mode === 'interactive' ? 'page' : undefined}>交互研究</Link>
              <Link to={`${ROUTES.research(cityId, point?.id ?? topic.id)}?mode=article`} aria-current={mode === 'article' ? 'page' : undefined}>原文</Link>
            </div>
            {/* key 让"切换研究点 / 切换模式"时重放一次入场动效（§32） */}
            <div className="research__stage">
              {point ? (
                <InteractivePointView cityId={cityId} point={point} topic={topic} />
              ) : (
                <InteractiveTopicView cityId={cityId} topic={topic} />
              )}
            </div>
          </div>
        )}

        {mode === 'interactive' && (
          <aside className="research__rail">
            <div className="research__rail-block">
              <p className="research__rail-label">方向</p>
              <p>
                {topic.id} · {topic.title}
                <br />
                <Link to={`${ROUTES.research(cityId, point?.id ?? topic.id)}?mode=article`}>原文 →</Link>
              </p>
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
                  {limitations.map((item, index) => <li key={index}>{firstSentence(item)}</li>)}
                </ul>
              </div>
            )}
          </aside>
        )}
      </div>
    </main>
  );
}
