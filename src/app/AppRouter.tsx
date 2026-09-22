import type { ComponentType } from 'react';
import { createBrowserRouter, createRoutesFromElements, Navigate, Route, RouterProvider } from 'react-router-dom';
import { AppShell } from './AppShell';
import { ROUTES } from './routes';

const load = (loader: () => Promise<Record<string, unknown>>, name: string) => async () => {
  const module = await loader();
  return { Component: module[name] as ComponentType };
};

const openingPage = load(() => import('../features/opening/OpeningPage'), 'OpeningPage');
const liaoningPage = load(() => import('../features/liaoning/LiaoningPage'), 'LiaoningPage');
const citySpacePage = load(() => import('../features/city/CityResearchSpacePage'), 'CityResearchSpacePage');
const researchPointPage = load(() => import('../features/research/ResearchPointPage'), 'ResearchPointPage');
const cityReportPage = load(() => import('../features/report/CityReportPage'), 'CityReportPage');
const provinceResearchPage = load(() => import('../features/research/ProvinceResearchPage'), 'ProvinceResearchPage');
const rainstormPage = load(() => import('../features/rainstorm/RainstormPage'), 'RainstormPage');
const scenarioLabPage = load(() => import('../features/scenario/ScenarioLabPage'), 'ScenarioLabPage');
const aboutPage = load(() => import('../features/about/AboutPage'), 'AboutPage');

const router = createBrowserRouter(createRoutesFromElements(
  <Route element={<AppShell />} hydrateFallbackElement={<div aria-hidden />}>
    <Route path={ROUTES.root} lazy={openingPage} />
    <Route path={ROUTES.liaoning} lazy={liaoningPage} />
    <Route path="/cities/:cityId" lazy={citySpacePage} />
    <Route path="/cities/:cityId/research/:researchId" lazy={researchPointPage} />
    <Route path="/cities/:cityId/report" lazy={cityReportPage} />
    <Route path={ROUTES.provinceResearch} lazy={provinceResearchPage} />
    <Route path={ROUTES.rainstorm} lazy={rainstormPage} />
    <Route path={ROUTES.scenarioLab} lazy={scenarioLabPage} />
    <Route path={ROUTES.about} lazy={aboutPage} />
    <Route path="*" element={<Navigate to={ROUTES.root} replace />} />
  </Route>,
));

export function AppRouter() {
  return <RouterProvider router={router} />;
}
