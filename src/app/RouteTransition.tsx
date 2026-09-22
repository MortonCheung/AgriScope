import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { NavigationType } from 'react-router-dom';
import { MOTION_DURATION } from '../design/motion';

/** One live Outlet. Native transitions animate inert images of the old/new page. */
export function RouteTransition({ routeKey, direction, navigationType, children }: { routeKey: string; direction: number; navigationType: NavigationType; children: ReactNode }) {
  const page = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if ((typeof document.startViewTransition === 'function' && navigationType !== NavigationType.Pop) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Older browsers keep the same component tree and receive a light entry.
    const animation = page.current?.animate?.([
      { opacity: 0.82, transform: `translate3d(${direction * 24}px, 0, 0)` },
      { opacity: 1, transform: 'translate3d(0, 0, 0)' },
    ], { duration: MOTION_DURATION.normal * 1000, easing: 'cubic-bezier(.16,1,.3,1)' });
    return () => animation?.cancel();
  }, [direction, navigationType, routeKey]);
  return <div ref={page} className="route-page">{children}</div>;
}
