import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { NavigationType } from 'react-router-dom';
import { changesPaper, paperPageKey, prefersInstantPaper } from './paperNavigation';

/** Keep one live Outlet. Query-driven report views share the same motion language. */
export function RouteTransition({ routeKey, pathname, search = '', navigationType, children }: { routeKey: string; pathname: string; search?: string; direction: number; navigationType: NavigationType; children: ReactNode }) {
  const page = useRef<HTMLDivElement>(null);
  const previous = useRef(`${pathname}${search}`);
  useLayoutEffect(() => {
    const to = `${pathname}${search}`;
    const from = previous.current;
    previous.current = to;
    if (!changesPaper(from, to) || prefersInstantPaper()) return;
    if (typeof document.startViewTransition === 'function' && navigationType !== NavigationType.Pop) return;
    const papers = page.current?.querySelectorAll<HTMLElement>('.ag-paper-enter') ?? [];
    // Freshly mounted papers already have the shared CSS entry. Reused papers
    // (query-driven report pages or POPs) receive the same top-down mask.
    const animations = [...papers].filter(paper => !paper.getAnimations?.().some(animation => 'animationName' in animation && animation.animationName === 'ag-paper-reveal')).map(paper => paper.animate?.([
      { opacity: 0, clipPath: 'inset(0 0 100% 0)' },
      { opacity: 1, clipPath: 'inset(0 0 0% 0)' },
    ], { duration: 260, easing: 'cubic-bezier(.22,.68,.18,1)' }));
    return () => animations.forEach(animation => animation?.cancel());
  }, [navigationType, pathname, search, routeKey]);
  return <div ref={page} className="route-page" data-paper-page={paperPageKey(pathname, search)}>{children}</div>;
}
