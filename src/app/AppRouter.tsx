import type { ComponentType } from 'react';
import { createBrowserRouter, createRoutesFromElements, Navigate, Route, RouterProvider, useParams } from 'react-router-dom';
import { AppShell } from './AppShell';
import { ROUTES } from './routes';

const load = (loader: () => Promise<Record<string, unknown>>, name: string) => async () => {
  const module = await loader();
  return { Component: module[name] as ComponentType };
};

const openingPage = load(() => import('../features/opening/OpeningPage'), 'OpeningPage');
const researchHomePage = load(() => import('../features/liaoning/LiaoningPage'), 'LiaoningPage');
const cityResearchPage = load(() => import('../features/research-v2/CityResearchPage'), 'CityResearchPage');
const researchNotePage = load(() => import('../features/research-v2/ResearchNotePage'), 'ResearchNotePage');
const reportsIndexPage = load(() => import('../features/report/ReportsIndexPage'), 'ReportsIndexPage');
const cityReportPage = load(() => import('../features/report/ReportPage'), 'ReportPage');
const scenarioPage = load(() => import('../features/scenario/ScenarioPage'), 'ScenarioPage');
const aboutPage = load(() => import('../features/about/AboutPage'), 'AboutPage');

/** 旧 `/cities/:cityId/report` → `/reports/:cityId`（V5 §22：不要 404）。 */
function LegacyCityReportRedirect() {
  const { cityId } = useParams();
  return <Navigate to={ROUTES.cityReport(cityId ?? 'shenyang')} replace />;
}

/**
 * 路由总表（V5 §21/§22）。
 *
 * 正式入口：/ · /liaoning · /cities/:cityId · /cities/:cityId/research/:articleId ·
 *           /reports · /reports/:cityId · /scenario-lab · /about
 * 旧路径一律 Redirect，不保留独立产品入口。
 */
const router = createBrowserRouter(createRoutesFromElements(
  <Route element={<AppShell />} hydrateFallbackElement={<div aria-hidden />}>
    <Route path={ROUTES.root} lazy={openingPage} />
    <Route path={ROUTES.researchHome} lazy={researchHomePage} />
    <Route path="/cities/:cityId" lazy={cityResearchPage} />
    <Route path="/cities/:cityId/research/:articleId" lazy={researchNotePage} />
    <Route path={ROUTES.reports} lazy={reportsIndexPage} />
    <Route path="/reports/:cityId" lazy={cityReportPage} />
    <Route path={ROUTES.scenario} lazy={scenarioPage} />
    <Route path={ROUTES.about} lazy={aboutPage} />

    {/* 旧路径 → 新路径 */}
    <Route path={ROUTES.legacyProvinceResearch} element={<Navigate to={ROUTES.reports} replace />} />
    <Route path="/cities/:cityId/report" element={<LegacyCityReportRedirect />} />
    <Route path={ROUTES.legacyRainstorm} element={<Navigate to={ROUTES.scenario} replace />} />

    <Route path="*" element={<Navigate to={ROUTES.root} replace />} />
  </Route>,
));

export function AppRouter() {
  return <RouterProvider router={router} />;
}
