import { useEffect, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { readContextFromSearch } from '../../app/context/appContext';
import { usePageNavigate } from '../../app/pageNavigation';
import { ROUTES, structuralParent } from '../../app/routes';
import { cityContextUrl, provinceUrl } from '../../app/context/provinceSelection';
import { getCatalog } from '../../domain/research/catalog';
import { useRuntimeCatalog } from '../../domain/research/runtime/catalog';
import { canonicalPresentationId, presentationExplorers, presentedModules, presentedTopics, resolvePresentedResearch } from '../../domain/research/presentation';
import { V2Repository } from '../../domain/research/v2/repository';
import { WorkbenchMain, WorkbenchRail, type WorkbenchLayoutProps } from '../../components/workbench/WorkbenchLayout';
import { DataSourceLinks } from '../../components/sources/DataSourceLinks';
import { ResearchTree } from './ResearchTree';
import { EvidenceRail, ModuleEvidenceRail } from './EvidenceRail';
import { InteractivePointView } from './InteractivePointView';
import { InteractiveTopicView } from './InteractiveTopicView';
import { ResearchArticleView } from './ResearchArticleView';
import { TopicExplorer } from './TopicExplorer';
import { useArticle } from './useV2';
import { productText } from '../report/productContent';
import { renderInline } from './markdown';
import './research.css';
import './city-research.css';
import './module-workspace.css';

/** Content slots are shared by reports and legacy city URLs; the host owns one paper. */
export function useResearchWorkspace(cityId: string, requested?: string | null, reportHost = false): WorkbenchLayoutProps {
  const location = useLocation();
  const navigate = usePageNavigate();
  const [params, setParams] = useSearchParams();
  const state = useRuntimeCatalog();
  const catalog = state.status === 'ready' ? state.catalog : null;
  const selection = resolvePresentedResearch(catalog, cityId, requested ?? params.get('research'));
  const modules = useMemo(() => presentedModules(catalog, cityId), [catalog, cityId]);
  const selectedModule = modules.find(module => module.module_id === selection?.payloadId) ?? null;
  const tree = getCatalog(cityId);
  const topics = useMemo(() => presentedTopics(catalog, cityId), [catalog, cityId]);
  const topic = topics.find(item => item.id === selection?.moduleId) ?? null;
  const point = topic?.points.find(item => item.id === selection?.selectionId) ?? null;
  const article = useArticle(cityId, selection?.payloadId ?? null);
  const mode = params.get('mode') === 'article' || selection?.kind === 'supplement' && !point ? 'article' : 'interactive';
  const href = (id: string, articleMode = false) => {
    const base = reportHost ? ROUTES.cityReport(cityId) : ROUTES.research(cityId, canonicalPresentationId(id));
    const next = new URLSearchParams(cityContextUrl(base, cityId).split('?')[1]);
    const context = readContextFromSearch(location.search);
    if (context.crop) next.set('crop', context.crop);
    if (context.horizon !== undefined) next.set('horizon', String(context.horizon));
    if (context.asOf) next.set('as_of', context.asOf);
    if (reportHost) next.set('research', canonicalPresentationId(id));
    if (articleMode) next.set('mode', 'article');
    return `${base}?${next}`;
  };
  useEffect(() => {
    if (!selection || !selection.replaced && (!requested || requested === canonicalPresentationId(requested))) return;
    void navigate(href(selection.selectionId, params.get('mode') === 'article'), { replace: true });
    // The replacement consumes only the audited selection and valid business context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection?.replaced, selection?.selectionId, cityId, requested]);
  useEffect(() => {
    if (!catalog || !cityId) return;
    for (const module of modules) {
      void V2Repository.getArticle(cityId, module.module_id).catch(() => undefined);
      for (const series of module.presentation?.verified_series ?? []) void V2Repository.getTable(cityId, series.table).catch(() => undefined);
    }
    for (const topic of topics) {
      for (const point of topic.points) if (point.binding) void V2Repository.getTable(cityId, point.binding.table).catch(() => undefined);
      for (const explorer of topic.explorers ?? []) void V2Repository.getTable(cityId, explorer.table).catch(() => undefined);
    }
  }, [catalog, cityId, modules, topics]);
  const select = (id: string) => navigate(href(id));
  const setMode = (next: 'interactive' | 'article') => setParams(previous => {
    const updated = new URLSearchParams(previous); if (next === 'article') updated.set('mode', next); else updated.delete('mode'); return updated;
  });
  const explorers = presentationExplorers(selectedModule);
  const loading = state.status === 'loading' || selection?.replaced || mode === 'article' && article.status === 'loading';
  const title = point?.title ?? topic?.title ?? selectedModule?.title ?? '城市研究';
  const currentSelection = selection?.selectionId ?? '';
  const content = loading ? <section className="research-loading" aria-busy="true" aria-label="研究载入中"><h1 className="workbench__title">{title}</h1><div className="module__skeleton" aria-hidden /></section>
    : mode === 'article' ? article.status === 'ready' ? <ResearchArticleView cityId={cityId} canonicalId={selection!.moduleId} article={article.data} focusPointId={point?.id} focusSection={point?.sectionId ? Number(point.sectionId) : undefined}/> : <p role="alert">研究读取失败，请稍后重试。</p>
    : point && topic ? <InteractivePointView cityId={cityId} point={point} topic={topic}/>
    : topic ? <InteractiveTopicView cityId={cityId} topic={topic} pointHref={href}/>
    : <div className="research__main"><header className="research__head"><h1 className="research__title">{title}</h1>{selectedModule?.summary && <p className="research__lead">{renderInline(productText(selectedModule.summary), 'summary')}</p>}</header>
      <div className="module-workspace__interactive">{explorers.map(explorer => <TopicExplorer key={`${cityId}:${explorer.id}`} cityId={cityId} explorer={explorer}/>)}</div>
    </div>;
  return {
    className: 'city-research', mode, resetKey: cityId, contentKey: `${cityId}:${currentSelection}`, sidebarLabel: '研究目录', railLabel: '研究依据',
    onEscape: () => navigate(structuralParent(location.pathname, location.search) ?? provinceUrl(cityId)),
    sidebar: close => tree ? <>
      <ResearchTree cityId={cityId} topics={topics} variant="picker" selectedId={currentSelection} onSelect={id => { select(id); close(); }}/>
      {modules.filter(module => !topics.some(item => item.id === canonicalPresentationId(module.module_id))).map(module => <button type="button" className="module-workspace__item" key={module.module_id} onClick={() => { select(module.module_id); close(); }}>{module.title}</button>)}
    </> : <ol className="module-workspace__list">{modules.map(module => <li key={module.module_id}><button type="button" className="module-workspace__item" data-selected={module.module_id === selection?.payloadId || undefined} onClick={() => { select(module.module_id); close(); }}>{module.title}</button></li>)}</ol>,
    children: <>
      <WorkbenchMain toolbar={selection && !selection.replaced ? <div className="city-research__modes" role="tablist" aria-label="研究呈现方式">
        {(selection.kind === 'interactive' || point) && <button type="button" role="tab" className="city-research__mode" aria-selected={mode === 'interactive'} onClick={() => setMode('interactive')}>{selection.kind === 'interactive' ? '交互研究' : '研究结论'}</button>}
        <button type="button" role="tab" className="city-research__mode" aria-selected={mode === 'article'} onClick={() => setMode('article')}>完整文章</button>
        {reportHost && modules.some(module => module.module_id === 'A09') && <button type="button" className="city-research__mode" onClick={() => navigate(href('A9', true))}>城市报告全文</button>}
      </div> : undefined}>
        {state.status === 'error' ? <p role="alert">研究目录读取失败，请稍后重试。</p> : state.status === 'ready' && !selection ? <p role="alert">没有通过发布校验的研究，请检查研究发布清单。</p> : content}
      </WorkbenchMain>
      <WorkbenchRail>{tree && topic ? <EvidenceRail cityId={cityId} topic={topic} point={point}/> : <ModuleEvidenceRail cityId={selection ? cityId : ''} moduleId={selection?.payloadId ?? null} article={article.status === 'ready' && !selection?.replaced ? article.data : null}/>}<DataSourceLinks scope={cityId}/></WorkbenchRail>
    </>,
  };
}
