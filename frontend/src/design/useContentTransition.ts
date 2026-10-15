import { useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { MOTION_DURATION, MOTION_EASE } from './motion';

export function animateContentSurface(node: HTMLElement, from = 'translateY(0)') {
  try {
    return node.animate?.([
      { transform: from },
      { transform: 'translateY(-2px)', offset: 0.32 },
      { transform: 'translateY(0)' },
    ], { id: 'ag-content-switch', duration: MOTION_DURATION.normal * 1000, easing: `cubic-bezier(${MOTION_EASE.standard.join(',')})` });
  } catch { return undefined; }
}

/** Update content immediately; animate only its surface, with no state delay. */
export function useContentTransition<T extends HTMLElement>(key: string | null | ((surface: T) => string), selector?: string) {
  const ref = useRef<T>(null);
  const previous = useRef<string | null | undefined>(undefined);
  const animations = useRef(new Set<Animation>());
  const reducedMotion = useReducedMotion();
  const cancel = () => { animations.current.forEach(animation => animation.cancel()); animations.current.clear(); };
  useLayoutEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () => { if (media?.matches) cancel(); };
    media?.addEventListener?.('change', update);
    return () => { media?.removeEventListener?.('change', update); cancel(); };
  }, []);
  useLayoutEffect(() => {
    const surface = ref.current;
    const identity = typeof key === 'function' ? surface ? key(surface) : null : key;
    const changed = previous.current !== undefined && previous.current !== identity;
    previous.current = identity;
    // The installed Motion hook keeps its initial value; read live preference here.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? reducedMotion) { cancel(); return; }
    if (!changed || !surface) return;
    // The outer paper already reveals a new page; don't start a second entrance.
    if (surface.getAnimations?.().some(animation => animation.id === 'ag-paper-enter' && animation.playState !== 'finished')) { cancel(); return; }
    const nodes = selector ? surface.querySelectorAll<HTMLElement>(selector) : [surface];
    // Continue a rapid selection from its visible position, then release the old effect.
    const positions = new Map([...nodes].map(node => [node, getComputedStyle(node).transform]));
    cancel();
    for (const node of nodes) {
      const position = positions.get(node);
      const animation = animateContentSurface(node, position && position !== 'none' ? position : undefined);
      if (!animation) continue;
      animations.current.add(animation);
      void animation.finished?.then(() => animations.current.delete(animation), () => animations.current.delete(animation));
    }
  }, [key, reducedMotion, selector]);
  return ref;
}
