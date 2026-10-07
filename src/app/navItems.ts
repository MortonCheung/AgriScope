import { ROUTES, CITY_ROUTE_PREFIX, REPORTS_ROUTE_PREFIX } from './routes';

/**
 * 顶部导航的 Active 语义（V5 §23）。
 *
 * 抽成纯函数而不是写在组件里：这是产品层级的事实，必须能被测试锁住。
 *
 *   研究  /liaoning、/cities/*（/reports/* 天然不落在这些前缀里）
 *   报告  /reports、/reports/*
 *   推演  /scenario-lab
 *   关于  /about
 */
export interface NavItem {
  to: string;
  label: string;
  match: (pathname: string) => boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    to: ROUTES.researchHome,
    label: '研究',
    match: (path) => path === ROUTES.researchHome || path.startsWith(CITY_ROUTE_PREFIX),
  },
  {
    to: ROUTES.reports,
    label: '报告',
    match: (path) => path === ROUTES.reports || path.startsWith(REPORTS_ROUTE_PREFIX),
  },
  {
    to: ROUTES.scenario,
    label: '推演',
    match: (path) => path === ROUTES.scenario,
  },
  {
    to: ROUTES.about,
    label: '关于',
    match: (path) => path === ROUTES.about,
  },
] as const;

/** 给定路径下应当高亮的导航项（最多一个）。 */
export function activeNavItem(pathname: string): NavItem | null {
  return NAV_ITEMS.find((item) => item.match(pathname)) ?? null;
}
