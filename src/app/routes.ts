/** AgriScope 正式路由。页面用 cityId / researchId 驱动，不散落城市判断。 */
export const ROUTES = {
  root: '/',
  liaoning: '/liaoning',
  city: (cityId: string) => `/cities/${cityId}`,
  research: (cityId: string, researchId: string) => `/cities/${cityId}/research/${researchId}`,
  report: (cityId: string) => `/cities/${cityId}/report`,
  rainstorm: '/shenyang-rainstorm',
  scenarioLab: '/scenario-lab',
  about: '/about',
} as const;

export const CITY_ROUTE_PREFIX = '/cities/';

/**
 * 结构 fallback（V3 §10）：当用户直接通过 URL 打开某页、没有可回退的应用内历史时，
 * 返回按钮要知道"这一页在研究体系里的上一层是谁"，而不是无脑回首页。
 * 有真实历史时优先走真实历史，这里只是兜底。
 */
export function structuralParent(pathname: string): string | null {
  if (pathname === ROUTES.root) return null;
  if (pathname === ROUTES.about) return ROUTES.root;
  if (pathname === ROUTES.liaoning) return ROUTES.root;
  if (pathname === ROUTES.scenarioLab) return ROUTES.rainstorm;
  if (pathname === ROUTES.rainstorm) return ROUTES.report('shenyang');

  const research = /^\/cities\/([^/]+)\/research\/[^/]+\/?$/.exec(pathname);
  if (research) return ROUTES.city(research[1]);
  const report = /^\/cities\/([^/]+)\/report\/?$/.exec(pathname);
  if (report) return ROUTES.city(report[1]);
  const city = /^\/cities\/([^/]+)\/?$/.exec(pathname);
  if (city) return ROUTES.liaoning;

  return ROUTES.root;
}
