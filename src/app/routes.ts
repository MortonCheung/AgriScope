/** AgriScope 正式路由（V5 §21）。页面用 cityId / articleId 驱动，不散落城市判断。 */
export const ROUTES = {
  root: '/',

  /** 「研究」首页：辽宁 3D → 六城（§15）。 */
  researchHome: '/liaoning',
  /** 兼容别名：旧代码里的 liaoning 就是研究首页。 */
  liaoning: '/liaoning',
  city: (cityId: string) => `/cities/${cityId}`,
  /** 研究条目：A01–A08（§6）。 */
  researchNote: (cityId: string, articleId: string) => `/cities/${cityId}/research/${articleId}`,
  /** 兼容别名：v4 代码称它为 research。 */
  research: (cityId: string, researchId: string) => `/cities/${cityId}/research/${researchId}`,

  /** 「报告」：城市正式报告 + 辽宁六城综合报告（§6/§39）。 */
  reports: '/reports',
  cityReport: (cityId: string) => `/reports/${cityId}`,
  provinceReport: '/reports/liaoning',

  /** 「推演」：2026 沈阳暴雨平行情景（§43–§45）。 */
  scenario: '/scenario-lab',
  /** 兼容别名。 */
  scenarioLab: '/scenario-lab',

  about: '/about',

  /** ---- 以下为**旧路径**，只用于 Redirect，不再作为正式入口（§22） ---- */
  legacyProvinceResearch: '/research',
  legacyCityReport: (cityId: string) => `/cities/${cityId}/report`,
  legacyRainstorm: '/shenyang-rainstorm',
} as const;

export const CITY_ROUTE_PREFIX = '/cities/';
export const REPORTS_ROUTE_PREFIX = '/reports/';

/**
 * 结构 fallback（V3 §10；V5 §24 更新）：
 * 当用户直接通过 URL 打开某页、没有可回退的应用内历史时，`^` 要知道上一层是谁。
 *   A03 → 沈阳 → 辽宁 → 首页
 *   报告 /reports/shenyang → /reports
 *   推演 /scenario-lab → 首页
 *   关于 /about → 首页
 */
export function structuralParent(pathname: string): string | null {
  if (pathname === ROUTES.root) return null;

  if (pathname === ROUTES.researchHome) return ROUTES.root;
  if (pathname === ROUTES.about) return ROUTES.root;
  if (pathname === ROUTES.scenario) return ROUTES.root;
  if (pathname === ROUTES.reports) return ROUTES.root;
  if (pathname === ROUTES.provinceReport) return ROUTES.reports;

  const report = new RegExp(`^${REPORTS_ROUTE_PREFIX}([^/]+)/?$`).exec(pathname);
  if (report && report[1] !== 'liaoning') return ROUTES.reports;

  const note = /^\/cities\/([^/]+)\/research\/[^/]+\/?$/.exec(pathname);
  if (note) return ROUTES.city(note[1]);

  const city = /^\/cities\/([^/]+)\/?$/.exec(pathname);
  if (city) return ROUTES.researchHome;

  return ROUTES.root;
}
