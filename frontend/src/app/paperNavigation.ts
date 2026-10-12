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
/** Older browsers fold the existing surfaces before committing. No second Outlet. */
export function withPaperExit(from: string, to: string, commit: () => void | Promise<void>): void | Promise<void> {
  const id = ++navigationId;
  active.forEach(animation => animation.cancel());
  active = [];
  if (!changesPaper(from, to) || prefersInstantPaper() || typeof document.startViewTransition === 'function') return commit();
  const papers = document.querySelectorAll<HTMLElement>('.route-page [data-paper-surface]');
  active = [...papers].flatMap(paper => paper.animate ? [paper.animate([
    { opacity: 1, clipPath: 'inset(0 0 0% 0)' },
    { opacity: 0, clipPath: 'inset(0 0 100% 0)' },
  ], { duration: 180, easing: 'cubic-bezier(.22,.68,.18,1)', fill: 'forwards' })] : []);
  if (!active.length) return commit();
  const exiting = active;
  return Promise.allSettled(exiting.map(animation => animation.finished)).then(async () => {
    if (id !== navigationId) return;
    try { await commit(); }
    finally { exiting.forEach(animation => animation.cancel()); if (id === navigationId) active = []; }
  });
}
