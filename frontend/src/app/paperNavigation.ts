import { MOTION_DURATION, MOTION_EASE } from '../design/motion';
import { isSpatialEntry, isWorkspaceNavigation } from './routeTransitions';

/** Queries select content inside the live paper. */
export function paperPageKey(pathname: string, search = ''): string {
  void search;
  return pathname;
}
export function changesPaper(from: string, to: string): boolean {
  const source = new URL(from, 'http://agriscope.local');
  const target = new URL(to, source);
  if (paperPageKey(source.pathname, source.search) === paperPageKey(target.pathname, target.search)) return false;
  return !isSpatialEntry(source.pathname, target.pathname)
    && !isWorkspaceNavigation(source.pathname, target.pathname);
}

let navigationId = 0;
let active: Animation[] = [];
export function prefersInstantPaper(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Invalidates the destination before canceling promises that may settle immediately. */
export function cancelPendingPaperNavigation(): void {
  ++navigationId;
  const exiting = active;
  active = [];
  exiting.forEach(animation => animation.cancel());
}

/** A single DOM owner folds old surfaces before committing; Canvas and Outlet stay live. */
export function withPaperExit(from: string, to: string, commit: () => void | Promise<void>): void | Promise<void> {
  cancelPendingPaperNavigation();
  const id = navigationId;
  if (!changesPaper(from, to) || prefersInstantPaper()) return commit();
  const papers = document.querySelectorAll<HTMLElement>('.route-page [data-paper-surface]');
  active = [...papers].flatMap(paper => {
    // A rapid click can arrive before the current reveal finishes. The same
    // surface cannot carry an entering and exiting paper effect together.
    for (const animation of paper.getAnimations?.() ?? []) if (animation.id === 'ag-paper-enter') animation.cancel();
    return paper.animate ? [paper.animate([
      { opacity: 1, clipPath: 'inset(0 0 0% 0)' },
      { opacity: 0, clipPath: 'inset(0 0 100% 0)' },
    ], { id: 'ag-paper-exit', duration: MOTION_DURATION.paperExit * 1000, easing: `cubic-bezier(${MOTION_EASE.standard.join(',')})`, fill: 'forwards' })] : [];
  });
  if (!active.length) return commit();
  const exiting = active;
  return Promise.allSettled(exiting.map(animation => animation.finished)).then(async () => {
    if (id !== navigationId) return;
    try { await commit(); }
    finally { exiting.forEach(animation => animation.cancel()); if (id === navigationId) active = []; }
  });
}
