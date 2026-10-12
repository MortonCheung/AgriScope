// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { animateContentSurface, useContentTransition } from './useContentTransition';

const preferences = vi.hoisted(() => ({ reduced: false }));
vi.mock('motion/react', () => ({ useReducedMotion: () => preferences.reduced }));
afterEach(() => { cleanup(); preferences.reduced = false; delete (HTMLElement.prototype as Partial<HTMLElement>).animate; });
function LocalReading({ identity }: { identity: string }) {
  const ref = useContentTransition<HTMLDivElement>(identity);
  return <div ref={ref}>{identity}</div>;
}
describe('local content motion never fades a surface', () => {
  it('contains no opacity, filter or scaling keyframes', () => {
    const node = document.createElement('div'); const animate = vi.fn();
    Object.defineProperty(node, 'animate', { value: animate });
    animateContentSurface(node);
    const frames = animate.mock.calls[0][0] as Keyframe[];
    expect(frames.every(frame => !('opacity' in frame) && !('filter' in frame) && !String(frame.transform).includes('scale'))).toBe(true);
    expect(String(frames[1].transform)).toBe('translateY(0)');
  });
  it('only a local identity change moves the same node, and reduced motion cancels it', () => {
    const cancel = vi.fn(), animate = vi.fn(() => ({ cancel }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    const opened = render(<LocalReading identity="province" />); const node = opened.container.firstChild;
    opened.rerender(<LocalReading identity="province" />); expect(animate).not.toHaveBeenCalled();
    opened.rerender(<LocalReading identity="tieling" />); expect(opened.container.firstChild).toBe(node); expect(animate).toHaveBeenCalledOnce();
    preferences.reduced = true;
    opened.rerender(<LocalReading identity="chaoyang" />); expect(animate).toHaveBeenCalledOnce(); expect(cancel).toHaveBeenCalledOnce();
  });
});
