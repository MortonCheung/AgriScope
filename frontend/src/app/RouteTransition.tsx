import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useViewTransitionState, type NavigationType } from 'react-router-dom';
import { changesPaper, paperPageKey, prefersInstantPaper } from './paperNavigation';

/** One route owner. Native snapshots and DOM fallback never reveal the same paper. */
export function RouteTransition({ routeKey, pathname, search = '', children }: { routeKey: string; pathname: string; search?: string; direction: number; navigationType: NavigationType; children: ReactNode }) {
  const page = useRef<HTMLDivElement>(null);
  const previous = useRef<string | null>(null);
  const action = useRef<{ key: string; enter: boolean; native: boolean; seen: WeakSet<Element> } | null>(null);
  const native = useViewTransitionState(`${pathname}${search}`);
  useLayoutEffect(() => {
    const to = `${pathname}${search}`;
    if (action.current?.key !== routeKey) {
      const from = previous.current;
      const crossPage = from !== null && changesPaper(from, to);
      document.documentElement.dataset.paperMotion = crossPage || from === null ? 'page' : 'content';
      action.current = { key: routeKey, enter: from === null || crossPage || from.split('?')[0] === '/', native, seen: new WeakSet() };
      previous.current = to;
    }
    const current = action.current!;
    // Router may use native transitions on POP. The action stays consumed
    // after its native context returns to false.
    if (native) current.native = true;
    const animations: Animation[] = [];
    const reveal = () => {
      for (const paper of page.current?.querySelectorAll<HTMLElement>('[data-paper-surface]') ?? []) {
        if (current.seen.has(paper)) continue;
        current.seen.add(paper);
        if (!current.enter || current.native || prefersInstantPaper()) continue;
        const animation = paper.animate?.([
          { opacity: 0, clipPath: 'inset(0 0 100% 0)' },
          { opacity: 1, clipPath: 'inset(0 0 0% 0)' },
        ], { duration: 260, easing: 'cubic-bezier(.22,.68,.18,1)' });
        if (animation) animations.push(animation);
      }
    };
    reveal();
    const observer = new MutationObserver(reveal);
    if (page.current) observer.observe(page.current, { childList: true, subtree: true });
    return () => { observer.disconnect(); animations.forEach(animation => animation.cancel()); };
  }, [native, pathname, search, routeKey]);
  return <div ref={page} className="route-page" data-paper-page={paperPageKey(pathname, search)}>{children}</div>;
}
