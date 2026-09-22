import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ROUTES } from '../../app/routes';
import { usePageNavigate } from '../../app/pageNavigation';
import { AsyncBoundary } from '../../components/AsyncState';
import { KeyNumberGrid } from '../../components/KeyNumberGrid';
import { SourceCitation } from '../../components/SourceCitation';
import { MOTION_SPRING } from '../../design/motion';
import type { CityResearchIndex, ResearchArticle, ResearchPoint } from '../../domain/research/types';
import { ResearchRepository } from '../../services/ResearchRepository';
import { useCityResearch, type AsyncState } from '../../services/useCityResearch';
import { ResearchArticleView } from './ResearchArticleView';
import { InteractiveResearchBody } from './widgets/ResearchModules';
import { ResearchTreeNav } from './tree/ResearchTreeNav';
import { useResearchTreeStore } from './tree/researchTreeStore';
import { ResearchWorkspace } from './workspace/ResearchWorkspace';
import { ResearchEvidenceRail } from './workspace/ResearchEvidenceRail';
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
 * 交互研究页（V3 §47/§49/§50）。
 *
 * 结构改成三栏研究工作台：Research Tree │ Research Workspace │ Evidence Rail。
 * 研究树在这里依然存在（§16），用户随时能看到 C5 在 S5 里的位置；
 * Evidence 移到右栏，核心数据移进正文数据区，页眉只保留"编号 · 专题 / 问题标题 / 一句研究判断"。
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
        <h1 className="ag-hero">研究点不存在</h1>
        <p className="ag-body">{researchId} 不在 {state.data.cityName} 研究索引中。</p>
        <Link className="ag-button" to={ROUTES.city(cityId)}>返回研究空间</Link>
      </main>
    );
  }

  return (
    <main className="research-point">
      <AsyncBoundary state={state}>
        {(index) => (point ? (
          <ResearchPointBody index={index} point={point} mode={mode} onModeChange={setMode} articleState={article} />
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
  const reducedMotion = Boolean(useReducedMotion());
  const navigate = usePageNavigate();
  const selectPoint = useResearchTreeStore((store) => store.selectPoint);
  const setPointContext = useResearchContextStore((state) => state.setPoint);

  useEffect(() => {
    setPointContext({
      cityId: point.cityId,
      cityName: index.cityName,
      researchPointId: point.id,
      evidenceLevel: point.evidenceLevel,
    });
  }, [index.cityName, point.cityId, point.evidenceLevel, point.id, setPointContext]);

  /** 路由是"当前研究点"的唯一事实来源：进入后同步回研究树，Back 时选中态不丢（§59）。 */
  useEffect(() => { selectPoint(point.id); }, [point.id, selectPoint]);

  return (
    <div className="research-point__shell">
      <header className="research-point__bar">
        <nav className="research-point__crumb" aria-label="研究层级">
          <Link to={ROUTES.city(point.cityId)}>{index.cityName}</Link>
          <span aria-hidden="true">/</span>
          <span>{point.topicId}</span>
          <span aria-hidden="true">/</span>
          <span className="research-point__crumb-current">{point.id}</span>
        </nav>
        <div className="research-point__switch" role="tablist" aria-label="研究呈现方式">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'interactive'}
            className="research-point__tab"
            data-active={mode === 'interactive' || undefined}
            onClick={() => onModeChange('interactive')}
          >
            {/* 选中态是一根在两项之间连续滑动的底线（§7） */}
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
            <span className="research-point__tab-label">原文</span>
          </button>
        </div>
      </header>

      <div className="research-point__body">
        <ResearchWorkspace
          variant="fixed"
          tree={<ResearchTreeNav index={index} onSelectPoint={(id) => navigate(ROUTES.research(point.cityId, id))} />}
          rail={<ResearchEvidenceRail point={point} timeWindow={index.window} provenance={index.provenance} />}
        >
          <header className="research-point__head">
            <p className="ag-label">{point.id} · {point.topicTitle}</p>
            <h1 className="ag-hero research-point__title">{point.title}</h1>
            <p className="research-point__question">{point.frontendText ?? point.conclusion}</p>
          </header>

          {point.keyNumbers.length > 0 && (
            <section className="research-point__numbers">
              <p className="ag-label">核心数据</p>
              <KeyNumberGrid numbers={point.keyNumbers} />
              {/* 核心数字在前端索引里没有逐项来源，按 §32 如实标注并记入 SOURCE_GAPS.md */}
              <SourceCitation sources={[]} />
            </section>
          )}

          {mode === 'interactive' ? (
            <InteractiveResearchBody index={index} point={point} />
          ) : (
            <AsyncBoundary state={articleState}>
              {(article) => <ResearchArticleView article={article} />}
            </AsyncBoundary>
          )}
        </ResearchWorkspace>
      </div>

      {mode === 'interactive' && <ResearchInsightDock point={point} />}
    </div>
  );
}
