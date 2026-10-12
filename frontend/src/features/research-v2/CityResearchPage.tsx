import { useEffect } from 'react';
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { getCatalog, listTopics, researchIdKind } from '../../domain/research/catalog';
import { V2Repository } from '../../domain/research/v2/repository';
import { useArticle } from './useV2';
import { ResearchTree } from './ResearchTree';
import { EvidenceRail } from './EvidenceRail';
import { InteractivePointView } from './InteractivePointView';
import { InteractiveTopicView } from './InteractiveTopicView';
import { ResearchArticleView } from './ResearchArticleView';
import { CityModulesWorkspace } from './CityModulesWorkspace';
import { usePageNavigate } from '../../app/pageNavigation';
import { ROUTES, canonicalResearchId, isLegacyPayloadResearchId, structuralParent } from '../../app/routes';
import { cityContextUrl, provinceUrl } from '../../app/context/provinceSelection';
import { getCity } from '../../domain/geography/cities';
import { DailyContext } from '../daily/DailyContext';
import { WorkbenchLayout, WorkbenchMain, WorkbenchRail } from '../../components/workbench/WorkbenchLayout';
import './research.css';
import './city-research.css';

/**
 * 城市研究空间（本轮 §21/§22/§23）——**三栏研究工作台**（桌面优先）。
 *
 *   ┌───────────┬────────────────────────┬─────────────┐
 *   │ ResearchTree │ 交互探索 / 完整文章   │ Evidence    │
 *   │ 方向→研究点 │ selectors/chart/表    │ 来源/方法/  │
 *   │           │                        │ 样本/局限   │
 *   └───────────┴────────────────────────┴─────────────┘
 *
 * 关键语义（§21）：单击左侧条目将研究选择写入 URL，支持历史恢复；
 * 中栏默认是「交互探索」，`完整文章` 是次入口（§22，不反过来）；
 * 右栏只呈现研究侧真实元数据，没有的字段整块不渲染（§23/§38）。
 *
 * 页面返回由全局 Header 负责；Esc 先关局部抽屉 / 证据面板，再进入同一父级。
 */
export function CityResearchPage({initialModuleId, initialSelection}: {initialModuleId?: string; initialSelection?: string} = {}) {
  const { cityId = '', researchId } = useParams();
  const location = useLocation();
  const navigate = usePageNavigate();
  const catalog = getCatalog(cityId);
  const topics = listTopics(cityId);

  const [params, setParams] = useSearchParams();
  const pathSelection = researchId ? canonicalResearchId(researchId) : initialSelection;
  const selectedId = pathSelection ?? params.get('research') ?? topics[0]?.id ?? null;
  const mode = params.get('mode') === 'article' ? 'article' : 'interactive';
  const setSelectedId = (id: string) => {
    if (pathSelection) navigate(cityContextUrl(ROUTES.research(cityId, id), cityId));
    else setParams((current) => { const next = new URLSearchParams(current); next.set('research',id); next.delete('mode'); return next; });
  };
  const setMode = (nextMode: 'interactive' | 'article') => setParams((current) => { const next = new URLSearchParams(current); if (nextMode === 'article') next.set('mode',nextMode); else next.delete('mode'); return next; });
  /** 选择必须在当前 catalog 里有效，否则回落到第一个方向。 */
  const resolvedSelected = selectedId && researchIdKind(cityId, selectedId) ? selectedId : (topics[0]?.id ?? null);
  const kind = resolvedSelected ? researchIdKind(cityId, resolvedSelected) : null;
  const topic = topics.find((entry) => entry.id === resolvedSelected)
    ?? topics.find((entry) => entry.points.some((point) => point.id === resolvedSelected))
    ?? null;
  const point = kind === 'point' ? topic?.points.find((entry) => entry.id === resolvedSelected) ?? null : null;

  /** 中栏与证据栏共用同一篇文章（同一份缓存）。 */
  const article = useArticle(cityId, topic?.articleId ?? null);

  /** 进入城市后后台预取全部方向的文章，点进去时不再等加载。 */
  const firstArticle = article;
  const articleIds = topics.map((entry) => entry.articleId).join(',');
  useEffect(() => {
    if (!catalog || firstArticle.status !== 'ready') return;
    const ids = articleIds.split(',').filter(Boolean).slice(1);
    const run = () => ids.forEach((id) => { void V2Repository.getArticle(cityId, id).catch(() => null); });
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
    if (typeof idle === 'function') idle(run, { timeout: 2000 });
    else window.setTimeout(run, 0);
  }, [articleIds, catalog, cityId, firstArticle.status]);

  if (researchId && isLegacyPayloadResearchId(researchId)) return <Navigate to={`${ROUTES.research(cityId, canonicalResearchId(researchId))}${location.search}`} replace />;
  if (researchId && (!getCity(cityId) || (catalog ? !researchIdKind(cityId, pathSelection!) : !/^A[1-9]$/.test(pathSelection!)))) {
    return <WorkbenchLayout className="city-research" resetKey={cityId} sidebarLabel="研究目录" railLabel="研究证据" sidebar={() => null} onEscape={() => navigate(provinceUrl(cityId))}>
      <WorkbenchMain><h1 className="workbench__title">研究条目不存在</h1><p>当前城市没有发布这个研究条目。</p><Link to={cityContextUrl(ROUTES.city(cityId), cityId)}>返回研究目录 →</Link></WorkbenchMain>
      <WorkbenchRail>{null}</WorkbenchRail>
    </WorkbenchLayout>;
  }
  if (!catalog) return <CityModulesWorkspace cityId={cityId} initialModuleId={pathSelection ? `A0${pathSelection.slice(1)}` : initialModuleId} />;

  return <WorkbenchLayout
    className="city-research"
    mode={mode}
    resetKey={cityId}
    sidebarLabel="研究方向"
    railLabel="研究证据"
    onEscape={() => navigate(structuralParent(location.pathname, location.search) ?? provinceUrl(cityId))}
    sidebar={close => <>
      <DailyContext cityId={cityId} />
      <ResearchTree cityId={cityId} topics={topics} variant="picker" selectedId={resolvedSelected ?? undefined} onSelect={id => { setSelectedId(id); close(); }} />
    </>}
  >
    <WorkbenchMain toolbar={<div className="city-research__modes" role="tablist" aria-label="研究呈现方式">
      <button type="button" role="tab" aria-selected={mode === 'interactive'} aria-controls="city-research-stage" className="city-research__mode" onClick={() => setMode('interactive')}>交互探索</button>
      <button type="button" role="tab" aria-selected={mode === 'article'} aria-controls="city-research-stage" className="city-research__mode" onClick={() => setMode('article')}>完整文章</button>
    </div>}>
      <div id="city-research-stage" role="tabpanel">
        {mode === 'article' ? (
          article.status === 'ready' ? <ResearchArticleView cityId={cityId} canonicalId={topic?.articleId ?? ''} article={article.data} focusPointId={point?.id} focusSection={point?.sectionId ? Number(point.sectionId) : undefined} />
            : <p className="city-research__pending">{article.status === 'loading' ? '报告载入中' : '报告读取失败，请稍后重试。'}</p>
        ) : point ? <InteractivePointView cityId={cityId} point={point} topic={topic!} />
          : topic ? <InteractiveTopicView cityId={cityId} topic={topic} />
            : <p className="city-research__pending">从左侧选择一个方向或研究点</p>}
      </div>
    </WorkbenchMain>
    <WorkbenchRail><EvidenceRail cityId={cityId} topic={topic} point={point} /></WorkbenchRail>
  </WorkbenchLayout>;
}
