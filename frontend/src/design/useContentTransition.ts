import { useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { MOTION_DURATION, MOTION_EASE } from './motion';

export function animateContentSurface(node: HTMLElement) {
  try {
    return node.animate?.([
      { transform: 'translateY(8px)' },
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
  useLayoutEffect(() => cancel, []);
  useLayoutEffect(() => {
    const surface = ref.current;
    const identity = typeof key === 'function' ? surface ? key(surface) : null : key;
    const changed = previous.current !== undefined && previous.current !== identity;
    previous.current = identity;
    if (reducedMotion) { cancel(); return; }
    if (!changed || !surface) return;
    cancel();
    // The outer paper already reveals a new page; don't start a second entrance.
    if (surface.getAnimations?.().some(animation => animation.id === 'ag-paper-enter' && animation.playState !== 'finished')) return;
    const nodes = selector ? surface.querySelectorAll<HTMLElement>(selector) : [surface];
    for (const node of nodes) {
      const animation = animateContentSurface(node);
      if (!animation) continue;
      animations.current.add(animation);
      void animation.finished?.then(() => animations.current.delete(animation), () => animations.current.delete(animation));
    }
  }, [key, reducedMotion, selector]);
  return ref;
}
