import type { ComponentType } from 'react';
import { createBrowserRouter, createRoutesFromElements, Navigate, Route, RouterProvider, useLocation, useParams } from 'react-router-dom';
import { AppShell } from './AppShell';
import { ROUTES, parseResearchPath } from './routes';

const load = (loader: () => Promise<Record<string, unknown>>, name: string) => async () => {
  const module = await loader();
  return { Component: module[name] as ComponentType };
};

const openingPage = load(() => import('../features/opening/OpeningPage'), 'OpeningPage');
const researchHomePage = load(() => import('../features/liaoning/LiaoningPage'), 'LiaoningPage');
const cityResearchPage = load(() => import('../features/research-v2/CityResearchPage'), 'CityResearchPage');
const researchRoutePage = load(() => import('../features/research-v2/ResearchRoutePage'), 'ResearchRoutePage');
const reportsIndexPage = load(() => import('../features/report/ReportsIndexPage'), 'ReportsIndexPage');
const cityReportPage = load(() => import('../features/report/ReportPage'), 'ReportPage');
const scenarioPage = load(() => import('../features/scenario/ScenarioPage'), 'ScenarioPage');
const aboutPage = load(() => import('../features/about/AboutPage'), 'AboutPage');

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
const router = createBrowserRouter(createRoutesFromElements(
  <Route element={<AppShell />} hydrateFallbackElement={<div aria-hidden />}>
    <Route path={ROUTES.root} lazy={openingPage} />
    <Route path={ROUTES.researchHome} lazy={researchHomePage} />
    <Route path="/cities/:cityId" lazy={cityResearchPage} />
    <Route path="/cities/:cityId/research/:researchId" lazy={researchRoutePage} />
    <Route path={ROUTES.reports} lazy={reportsIndexPage} />
    <Route path="/reports/:cityId" lazy={cityReportPage} />
    <Route path={ROUTES.scenario} lazy={scenarioPage} />
    <Route path={ROUTES.about} lazy={aboutPage} />

    {/* 旧路径 → 新路径 */}
    <Route path={ROUTES.legacyProvinceResearch} element={<Navigate to={ROUTES.reports} replace />} />
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
