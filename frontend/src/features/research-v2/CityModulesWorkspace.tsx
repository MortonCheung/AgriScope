import { useLocation, useSearchParams } from 'react-router-dom';
import { usePageNavigate } from '../../app/pageNavigation';
import { cityContextUrl, provinceUrl } from '../../app/context/provinceSelection';
import { ROUTES, structuralParent } from '../../app/routes';
import { useMemo } from 'react';
import type { V2Article } from '../../domain/research/v2/types';
import { assetUrl } from '../../domain/research/v2/repository';
import {
  cityEntry, explorerConfigs, explorerMetricNames, moduleEntry, useRuntimeCatalog,
} from '../../domain/research/runtime/catalog';
import { useArticle } from './useV2';
import { TopicExplorer } from './TopicExplorer';
import { V2Figure } from './Figure';
import { ResearchArticleView } from './ResearchArticleView';
import { NotSupportedResearchState } from './NotSupportedResearchState';
import { WorkbenchLayout, WorkbenchMain, WorkbenchRail } from '../../components/workbench/WorkbenchLayout';
import { ModuleEvidenceRail } from './EvidenceRail';
import { renderInline } from './markdown';
import { columnMeta } from '../../domain/research/v2/metrics';
import { productText } from '../report/productContent';
import './module-workspace.css';

/**
 * 模块级研究工作台（Frontend V3 §20–§24）。
 *
 * 用于**没有策展树**的城市（朝阳 / 锦州 / 大连 / 丹东 / 铁岭 / 跨城市）。
 * 它们的研究已正式产出，但研究侧只导出了模块级 `article.json` + `explorer`，
 * 没有沈阳那样的「方向 → 研究点 → 可逐字校验引句」结构。
 *
 * 因此本工作台**只呈现研究侧真的有的东西**：
 *   · 模块清单与状态（ACCEPTED / DRAFT / NOT_SUPPORTED …）；
 *   · 交互探索：把 `explorer.series` 声明的表按原列画出来（不重算、不解释）；
 *   · 完整文章：复用 `ResearchArticleView`；
 *   · NOT_SUPPORTED：走正式状态组件，不伪装成图表。
 * 绝不编造研究点、引句、结论或"推荐查看"以外的内容。
 */
export function CityModulesWorkspace({ cityId, initialModuleId }: { cityId: string; initialModuleId?: string }) {
  const catalogState = useRuntimeCatalog();
  const entry = catalogState.status === 'ready' ? cityEntry(catalogState.catalog, cityId) : null;
  const modules = useMemo(() => entry?.modules ?? [], [entry]);

  const navigate = usePageNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const selectedId = initialModuleId;
  const mode = params.get('mode') === 'article' ? 'article' : 'interactive';
  const setMode = (next: 'interactive' | 'article') => setParams((current) => { const updated = new URLSearchParams(current); if (next === 'article') updated.set('mode', next); else updated.delete('mode'); return updated; });

  const invalidModule = Boolean(selectedId && catalogState.status === 'ready' && entry && !modules.some(item => item.module_id === selectedId));
  const resolved = invalidModule ? null : selectedId && modules.some(item => item.module_id === selectedId) ? selectedId : modules[0]?.module_id ?? null;
  const selected = entry && resolved ? moduleEntry(entry, resolved) : null;

  const articleState = useArticle(cityId, resolved);
  const article = articleState.status === 'ready' ? articleState.data : null;

  const explorers = useMemo(
    () => (article && resolved ? explorerConfigs(article, resolved) : []),
    [article, resolved],
  );
  const metricNames = useMemo(() => (article ? explorerMetricNames(article) : []), [article]);
  const figures = useMemo(() => article?.figures?.map((figure) => figure.file) ?? [], [article]);
  const notSupported = article?.status === 'NOT_SUPPORTED' || selected?.status === 'NOT_SUPPORTED';
  const hasInteractive = explorers.length > 0 && !notSupported;
  const activeMode = hasInteractive ? mode : 'article';

  return <WorkbenchLayout className="city-research" mode={activeMode} resetKey={cityId} sidebarLabel="研究模块" railLabel="研究证据"
    onEscape={() => navigate(structuralParent(location.pathname, location.search) ?? provinceUrl(cityId))}
    sidebar={close => <ol className="module-workspace__list">
      {modules.map(item => <li key={item.module_id}>
        <button type="button" className="module-workspace__item" data-selected={item.module_id === resolved || undefined} data-status={item.status}
          onClick={() => { navigate(cityContextUrl(ROUTES.research(cityId, item.module_id), cityId)); close(); }}>
          <span className="module-workspace__item-title">{item.title}</span>
        </button>
      </li>)}
    </ol>}
  >
    <WorkbenchMain>
      {catalogState.status === 'loading' && <p aria-busy="true" className="ag-body-secondary">六城研究索引载入中</p>}
      {catalogState.status === 'error' && <p role="alert" className="ag-body">研究索引读取失败：{catalogState.message}</p>}
      {catalogState.status === 'ready' && !entry && <p className="ag-body">该城市暂无已发布研究。</p>}
      {invalidModule && <div role="status"><h1 className="workbench__title">研究条目不存在</h1><p>当前城市没有发布这个研究条目，请从左侧选择已有模块。</p></div>}
      {entry && !invalidModule && <div className="research__main">
        <header className="research__head">
          <h1 className="research__title">{selected?.title ?? ''}</h1>
          {article?.keywords?.length ? <p className="research__article-title">{article.keywords.slice(0, 4).join(' / ')}</p> : null}
            {selected?.summary && <p className="research__lead">{renderInline(productText(selected.summary), 'module-summary')}</p>}
        </header>
        {articleState.status === 'loading' && <p className="ag-body-secondary" aria-busy="true">研究正文载入中</p>}
        {articleState.status === 'error' && <p className="ag-body" role="alert">报告读取失败，请稍后重试。</p>}
        {article && notSupported && <NotSupportedResearchState article={article} moduleId={resolved ?? ''} />}
        {article && !notSupported && <>
          <div className="city-research__modes" role="tablist" aria-label="研究呈现方式">
            {hasInteractive && <button type="button" role="tab" aria-selected={activeMode === 'interactive'} className="city-research__mode" onClick={() => setMode('interactive')}>交互探索</button>}
            <button type="button" role="tab" aria-selected={activeMode === 'article'} className="city-research__mode" onClick={() => setMode('article')}>完整文章</button>
          </div>
          {activeMode === 'interactive' ? <div className="module-workspace__interactive">
            {explorers.map(explorer => <TopicExplorer key={explorer.id} cityId={cityId} explorer={explorer} />)}
            {metricNames.length > 0 && <p className="ag-caption">观测指标：{metricNames.map(name => columnMeta(name)?.label ?? '未命名指标').join(' · ')}。</p>}
            {figures.map((file, index) => <V2Figure key={file} src={assetUrl.figure(cityId, file)} alt={file} index={index + 1} />)}
          </div> : <ResearchArticleView cityId={cityId} canonicalId={resolved ?? ''} article={article} />}
        </>}
      </div>}
    </WorkbenchMain>
    <WorkbenchRail><ModuleEvidenceRail cityId={cityId} moduleId={resolved} title={selected?.title} article={article} /></WorkbenchRail>
  </WorkbenchLayout>;
}
