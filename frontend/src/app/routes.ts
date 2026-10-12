import { researchParent, researchIdKind } from '../domain/research/catalog';
import { readContextFromSearch } from './context/appContext';
import { STUDY_CITY_IDS } from '../domain/geography/cities';

/**
 * AgriScope 正式路由。
 *
 * 研究层级（本轮 §9）：`/cities/:cityId/research/:researchId`，
 * 其中 researchId 既可以是方向（A2），也可以是具体研究点（A2.2）：
 *
 *   /cities/shenyang/research/A2      方向入口
 *   /cities/shenyang/research/A2.2    具体研究点（交互研究的主战场）
 *   ...?mode=article                  打开完整 A2 文章（并从 A2.2 定位过去）
 *
 * canonical id 是 A1–A8 / A?.?；当前数据载荷仍是 A01–A09，由 repository 内部解析，
 * **不出现在 URL、不出现在界面**。
 */
export const ROUTES = {
  root: '/',

  /** 「研究」首页：辽宁 3D → 六城。 */
  researchHome: '/liaoning',
  /** 兼容别名：旧代码里的 liaoning 就是研究首页。 */
  liaoning: '/liaoning',

  city: (cityId: string) => `/cities/${cityId}`,
  decision: (cityId: string) => `/cities/${cityId}/decision`,
  /** 研究方向（A2）或研究点（A2.2）共用这一条。 */
  research: (cityId: string, researchId: string) => `/cities/${cityId}/research/${researchId}`,

  /** 「决策中心」全局入口（V3 §7）：按全局上下文落到某座城市的决策页。 */
  decisionCenter: '/decision',

  /** 「研究中心」全局入口（V3 §17/§18）：证据库首页。 */
  researchCenter: '/research',

  /** 「报告」：城市正式报告 + 辽宁六城综合报告。 */
  reports: '/reports',
  cityReport: (cityId: string) => `/reports/${cityId}`,
  provinceReport: '/reports/liaoning',

  /** 「推演」：2026 沈阳暴雨平行情景（归入决策中心）。 */
  scenario: '/scenario-lab',
  /** 兼容别名。 */
  scenarioLab: '/scenario-lab',

  about: '/about',

  /** ---- 旧路径，只用于 Redirect，不再作为正式入口 ---- */
  legacyCityReport: (cityId: string) => `/cities/${cityId}/report`,
  legacyRainstorm: '/shenyang-rainstorm',
} as const;

export const CITY_ROUTE_PREFIX = '/cities/';
export const REPORTS_ROUTE_PREFIX = '/reports/';

/** 从路径里取 cityId / researchId，供路由与外壳共用。 */
export function parseResearchPath(pathname: string): { cityId: string; researchId: string } | null {
  const match = /^\/cities\/([^/]+)\/research\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  try { return { cityId: match[1], researchId: decodeURIComponent(match[2]) }; } catch { return null; }
}

export function parseCityPath(pathname: string): string | null {
  const match = /^\/cities\/([^/]+)\/?$/.exec(pathname);
  return match ? match[1] : null;
}

/**
 * 把载荷编号写法的 researchId 换成 canonical 写法（§4/§12）。
 *
 * 旧链接 `/cities/shenyang/research/A01` 与 `/…/A01.3` 仍然要能打开，
 * 但正式 URL 与界面一律用 A1 / A1.3。这个函数只做编号归一，不查 catalog。
 */
export function canonicalResearchId(raw: string): string {
  const topic = /^A0(\d)$/.exec(raw);
  if (topic) return `A${Number(topic[1])}`;
  const point = /^A0(\d)\.(\d+)$/.exec(raw);
  if (point) return `A${Number(point[1])}.${point[2]}`;
  return raw;
}

/** 这个 researchId 是否是"载荷编号写法"（需要重定向到 canonical）。 */
export function isLegacyPayloadResearchId(raw: string): boolean {
  return canonicalResearchId(raw) !== raw;
}

/**
 * 结构 fallback（本轮 §10）：
 * 用户直接通过 URL 打开某页、没有可回退的应用内历史时，`^` 要知道上一层是谁。
 *
 *   A2.2 → A2 → 沈阳 → 辽宁
 *   /reports/shenyang → /reports
 *   推演 / 关于 → 首页
 *
 * 旧实现把所有 `/research/*` 直接跳到城市，跳过了"方向"这一层；
 * 现在按 catalog 的两级结构走。
 */
export function structuralParent(pathname: string, search = ''): string | null {
  pathname = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (pathname === ROUTES.root) return null;

  if (pathname === ROUTES.researchHome) return readContextFromSearch(search).cityId ? ROUTES.liaoning : null;
  if (pathname === ROUTES.about) return ROUTES.liaoning;
  if (pathname === ROUTES.scenario) return ROUTES.liaoning;
  if (pathname === ROUTES.decisionCenter) return ROUTES.liaoning;
  if (pathname === ROUTES.researchCenter) return ROUTES.liaoning;
  if (pathname === ROUTES.reports) return ROUTES.liaoning;
  if (pathname === ROUTES.provinceReport) return ROUTES.reports;

  const report = new RegExp(`^${REPORTS_ROUTE_PREFIX}([^/]+)/?$`).exec(pathname);
  if (report && report[1] !== 'liaoning') return ROUTES.reports;

  const research = parseResearchPath(pathname);
  if (research) {
    if (!(STUDY_CITY_IDS as readonly string[]).includes(research.cityId)) return ROUTES.liaoning;
    const canonical = canonicalResearchId(research.researchId);
    // 只有 catalog 认得这个 id 时才按它推层级；认不得就退回城市页，避免造出不存在的父级。
    const kind = researchIdKind(research.cityId, canonical);
    if (kind === 'point') {
      const parent = researchParent(research.cityId, canonical);
      return parentBusinessUrl(ROUTES.research(research.cityId, parent.id), research.cityId, search);
    }
    return parentBusinessUrl(ROUTES.city(research.cityId), research.cityId, search);
  }

  const decision = /^\/cities\/([^/]+)\/decision\/?$/.exec(pathname);
  if (decision) return selectedProvince(decision[1]);

  const city = parseCityPath(pathname);
  if (city) {
    if (!(STUDY_CITY_IDS as readonly string[]).includes(city)) return ROUTES.liaoning;
    const selected = new URLSearchParams(search).get('research');
    if (selected) {
      const canonical = canonicalResearchId(selected);
      if (researchIdKind(city, canonical) === 'point') return parentBusinessUrl(ROUTES.research(city, researchParent(city, canonical).id), city, search);
      if (researchIdKind(city, canonical) === 'topic') return parentBusinessUrl(ROUTES.city(city), city, search);
    }
    return selectedProvince(city);
  }

  return ROUTES.liaoning;
}

function selectedProvince(cityId: string): string {
  return (STUDY_CITY_IDS as readonly string[]).includes(cityId)
    ? `${ROUTES.liaoning}?${new URLSearchParams({ city: cityId })}` : ROUTES.liaoning;
}

/** Keep valid business conditions, discard child selection/mode/plan on an Up action. */
function parentBusinessUrl(pathname: string, cityId: string, search: string): string {
  const current = readContextFromSearch(search);
  const params = new URLSearchParams();
  if (current.cityId || current.crop || current.horizon !== undefined || current.asOf) params.set('city', cityId);
  if (current.crop) params.set('crop', current.crop);
  if (current.horizon !== undefined) params.set('horizon', String(current.horizon));
  if (current.asOf) params.set('as_of', current.asOf);
  return params.size ? `${pathname}?${params}` : pathname;
}
