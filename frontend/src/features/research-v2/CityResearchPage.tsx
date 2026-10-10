import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
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
import { ROUTES, structuralParent } from '../../app/routes';
import { cityContextUrl, provinceUrl } from '../../app/context/provinceSelection';
import { DailyContext } from '../daily/DailyContext';
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
  const { cityId = '' } = useParams();
  const location = useLocation();
  const navigate = usePageNavigate();
  const catalog = getCatalog(cityId);
  const topics = listTopics(cityId);

  const [params, setParams] = useSearchParams();
  const selectedId = initialSelection ?? params.get('research') ?? topics[0]?.id ?? null;
  const mode = params.get('mode') === 'article' ? 'article' : 'interactive';
  const setSelectedId = (id: string) => {
    if (initialSelection) navigate(cityContextUrl(ROUTES.research(cityId, id), cityId));
    else setParams((current) => { const next = new URLSearchParams(current); next.set('research',id); next.delete('mode'); return next; });
  };
  const setMode = (nextMode: 'interactive' | 'article') => setParams((current) => { const next = new URLSearchParams(current); if (nextMode === 'article') next.set('mode',nextMode); else next.delete('mode'); return next; });
  /** 小屏抽屉 / 证据折叠面板（§37）：桌面由 CSS 忽略这两个状态。 */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const drawerToggleRef = useRef<HTMLButtonElement>(null);

  /** 切换城市（同一路由换参数）时回到初始状态。 */
  useEffect(() => {
    setDrawerOpen(false);
    setEvidenceOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId]);

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

  /** Esc closes a local panel first, then follows the same parent as Header Up. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (event.defaultPrevented || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      if (drawerOpen) { setDrawerOpen(false); drawerToggleRef.current?.focus(); return; }
      if (evidenceOpen) { setEvidenceOpen(false); return; }
      navigate(structuralParent(location.pathname, location.search) ?? provinceUrl(cityId));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cityId, drawerOpen, evidenceOpen, location.pathname, location.search, navigate]);

  /** 抽屉打开后把焦点移进去（桌面下抽屉不开启，此分支不会走到）。 */
  useEffect(() => {
    if (drawerOpen) drawerRef.current?.focus();
  }, [drawerOpen]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    drawerToggleRef.current?.focus();
  };

  return (
    <main className="city-research" data-mode={mode}>
      <div className="city-research__paper">
        {catalog && <header className="city-research__chrome">
          <div className="city-research__actions">
              <button
                type="button"
                className="city-research__toggle city-research__drawer-toggle"
                aria-expanded={drawerOpen}
                aria-controls="city-research-tree"
                ref={drawerToggleRef}
                onClick={() => (drawerOpen ? closeDrawer() : setDrawerOpen(true))}
              >
                研究方向
              </button>
              <button
                type="button"
                className="city-research__toggle city-research__evidence-toggle"
                aria-expanded={evidenceOpen}
                aria-controls="city-research-evidence"
                onClick={() => setEvidenceOpen((open) => !open)}
              >
                研究证据
              </button>
          </div>
        </header>}

        {catalog ? (
          <div className="city-research__body" data-layout="workbench">
            <div
              className="city-research__drawer-backdrop"
              data-open={drawerOpen || undefined}
              onClick={closeDrawer}
              aria-hidden
            />

            <aside
              id="city-research-tree"
              className="city-research__sidebar"
              aria-label="研究方向"
              data-drawer-open={drawerOpen || undefined}
              tabIndex={-1}
              ref={drawerRef}
            >
              <DailyContext cityId={cityId} />
              <ResearchTree
                cityId={cityId}
                topics={topics}
                variant="picker"
                selectedId={resolvedSelected ?? undefined}
                onSelect={(id) => { setSelectedId(id); closeDrawer(); }}
              />
            </aside>

            <section className="city-research__column">
              <div className="city-research__modes" role="tablist" aria-label="研究呈现方式">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'interactive'}
                  aria-controls="city-research-stage"
                  className="city-research__mode"
                  onClick={() => setMode('interactive')}
                >
                  交互探索
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'article'}
                  aria-controls="city-research-stage"
                  className="city-research__mode"
                  onClick={() => setMode('article')}
                >
                  完整文章
                </button>
              </div>

              <div className="city-research__stage" id="city-research-stage" role="tabpanel">
                {mode === 'article' ? (
                  article.status === 'ready' ? (
                    <ResearchArticleView
                      cityId={cityId}
                      canonicalId={topic?.articleId ?? ''}
                      article={article.data}
                      focusPointId={point?.id}
                      focusSection={point?.sectionId ? Number(point.sectionId) : undefined}
                    />
                  ) : (
                    <p className="city-research__pending">
                      {article.status === 'loading' ? '研究正文载入中' : '研究正文读取失败；不展示占位内容。'}
                    </p>
                  )
                ) : point ? (
                  <InteractivePointView cityId={cityId} point={point} topic={topic!} />
                ) : topic ? (
                  <InteractiveTopicView cityId={cityId} topic={topic} />
                ) : (
                  <p className="city-research__pending">从左侧选择一个方向或研究点</p>
                )}
              </div>
            </section>

            <aside
              id="city-research-evidence"
              className="city-research__evidence"
              aria-label="研究证据"
              data-open={evidenceOpen || undefined}
            >
              <EvidenceRail cityId={cityId} topic={topic} point={point} />
            </aside>
          </div>
        ) : (
          /* 无策展树的城市（朝阳/锦州/大连/丹东/铁岭/跨城市）：走模块级工作台。
             它们的研究已正式产出，只是研究侧没有导出沈阳那样的「方向→研究点」结构，
             因此如实只呈现模块、交互探索与完整文章，绝不编造研究点。 */
          <CityModulesWorkspace cityId={cityId} initialModuleId={initialModuleId} />
        )}
      </div>
    </main>
  );
}
