// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useContentTransition } from './useContentTransition';
const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('motion/react', () => ({ useReducedMotion: () => motion.reduced }));
function Surface({ city }: { city: string }) { const ref = useContentTransition<HTMLDivElement>(city); return <div ref={ref}>{city}</div>; }
afterEach(() => { cleanup(); vi.restoreAllMocks(); motion.reduced = false; });
describe('immediate content transition lifecycle', () => {
  it('retains the surface and cancels obsolete animations on rapid selection and unmount', () => {
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel }) as unknown as Animation);
    Object.defineProperty(HTMLElement.prototype,'animate',{configurable:true,value:animate});
    const rendered = render(<Surface city="shenyang"/>);
    const surface = rendered.container.firstChild;
    expect(animate).not.toHaveBeenCalled();
    rendered.rerender(<Surface city="tieling"/>);
    expect(rendered.container.firstChild).toBe(surface);
    expect(surface?.textContent).toBe('tieling');
    expect(animate).toHaveBeenCalledWith([
      { opacity: 0, clipPath: 'inset(0 0 100% 0)' },
      { opacity: 1, clipPath: 'inset(0 0 0% 0)' },
    ], expect.objectContaining({ duration: expect.any(Number) }));
    rendered.rerender(<Surface city="dalian"/>);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(animate).toHaveBeenCalledTimes(2);
    rendered.unmount();
    expect(cancel).toHaveBeenCalledTimes(2);
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  });
  it('updates immediately without scheduling animation under reduced motion', () => {
    motion.reduced = true;
    const animate=vi.fn(); Object.defineProperty(HTMLElement.prototype,'animate',{configurable:true,value:animate});
    const rendered=render(<Surface city="shenyang"/>);
    rendered.rerender(<Surface city="dandong"/>);
    expect(rendered.container.textContent).toBe('dandong');
    expect(animate).not.toHaveBeenCalled();
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  });
});
