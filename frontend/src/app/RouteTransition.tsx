import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { NavigationType } from 'react-router-dom';
import { MOTION_DURATION, MOTION_EASE } from '../design/motion';
import { cancelPendingPaperNavigation, changesPaper, paperPageKey, prefersInstantPaper, PAPER_OPEN, PAPER_CLOSED } from './paperNavigation';

interface PaperAction {
  key: string;
  enter: boolean;
  foundSurface: boolean;
  seen: WeakSet<Element>;
  animations: Set<Animation>;
  generation: number;
}
const cancelReveals = (action: PaperAction | null) => {
  action?.animations.forEach(animation => animation.cancel());
  action?.animations.clear();
};

/** RouteTransition reveals; paperNavigation retracts. Native snapshots are never used. */
export function RouteTransition({ routeKey, pathname, search = '', children }: { routeKey: string; pathname: string; search?: string; direction: number; navigationType: NavigationType; children: ReactNode }) {
  const page = useRef<HTMLDivElement>(null);
  const previous = useRef<string | null>(null);
  const action = useRef<PaperAction | null>(null);
  useLayoutEffect(() => {
    const onPop = () => cancelPendingPaperNavigation();
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('popstate', onPop); cancelPendingPaperNavigation(); };
  }, []);
  useLayoutEffect(() => {
    const to = `${pathname}${search}`;
    if (action.current?.key !== routeKey) {
      const from = previous.current;
      const previousAction = action.current;
      const crossPage = from !== null && changesPaper(from, to);
      // A canonical redirect may replace an entrance before lazy content has
      // supplied any surface. Carry that unused intent, not an already shown paper.
      const pendingEntrance = previousAction?.enter && !previousAction.foundSurface;
      cancelPendingPaperNavigation();
      cancelReveals(previousAction);
      action.current = { key: routeKey, enter: from === null || crossPage || from.split('?')[0] === '/' || Boolean(pendingEntrance), foundSurface: false, seen: new WeakSet(), animations: new Set(), generation: 0 };
      previous.current = to;
    }
    const current = action.current!;
    const generation = ++current.generation;
    const reveal = () => {
      for (const paper of page.current?.querySelectorAll<HTMLElement>('[data-paper-surface]') ?? []) {
        current.foundSurface = true;
        if (current.seen.has(paper)) continue;
        current.seen.add(paper);
        if (!current.enter || prefersInstantPaper()) continue;
        let animation: Animation | undefined;
        try {
          animation = paper.animate?.([
            { clipPath: PAPER_CLOSED },
            { clipPath: PAPER_OPEN },
          ], { id: 'ag-paper-enter', duration: MOTION_DURATION.paperEnter * 1000, easing: `cubic-bezier(${MOTION_EASE.standard.join(',')})` });
        } catch {
          // Unsupported geometry must leave the live surface visible and usable.
          continue;
        }
        if (animation) {
          current.animations.add(animation);
          void animation.finished?.then(() => current.animations.delete(animation), () => current.animations.delete(animation));
        }
      }
    };
    reveal();
    const observer = new MutationObserver(reveal);
    if (page.current) observer.observe(page.current, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      // StrictMode immediately rehearses setup again. Keep its one live reveal;
      // a genuine unmount cancels at the microtask boundary, a new route cancels above.
      queueMicrotask(() => { if (current.generation === generation) cancelReveals(current); });
    };
  }, [pathname, search, routeKey]);
  return <div ref={page} className="route-page" data-paper-page={paperPageKey(pathname, search)}>{children}</div>;
}
