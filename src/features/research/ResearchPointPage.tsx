import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ROUTES } from '../../app/routes';
import { AsyncBoundary } from '../../components/AsyncState';
import { EvidenceBadge, StatusBadge } from '../../components/EvidenceBadge';
import { KeyNumberGrid } from '../../components/KeyNumberGrid';
import { EVIDENCE_LEVELS } from '../../domain/research';
import { MOTION_SPRING } from '../../design/motion';
import type { CityResearchIndex, ResearchArticle, ResearchPoint } from '../../domain/research/types';
import { ResearchRepository } from '../../services/ResearchRepository';
import { useCityResearch, type AsyncState } from '../../services/useCityResearch';
import { ResearchArticleView } from './ResearchArticleView';
import { InteractiveResearchBody } from './widgets/ResearchModules';
import { ResearchInsightDock } from '../insight/ResearchInsightDock';
import { useResearchContextStore } from '../insight/researchContextStore';
import './research-point.css';

type Mode = 'interactive' | 'article';

function useArticle(cityId: string, articleId: string | null): AsyncState<ResearchArticle> {
  const [state, setState] = useState<AsyncState<ResearchArticle>>({ status: 'loading' });
  useEffect(() => {
    if (!articleId) { setState({ status: 'error', error: '该研究点没有可用的研究原文' }); return; }
    let alive = true;
    setState({ status: 'loading' });
    ResearchRepository.getResearchArticle(cityId, articleId)
      .then((data) => { if (alive) setState({ status: 'ready', data }); })
      .catch((error: unknown) => { if (alive) setState({ status: 'error', error: error instanceof Error ? error.message : '加载失败' }); });
    return () => { alive = false; };
  }, [cityId, articleId]);
  return state;
}

/**
 * 交互研究页：默认进入"交互研究"，第二入口是"查看原文"，
 * 两者共享同一个 ResearchPoint，并支持双向跳转。
 */
export function ResearchPointPage() {
  const { cityId = '', researchId = '' } = useParams<{ cityId: string; researchId: string }>();
  const state = useCityResearch(cityId);
  const [searchParams, setSearchParams] = useSearchParams();
  const mode: Mode = searchParams.get('mode') === 'article' ? 'article' : 'interactive';

  const setMode = (next: Mode) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'article') params.set('mode', 'article');
    else params.delete('mode');
    setSearchParams(params, { replace: true });
  };

  const point = state.status === 'ready' ? state.data.points.find((entry) => entry.id === researchId) ?? null : null;
  const article = useArticle(cityId, point?.articleId ?? null);

  if (state.status === 'ready' && !point) {
    return (
      <main className="ag-page ag-container">
        <p className="ag-label">研究点不存在</p>
        <h1 className="ag-hero">{researchId}</h1>
        <p className="ag-body">该研究点不在 {state.data.cityName} 研究索引中。</p>
        <Link className="ag-button" to={ROUTES.city(cityId)}>返回研究空间</Link>
      </main>
    );
  }

  return (
    <main className="research-point">
      <AsyncBoundary state={state} label="正在读取研究索引">
        {(index) => (point ? (
          <ResearchPointBody
            index={index}
            point={point}
            mode={mode}
            onModeChange={setMode}
            articleState={article}
          />
        ) : null)}
      </AsyncBoundary>
    </main>
  );
}

function ResearchPointBody({ index, point, mode, onModeChange, articleState }: {
  index: CityResearchIndex;
  point: ResearchPoint;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  articleState: AsyncState<ResearchArticle>;
}) {
  const evidence = EVIDENCE_LEVELS[point.evidenceLevel];
  const reducedMotion = Boolean(useReducedMotion());
  const setPointContext = useResearchContextStore((state) => state.setPoint);
  const topicSummary = useMemo(
    () => index.topics.find((topic) => topic.id === point.topicId)?.summary ?? '',
    [index.topics, point.topicId],
  );

  useEffect(() => {
    setPointContext({
      cityId: point.cityId,
      cityName: index.cityName,
      researchPointId: point.id,
      evidenceLevel: point.evidenceLevel,
    });
  }, [index.cityName, point.cityId, point.evidenceLevel, point.id, setPointContext]);

  return (
    <div className="ag-container ag-container--prose research-point__inner">
      <nav className="research-point__crumb" aria-label="面包屑">
        <Link to={ROUTES.city(point.cityId)}>{index.cityName}研究空间</Link>
        <span aria-hidden="true">/</span>
        <span>{point.topicId} {point.topicTitle}</span>
      </nav>

      <header className="research-point__head">
        <p className="ag-label">{point.id} · {point.category}</p>
        <h1 className="ag-hero research-point__title">{point.title}</h1>
        <p className="research-point__question">{point.question}</p>
        <div className="research-point__tags">
          <EvidenceBadge level={point.evidenceLevel} />
          <StatusBadge status={point.status} />
          <span className="ag-badge ag-badge--plain" title={evidence.description}>{evidence.label}</span>
        </div>
        {point.keyNumbers.length > 0 && (
          <div className="research-point__numbers">
            <p className="ag-label">核心数据</p>
            <KeyNumberGrid numbers={point.keyNumbers} />
          </div>
        )}
        {topicSummary && <p className="research-point__topic">{topicSummary}</p>}
      </header>

      <div className="research-point__switch" role="tablist" aria-label="研究呈现方式">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'interactive'}
          className="research-point__tab"
          data-active={mode === 'interactive' || undefined}
          onClick={() => onModeChange('interactive')}
        >
          {/* 选中态是与侧栏同源的共享指示块：在 tab 之间滑动，而不是瞬间换底（§45/§103） */}
          {mode === 'interactive' && (
            <motion.span
              layoutId="research-point-tab"
              className="research-point__tab-pill"
              aria-hidden
              transition={reducedMotion ? { duration: 0 } : MOTION_SPRING.soft}
            />
          )}
          <span className="research-point__tab-label">交互研究</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'article'}
          className="research-point__tab"
          data-active={mode === 'article' || undefined}
          onClick={() => onModeChange('article')}
          disabled={!point.articleId}
        >
          {mode === 'article' && (
            <motion.span
              layoutId="research-point-tab"
              className="research-point__tab-pill"
              aria-hidden
              transition={reducedMotion ? { duration: 0 } : MOTION_SPRING.soft}
            />
          )}
          <span className="research-point__tab-label">查看原文</span>
        </button>
      </div>

      <section className="research-point__body">
        {mode === 'interactive' ? (
          <>
            <InteractiveResearchBody index={index} point={point} />
            {point.articleId && (
              <button type="button" className="research-point__backlink" onClick={() => onModeChange('article')}>
                查看研究依据 →
              </button>
            )}
          </>
        ) : (
          <AsyncBoundary state={articleState} label="正在读取研究原文">
            {(article) => <ResearchArticleView article={article} onOpenInteractive={() => onModeChange('interactive')} />}
          </AsyncBoundary>
        )}
      </section>

      {mode === 'interactive' && <ResearchInsightDock point={point} />}
    </div>
  );
}
