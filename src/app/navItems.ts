import { ROUTES, CITY_ROUTE_PREFIX } from './routes';

/**
 * 顶部导航的 Active 语义（V4 §十四）。
 *
 * 抽成纯函数而不是写在组件里，因为"哪个页面高亮哪一项"是产品层级的事实，
 * 必须可以用测试锁住，而不是只能靠肉眼看。
 *
 *   辽宁      单城市 / 地理研究体系：/liaoning、/cities/*、/shenyang-rainstorm
 *   研究      只代表辽宁六城综合研究：/research、/research/*
 *   情景实验  只代表 Scenario Lab
 *   关于      只代表 /about
 */
export interface NavItem {
  to: string;
  label: string;
  match: (pathname: string) => boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    to: ROUTES.liaoning,
    label: '辽宁',
    match: (path) => path === ROUTES.liaoning || path.startsWith(CITY_ROUTE_PREFIX) || path === ROUTES.rainstorm,
  },
  {
    to: ROUTES.provinceResearch,
    label: '研究',
    match: (path) => path === ROUTES.provinceResearch || path.startsWith(`${ROUTES.provinceResearch}/`),
  },
  {
    to: ROUTES.scenarioLab,
    label: '情景实验',
    match: (path) => path === ROUTES.scenarioLab,
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
