import { ROUTES, REPORTS_ROUTE_PREFIX } from './routes';
import type { PrimaryNavigation } from './context/navigationContext';

/** Four primary tasks share one stable Header; route families determine the active item. */
export interface NavItem {
  id: PrimaryNavigation;
  to: string;
  label: string;
  match: (pathname: string) => boolean;
}

/** /cities/:cityId/decision */
const DECISION_PATH = /^\/cities\/[^/]+\/decision\/?$/;
/** /cities/:cityId（城市研究窗口） */
const CITY_HOME_PATH = /^\/cities\/[^/]+\/?$/;
/** /cities/:cityId/research/:researchId */
const CITY_RESEARCH_PATH = /^\/cities\/[^/]+\/research\//;

export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'home',
    to: ROUTES.liaoning,
    label: '主页',
    match: (path) => path === ROUTES.liaoning || path === ROUTES.root,
  },
  {
    id: 'decision',
    to: ROUTES.decisionCenter,
    label: '决策',
    match: (path) => path === ROUTES.decisionCenter || DECISION_PATH.test(path) || path === ROUTES.scenario,
  },
  {
    id: 'reports',
    to: ROUTES.researchCenter,
    label: '报告',
    match: (path) =>
      path === ROUTES.researchCenter
      || path === ROUTES.reports
      || path.startsWith(REPORTS_ROUTE_PREFIX)
      || CITY_HOME_PATH.test(path)
      || CITY_RESEARCH_PATH.test(path),
  },
  { id: 'about', to: ROUTES.about, label: '关于', match: (path) => path === ROUTES.about },
] as const;

/** 给定路径下应当高亮的导航项（最多一个）。 */
export function activeNavItem(pathname: string): NavItem | null {
  return NAV_ITEMS.find((item) => item.match(pathname)) ?? null;
}
