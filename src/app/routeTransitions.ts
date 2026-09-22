import { NavigationType } from 'react-router-dom';
import './route-transitions.css';

export type RouteDirection = -1 | 0 | 1;

/** 共享同一个三维 Canvas 的路由：之间只移动相机，不做页面切换动画。 */
function isSpatialRoute(path: string) {
  return path === '/' || path === '/liaoning' || /^\/cities\/[^/]+\/?$/.test(path);
}

export function isSpatialEntry(from: string, to: string) {
  return isSpatialRoute(from) && isSpatialRoute(to);
}

function routeLayer(path: string) {
  if (path === '/' || path === '/liaoning') return 0;
  if (/^\/cities\/[^/]+\/?$/.test(path)) return 0;
  if (/^\/cities\/[^/]+\/report\/?$/.test(path)) return 2;
  if (/^\/cities\/[^/]+\/research\/[^/]+\/?$/.test(path)) return 2;
  if (path === '/shenyang-rainstorm' || path === '/scenario-lab') return 2;
  if (path === '/about') return 1;
  return 1;
}

/** 真实 POP 方向优先；普通 PUSH 只在进入更深的工作页时向前。 */
export function getRouteDirection(from: string, to: string, navigation: { action?: NavigationType; popDirection?: RouteDirection } = {}): RouteDirection {
  if (from === to) return 0;
  if (navigation.action === NavigationType.Pop) return navigation.popDirection ?? 0;
  if (navigation.action === NavigationType.Replace || isSpatialEntry(from, to)) return 0;
  return routeLayer(to) > routeLayer(from) ? 1 : 0;
}
