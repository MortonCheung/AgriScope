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
