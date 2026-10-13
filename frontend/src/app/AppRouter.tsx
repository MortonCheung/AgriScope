import { createBrowserRouter, createRoutesFromElements, Navigate, Route, RouterProvider, useLocation, useParams } from 'react-router-dom';
import { AppShell } from './AppShell';
import { ROUTES, parseResearchPath } from './routes';
import { useAppContext, readContextFromSearch } from './context/appContext';
import { cityContextUrl } from './context/provinceSelection';
import { CityDecisionEntry } from '../features/decision/CityDecisionEntry';
import { clearLegacyNativePaperTransitions } from './nativePaperMigration';
import { lazyPage, preloadPage } from './pageModules';
import { configurePaperPreparation } from './paperNavigation';

const openingPage = lazyPage('opening', 'OpeningPage');
const researchHomePage = lazyPage('home', 'LiaoningPage');
const cityResearchPage = lazyPage('city', 'CityResearchPage');
const reportWorkspacePage = lazyPage('reports', 'ReportWorkspacePage');
const scenarioPage = lazyPage('scenario', 'ScenarioPage');
const decisionPage = lazyPage('decision', 'DecisionPage');
const aboutPage = lazyPage('about', 'AboutPage');

/**
 * 「决策中心」全局入口（V3 §7）。
 *
 * 决策必须落在某座城市上，所以这里不重造页面，而是按全局上下文
 * （最近明确选择的城市）落到 `/cities/<city>/decision`。
 */
function DecisionCenterRedirect() {
  const cityId = useAppContext((state) => state.cityId);
  const queryCity = readContextFromSearch(useLocation().search).cityId;
  const selected = queryCity ?? cityId;
  return selected ? <Navigate to={cityContextUrl(ROUTES.decision(selected), selected)} replace /> : <CityDecisionEntry />;
}

/** 旧 `/cities/:cityId/report` → `/reports/:cityId`（§22：不要 404）。 */
function LegacyCityReportRedirect() {
  const { cityId } = useParams();
  return <Navigate to={ROUTES.cityReport(cityId ?? 'shenyang')} replace />;
}

/**
 * 旧研究路径兼容。
 *
 * V5 时期的 `/cities/shenyang/research/A01` 用的是载荷编号，而正式 URL 用
 * canonical 编号（A1）。这里把载荷编号换回 canonical，**保留查询串**（mode 等），
 * 让旧链接仍然落在同一篇文章上，而不是掉到城市页。
 */
function LegacyResearchRedirect() {
  const { cityId, researchId } = useParams();
  const location = useLocation();
  const canonical = /^A(\d+)$/.exec(researchId ?? '')
    ? `A${Number(researchId?.slice(1))}`
    : researchId ?? '';
  return <Navigate to={`${ROUTES.research(cityId ?? 'shenyang', canonical)}${location.search}`} replace />;
}

/**
 * 路由总表。
 *
 * 正式入口：/ · /liaoning · /cities/:cityId · /cities/:cityId/research/:researchId ·
 *           /reports · /reports/:cityId · /scenario-lab · /about
 * :researchId 既可以是方向（A2）也可以是研究点（A2.2）。
 * 旧路径一律 Redirect，不保留独立产品入口。
 */
clearLegacyNativePaperTransitions();
configurePaperPreparation(preloadPage);
const router = createBrowserRouter(createRoutesFromElements(
  <Route element={<AppShell />} hydrateFallbackElement={<div aria-hidden />}>
    <Route path={ROUTES.root} lazy={openingPage} />
    <Route path={ROUTES.researchHome} lazy={researchHomePage} />
    <Route path={ROUTES.researchCenter} lazy={reportWorkspacePage} />
    <Route path={ROUTES.decisionCenter} element={<DecisionCenterRedirect />} />
    <Route path="/cities/:cityId" lazy={cityResearchPage} />
    <Route path="/cities/:cityId/decision" lazy={decisionPage} />
    <Route path="/cities/:cityId/research/:researchId" lazy={cityResearchPage} />
    <Route path={ROUTES.reports} lazy={reportWorkspacePage} />
    <Route path="/reports/:cityId" lazy={reportWorkspacePage} />
    <Route path={ROUTES.scenario} lazy={scenarioPage} />
    <Route path={ROUTES.about} lazy={aboutPage} />

    {/* 旧路径 → 新路径 */}
    <Route path="/cities/:cityId/report" element={<LegacyCityReportRedirect />} />
    <Route path={ROUTES.legacyRainstorm} element={<Navigate to={ROUTES.scenario} replace />} />
    <Route path="/cities/:cityId/research/:researchId/article" element={<LegacyResearchRedirect />} />

    <Route path="*" element={<LegacyUnknownPath />} />
  </Route>,
));

/** 兜底：认得出的旧研究路径先救回来，其余回研究首页。 */
function LegacyUnknownPath() {
  const location = useLocation();
  const research = parseResearchPath(location.pathname);
  if (research) {
    return <Navigate to={`${ROUTES.research(research.cityId, research.researchId)}${location.search}`} replace />;
  }
  return <Navigate to={ROUTES.researchHome} replace />;
}

export function AppRouter() {
  return <RouterProvider router={router} />;
}
