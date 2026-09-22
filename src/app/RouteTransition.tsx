import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { NavigationType } from 'react-router-dom';
import { MOTION_DURATION } from '../design/motion';
import { isSpatialEntry } from './routeTransitions';

/**
 * One live Outlet. Native transitions animate inert images of the old/new page.
 *
 * V5 §70：省域 ↔ 城市共享同一个 Canvas，这次转场只允许由 Camera + Paper 负责，
 * 因此空间入口必须**完全跳过**整页淡入/滑入 —— 否则两套动作互相打架。
 *
 * 判断"从哪个路径来"需要上一路径。父组件的 effect 一定晚于本组件的 layout effect，
 * 所以上一路径记在这里，而不是由外面传进来（否则首帧会用到还没更新的值）。
 */
export function RouteTransition({ routeKey, pathname, direction, navigationType, children }: { routeKey: string; pathname: string; direction: number; navigationType: NavigationType; children: ReactNode }) {
  const page = useRef<HTMLDivElement>(null);
  const previousPath = useRef(pathname);

  useLayoutEffect(() => {
    const from = previousPath.current;
    previousPath.current = pathname;
    // 同路径（replace / 只换 state）不是一次页面转场。
    if (from === pathname) return;
    if (isSpatialEntry(from, pathname)) return;
    if ((typeof document.startViewTransition === 'function' && navigationType !== NavigationType.Pop) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Older browsers keep the same component tree and receive a light entry.
    const animation = page.current?.animate?.([
      { opacity: 0.82, transform: `translate3d(${direction * 24}px, 0, 0)` },
      { opacity: 1, transform: 'translate3d(0, 0, 0)' },
    ], { duration: MOTION_DURATION.normal * 1000, easing: 'cubic-bezier(.16,1,.3,1)' });
    return () => animation?.cancel();
  }, [direction, navigationType, pathname, routeKey]);

  return <div ref={page} className="route-page">{children}</div>;
}
