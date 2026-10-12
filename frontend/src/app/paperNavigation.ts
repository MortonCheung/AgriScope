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

/** Both shapes keep the top border fixed and use the same four ordered vertices. */
export const PAPER_OPEN = 'polygon(0 0, 100% 0, 100% 100%, 0 100%)';
export const PAPER_CLOSED = 'polygon(0 0, 100% 0, 100% 1px, 0 1px)';
export type PaperNavigationKind = 'push' | 'replace' | 'back' | 'forward';
interface PaperIntent {
  id: number;
  key: string;
  animations: Animation[];
  promise: Promise<void> | null;
}
let navigationId = 0;
let active: PaperIntent | null = null;
export function prefersInstantPaper(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
function intentKey(from: string, to: string, kind: PaperNavigationKind): string {
  const source = new URL(from, 'http://agriscope.local');
  const target = new URL(to, source);
  source.searchParams.sort(); target.searchParams.sort();
  return `${kind}:${source.href}:${target.href}`;
}
function release(intent: PaperIntent): void {
  intent.animations.forEach(animation => animation.cancel());
  intent.animations = [];
  if (active === intent) active = null;
}
/** Invalidates the destination before canceling promises that may settle immediately. */
export function cancelPendingPaperNavigation(): void {
  ++navigationId;
  if (active) release(active);
}

/** Same intent shares its whole pending transaction, including an awaited lazy commit. */
export function withPaperExit(from: string, to: string, commit: () => void | Promise<void>, kind: PaperNavigationKind = 'push'): void | Promise<void> {
  const key = intentKey(from, to, kind);
  if (active?.key === key && active.promise) return active.promise;
  cancelPendingPaperNavigation();
  const intent: PaperIntent = { id: navigationId, key, animations: [], promise: null };
  active = intent;
  const commitImmediately = () => {
    try {
      const outcome = commit();
      if (outcome && typeof outcome.then === 'function') {
        intent.promise = outcome.finally(() => release(intent));
        return intent.promise;
      }
      release(intent);
      return outcome;
    } catch (error) { release(intent); throw error; }
  };
  if (!changesPaper(from, to) || prefersInstantPaper()) return commitImmediately();
  const papers = document.querySelectorAll<HTMLElement>('.route-page [data-paper-surface]');
  try {
    for (const paper of papers) {
      // This owner must not enter and exit the same surface at the same time.
      for (const animation of paper.getAnimations?.() ?? []) if (animation.id === 'ag-paper-enter') animation.cancel();
      if (paper.animate) {
        const animation = paper.animate([
          { clipPath: PAPER_OPEN }, { clipPath: PAPER_CLOSED },
        ], { id: 'ag-paper-exit', duration: MOTION_DURATION.paperExit * 1000, easing: `cubic-bezier(${MOTION_EASE.standard.join(',')})`, fill: 'forwards' });
        // Handle cancellation even if another surface cannot construct its effect.
        void animation.finished?.catch(() => undefined);
        intent.animations.push(animation);
      }
    }
  } catch {
    // A browser unable to construct the effect still has a functional navigation.
    intent.animations.forEach(animation => animation.cancel()); intent.animations = [];
    return commitImmediately();
  }
  if (!intent.animations.length) return commitImmediately();
  intent.promise = Promise.allSettled(intent.animations.map(animation => animation.finished)).then(async settled => {
    if (active !== intent || intent.id !== navigationId || settled.some(result => result.status === 'rejected')) return;
    await commit();
  }).finally(() => release(intent));
  return intent.promise;
}
