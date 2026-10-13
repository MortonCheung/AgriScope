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
  kind: PaperNavigationKind;
  target: string;
  phase: 'exiting' | 'committing';
  sourcePage: HTMLElement | null;
  sourceKey: string | undefined;
  domCommitted: Promise<void>;
  confirmDOM: () => void;
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
  intent.confirmDOM();
  if (active === intent) active = null;
}
/** Invalidates the destination before canceling promises that may settle immediately. */
export function cancelPendingPaperNavigation(): void {
  ++navigationId;
  if (active) release(active);
}

/** Router state completion is earlier than React's DOM commit. The live owner
 * calls this only after preparing the destination's first closed frame. */
export function acknowledgePaperCommit(page: HTMLElement, routeKey: string): void {
  const intent = active;
  if (!intent || intent.sourcePage !== page || !intent.sourceKey || intent.sourceKey === routeKey) return;
  if (intent.phase === 'committing') release(intent);
  else cancelPendingPaperNavigation();
}

/** Our submitted history traversal is not a cancellation. An unrelated browser
 * POP still invalidates an old exit/destination before it can commit. */
export function handlePaperPopstate(to: string): void {
  if (active?.phase === 'committing' && (active.kind === 'back' || active.kind === 'forward')
    && intentKey(to, to, active.kind) === intentKey(active.target, active.target, active.kind)) return;
  cancelPendingPaperNavigation();
}

/** Same intent shares its whole pending transaction, including an awaited lazy commit. */
export function withPaperExit(from: string, to: string, commit: () => void | Promise<void>, kind: PaperNavigationKind = 'push'): void | Promise<void> {
  const key = intentKey(from, to, kind);
  if (active?.key === key && active.promise) return active.promise;
  // Replacing an intent after its paper has already closed must not reopen the
  // old content. Capture its current geometry before releasing the old effect.
  const interruptedClips = new Map<HTMLElement, string>();
  if (active) for (const paper of document.querySelectorAll<HTMLElement>('.route-page [data-paper-surface]')) {
    const clip = window.getComputedStyle(paper).clipPath;
    if (clip?.startsWith('polygon(')) interruptedClips.set(paper, clip);
  }
  cancelPendingPaperNavigation();
  const sourcePage = document.querySelector<HTMLElement>('.route-page[data-paper-route-key]');
  let confirmDOM!: () => void;
  const domCommitted = new Promise<void>(resolve => { confirmDOM = resolve; });
  const intent: PaperIntent = { id: navigationId, key, kind, target: new URL(to, new URL(from, 'http://agriscope.local')).href,
    phase: 'exiting', sourcePage, sourceKey: sourcePage?.dataset.paperRouteKey, domCommitted, confirmDOM, animations: [], promise: null };
  active = intent;
  const waitForDOM = () => intent.sourceKey && intent.sourcePage?.isConnected
    && intent.sourcePage.dataset.paperRouteKey === intent.sourceKey ? intent.domCommitted : undefined;
  const commitImmediately = () => {
    try {
      intent.phase = 'committing';
      const outcome = commit();
      if ((outcome && typeof outcome.then === 'function') || waitForDOM()) {
        intent.promise = Promise.resolve(outcome).then(waitForDOM).finally(() => release(intent));
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
          { clipPath: interruptedClips.get(paper) ?? PAPER_OPEN }, { clipPath: PAPER_CLOSED },
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
    intent.phase = 'committing';
    await commit();
    await waitForDOM();
  }).finally(() => release(intent));
  return intent.promise;
}
