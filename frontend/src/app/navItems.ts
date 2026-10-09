import { ROUTES, REPORTS_ROUTE_PREFIX } from './routes';

/**
 * 顶部导航的一级结构（V3 §4）。
 *
 * 一级入口收敛为三件产品事，而不是四个功能页：
 *
 *   辽宁农业态势   /liaoning                    —— 驾驶舱：地图 + 当前农业市场状态
 *   决策中心       /decision 与城市决策页、推演
 *   研究中心       /research 与报告、城市研究、关于
 *
 * 「关于 / 报告 / 推演」不再是并列一级入口：报告与溯源归入研究中心，
 * 情景推演归入决策中心。它们仍然可达，只是不再与三条主线争抢顶部空间。
 *
 * 抽成纯函数而不是写在组件里：这是产品层级的事实，必须能被测试锁住。
 */
export interface NavItem {
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
    to: ROUTES.liaoning,
    label: '辽宁农业态势',
    match: (path) => path === ROUTES.liaoning,
  },
  {
    to: ROUTES.decisionCenter,
    label: '决策中心',
    match: (path) => path === ROUTES.decisionCenter || DECISION_PATH.test(path) || path === ROUTES.scenario,
  },
  {
    to: ROUTES.researchCenter,
    label: '研究中心',
    match: (path) =>
      path === ROUTES.researchCenter
      || path === ROUTES.about
      || path === ROUTES.reports
      || path.startsWith(REPORTS_ROUTE_PREFIX)
      || CITY_HOME_PATH.test(path)
      || CITY_RESEARCH_PATH.test(path),
  },
] as const;

/** 给定路径下应当高亮的导航项（最多一个）。 */
export function activeNavItem(pathname: string): NavItem | null {
  return NAV_ITEMS.find((item) => item.match(pathname)) ?? null;
}
