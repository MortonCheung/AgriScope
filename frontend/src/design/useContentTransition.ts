import { useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { MOTION_DURATION } from './motion';

export function animateContentSurface(node: HTMLElement) {
  return node.animate?.([
    { opacity: 0, clipPath: 'inset(0 0 100% 0)' },
    { opacity: 1, clipPath: 'inset(0 0 0% 0)' },
  ], { duration: MOTION_DURATION.normal * 1000, easing: 'cubic-bezier(.22,.68,.18,1)' });
}

/** Update content immediately; animate only its surface, with no state delay. */
export function useContentTransition<T extends HTMLElement>(key: string | null) {
  const ref = useRef<T>(null);
  const previous = useRef(key);
  const reducedMotion = useReducedMotion();
  useLayoutEffect(() => {
    const changed = previous.current !== key;
    previous.current = key;
    if (!changed || reducedMotion || !ref.current?.animate) return;
    const animation = animateContentSurface(ref.current);
    return () => animation?.cancel();
  }, [key, reducedMotion]);
  return ref;
}
