import { createElement, useLayoutEffect, useRef, useState, type HTMLAttributes } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { MOTION_DURATION, MOTION_EASE } from '../../design/motion';
import './selection-group.css';

type Surface = { x: number; y: number; width: number; height: number; slide: boolean };
type Props = HTMLAttributes<HTMLElement> & { as?: 'div' | 'ul' | 'ol'; value?: string | null };

/** A single local surface: selection moves; initial entry and layout changes simply align.
 * No shared layout identity can survive a route or borrow another group's coordinates.
 */
export function SelectionGroup({ as = 'div', value, children, className = '', ...props }: Props) {
  const host = useRef<HTMLElement>(null);
  const previousValue = useRef(value);
  const [surface, setSurface] = useState<Surface | null>(null);
  const reduced = Boolean(useReducedMotion());

  useLayoutEffect(() => {
    const group = host.current;
    if (!group) return;
    const changed = previousValue.current !== value;
    previousValue.current = value;
    const measure = (slide = false) => {
      const target = [...group.querySelectorAll<HTMLElement>('[data-selection-value]')].find(element =>
        element.dataset.selectionValue === value && element.closest('[data-selection-group]') === group
        && !element.matches(':disabled, [aria-disabled="true"]')
        && !element.closest('[inert], [aria-hidden="true"]'));
      if (!target || !target.offsetWidth || !target.offsetHeight) {
        setSurface(previous => previous === null ? previous : null);
        return;
      }
      let x = 0, y = 0, node: HTMLElement | null = target;
      while (node && node !== group) {
        x += node.offsetLeft;
        y += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
      }
      if (node !== group) return;
      const next = { x, y, width: target.offsetWidth, height: target.offsetHeight, slide };
      setSurface(previous => previous && previous.x === x && previous.y === y
        && previous.width === next.width && previous.height === next.height ? previous
        : { ...next, slide: slide && previous !== null });
    };
    measure(changed);
    const align = () => measure();
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(align);
    resize?.observe(group);
    group.querySelectorAll<HTMLElement>('[data-selection-value]').forEach(item => resize?.observe(item));
    // Nested disclosures may change visibility without changing the selected business value.
    const mutation = new MutationObserver(align);
    mutation.observe(group, { subtree: true, childList: true, attributes: true, attributeFilter: ['inert', 'aria-hidden'] });
    window.addEventListener('resize', align);
    return () => { resize?.disconnect(); mutation.disconnect(); window.removeEventListener('resize', align); };
  }, [value, children]);

  const SurfaceTag = as === 'div' ? motion.span : motion.li;
  const fill = surface && <SurfaceTag key="selection-surface" aria-hidden="true" className="selection-group__surface"
    initial={false} animate={{ x: surface.x, y: surface.y, width: surface.width, height: surface.height }}
    transition={{ duration: reduced || !surface.slide ? 0 : MOTION_DURATION.selection, ease: MOTION_EASE.out }}/>;
  return createElement(as, { ...props, ref: host, className: `selection-group ${className}`, 'data-selection-group': '' }, children, fill);
}
