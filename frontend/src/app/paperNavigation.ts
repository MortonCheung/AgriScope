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
/** A long article unfolds over the visible part of the paper, not its full document height. */
export function paperGeometry(paper: HTMLElement): { open: string; closed: string } {
  const rect = paper.getBoundingClientRect();
  const top = Math.max(0, -rect.top);
  const bottom = Math.min(rect.height, window.innerHeight - rect.top);
  if (rect.height <= 0 || bottom <= top || (top === 0 && bottom >= rect.height)) return { open: PAPER_OPEN, closed: PAPER_CLOSED };
  const shape = (end: number) => `polygon(0 ${top}px, 100% ${top}px, 100% ${end}px, 0 ${end}px)`;
  return { open: shape(bottom), closed: shape(Math.min(bottom, top + 1)) };
}

export const PAPER_NAVIGATION_EVENT = 'agriscope:paper-navigation';
export interface PaperNavigationDetail { id: number; phase: 'start' | 'finish' | 'cancel'; target: string }
let preparePage: ((target: string) => void) | undefined;
/** Router installs its own lazy-module preparation; paper ownership stays independent. */
export function configurePaperPreparation(prepare?: (target: string) => void): void { preparePage = prepare; }
function notifyIntent(intent: PaperIntent, phase: PaperNavigationDetail['phase']): void {
  window.dispatchEvent(new CustomEvent<PaperNavigationDetail>(PAPER_NAVIGATION_EVENT, { detail: { id: intent.id, phase, target: intent.target } }));
}
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
  superseded: Set<string>;
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
function commitKey(target: string): string {
  const url = new URL(target, 'http://agriscope.local');
  url.searchParams.sort();
  return `${url.pathname}${url.search}`;
}
function release(intent: PaperIntent, phase: 'finish' | 'cancel' = 'finish'): void {
  intent.animations.forEach(animation => animation.cancel());
  intent.animations = [];
  intent.confirmDOM();
  if (active === intent) { active = null; notifyIntent(intent, phase); }
}
/** Invalidates the destination before canceling promises that may settle immediately. */
export function cancelPendingPaperNavigation(): void {
  ++navigationId;
  if (active) release(active, 'cancel');
}

/** Router state completion is earlier than React's DOM commit. The live owner
 * calls this only after preparing the destination's first closed frame. */
export function acknowledgePaperCommit(page: HTMLElement, routeKey: string, observedURL?: string): void {
  const intent = active;
  if (!intent || intent.sourcePage !== page || !intent.sourceKey || intent.sourceKey === routeKey) return;
  if (observedURL && commitKey(observedURL) !== commitKey(intent.target)) {
    if (intent.superseded.has(commitKey(observedURL))) {
      // An already submitted lazy route can finish after the next intent starts.
      // It is now the DOM source, but cannot confirm or cancel the newer target.
      intent.sourceKey = routeKey;
      return;
    }
    cancelPendingPaperNavigation();
    return;
  }
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
  const superseded = new Set(active?.superseded);
  if (active?.phase === 'committing') superseded.add(commitKey(active.target));
  // A completed exit still holds the old paper closed while Router loads.
  // Transfer that ownership, so a newer target can abort the old lazy route
  // immediately without reopening the source or repeating a closed-to-closed exit.
  const heldExit = active?.phase === 'committing' ? active.animations : [];
  if (active?.phase === 'committing') active.animations = [];
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
    phase: 'exiting', sourcePage, sourceKey: sourcePage?.dataset.paperRouteKey, domCommitted, confirmDOM, animations: heldExit, superseded, promise: null };
  active = intent;
  notifyIntent(intent, 'start');
  // Fetch the destination while the current paper retracts. Router still owns
  // loading/error handling and awaits the same module when it commits the URL.
  try { preparePage?.(intent.target); } catch { /* Preparation must not prevent navigation. */ }
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
  if (heldExit.length || !changesPaper(from, to) || prefersInstantPaper()) return commitImmediately();
  const papers = document.querySelectorAll<HTMLElement>('.route-page [data-paper-surface]');
  try {
    for (const paper of papers) {
      // This owner must not enter and exit the same surface at the same time.
      for (const animation of paper.getAnimations?.() ?? []) if (animation.id === 'ag-paper-enter') animation.cancel();
      if (paper.animate) {
        const geometry = paperGeometry(paper);
        const animation = paper.animate([
          { clipPath: interruptedClips.get(paper) ?? geometry.open }, { clipPath: geometry.closed },
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
