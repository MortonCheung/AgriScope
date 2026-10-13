import { useLayoutEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { TransitionLink, usePageNavigate } from '../../app/pageNavigation';
import { ROUTES } from '../../app/routes';
import { getCity, isStudyCity } from '../../domain/geography/cities';
import { readContextFromSearch } from '../../app/context/appContext';
import { useResearchWorkspace } from '../research-v2/useResearchWorkspace';
import { useRuntimeCatalog } from '../../domain/research/runtime/catalog';
import { cityContextUrl } from '../../app/context/provinceSelection';
import { WorkbenchLayout, WorkbenchMain, WorkbenchRail } from '../../components/workbench/WorkbenchLayout';
import { WorkspaceLanding } from '../../components/workbench/WorkspaceLanding';
import { useArticle } from '../research-v2/useV2';
import { ModuleEvidenceRail } from '../research-v2/EvidenceRail';
import { CrossCityContent } from '../cross-city/CrossCityPage';
import { SynthesisContent } from '../cross-city/SynthesisPage';
import { ReportNavigation } from './ReportNavigation';
import { ReportArticle, reportArticleModel } from './ReportArticle';
import '../research-v2/research.css';
import './reports.css';

/** All report routes share one unconditional paper host and replace only content slots. */
export function ReportWorkspacePage() {
  const { cityId = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = usePageNavigate();
  const city = getCity(cityId);
  const view = !cityId ? params.get('view') : null;
  const composite = view === 'cross_city' || view === 'synthesis';
  const entry = !cityId && !composite;
  const scope = cityId === 'liaoning' ? 'cross_city' : cityId;
  const reportId = city ? 'A9' : scope === 'cross_city' ? 'A11' : null;
  const articleState = useArticle(scope, reportId);
  const article = !entry && !composite && articleState.status === 'ready' ? articleState.data : null;
  const model = useMemo(() => article ? reportArticleModel(article) : null, [article]);
  const catalogState = useRuntimeCatalog();
  const research = useResearchWorkspace(isStudyCity(cityId) ? cityId : '', null, true);
  const restoreCity = !cityId && !composite ? readContextFromSearch(params.toString()).cityId : null;
  useLayoutEffect(() => {
    if (restoreCity) void navigate(cityContextUrl(ROUTES.cityReport(restoreCity), restoreCity), { replace: true });
  }, [restoreCity, navigate]);
  const contentKey = `${cityId}:${view ?? ''}`;
  const name = city?.shortName ?? '辽宁六城';
  return <WorkbenchLayout
    className={`report-workbench${entry ? ' report-index-workbench report-entry-workbench' : composite ? ' report-index-workbench' : ''}`}
    resetKey={cityId || view || "entry"} contentKey={contentKey}
    railMode={entry || composite ? 'hidden' : 'responsive'}
    sidebarLabel={entry || composite ? '报告目录' : '研究目录'} railLabel="研究依据"
    onEscape={() => navigate(entry ? ROUTES.liaoning : ROUTES.reports)}
    sidebar={close => entry ? null : <ReportNavigation close={close}/>}
  >
    {city ? research.children : <>
    <WorkbenchMain>
      {restoreCity ? <div className="research-loading" aria-busy="true"><h1 className="workbench__title">城市报告</h1><div className="module__skeleton" aria-hidden/></div> : entry ? <WorkspaceLanding title="城市报告" className="report__entry">
        {catalogState.status === 'loading' && <p className="report__empty" role="status">读取报告目录…</p>}
        {catalogState.status === 'error' && <p className="report__empty" role="alert">报告目录读取失败，请稍后重试。</p>}
        <ReportNavigation label="城市报告" className="report-navigation--overview" />
      </WorkspaceLanding> : view === 'cross_city' ? <CrossCityContent /> : view === 'synthesis' ? <SynthesisContent /> : !reportId ? <div className="report__body">
        <h1 className="report__title">报告目录里没有这个入口</h1>
        <p className="report__empty">请从报告目录进入。</p>
        <TransitionLink className="ag-button" to={ROUTES.reports}>返回报告目录</TransitionLink>
      </div> : article && model ? <ReportArticle article={article} scope={scope} model={model}  /> : <div className="report__body">
        <header className="report__head"><h1 className="report__title">{name}研究报告</h1></header>
        <p className="report__empty" role={articleState.status === 'error' ? 'alert' : 'status'}>{articleState.status === 'loading' ? '报告载入中' : '报告读取失败，请稍后重试。'}</p>
      </div>}
    </WorkbenchMain>
    <WorkbenchRail><ModuleEvidenceRail cityId={article ? scope : ''} moduleId={reportId} article={article} /></WorkbenchRail>
    </>}
  </WorkbenchLayout>;
}
