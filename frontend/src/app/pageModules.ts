import type { ComponentType } from 'react';
import { ROUTES } from './routes';

const loaders = {
  opening: () => import('../features/opening/OpeningPage'),
  home: () => import('../features/liaoning/LiaoningPage'),
  city: () => import('../features/research-v2/CityResearchPage'),
  reports: () => import('../features/report/ReportWorkspacePage'),
  scenario: () => import('../features/scenario/ScenarioPage'),
  decision: () => import('../features/decision/DecisionPage'),
  about: () => import('../features/about/AboutPage'),
};
type PageModule = keyof typeof loaders;
const modules = new Map<PageModule, Promise<Record<string, unknown>>>();
function loadModule(key: PageModule): Promise<Record<string, unknown>> {
  const pending = modules.get(key);
  if (pending) return pending;
  const module = loaders[key]().catch(error => { modules.delete(key); throw error; });
  modules.set(key, module);
  return module;
}
export const lazyPage = (key: PageModule, name: string) => async () => ({ Component: (await loadModule(key))[name] as ComponentType });

export function preloadPage(target: string): void {
  const path = new URL(target, window.location.href).pathname;
  const key: PageModule | undefined = path === ROUTES.about ? 'about'
    : path === ROUTES.root ? 'opening'
      : path === ROUTES.liaoning ? 'home'
        : path === ROUTES.reports || path === ROUTES.researchCenter || path.startsWith('/reports/') ? 'reports'
          : /^\/cities\/[^/]+\/decision\/?$/.test(path) ? 'decision'
            : path.startsWith('/cities/') ? 'city'
              : path === ROUTES.scenario ? 'scenario' : undefined;
  if (key) void loadModule(key).catch(() => undefined);
}
