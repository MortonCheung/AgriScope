// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { animateContentSurface, useContentTransition } from './useContentTransition';

const preferences = vi.hoisted(() => ({ reduced: false }));
vi.mock('motion/react', () => ({ useReducedMotion: () => preferences.reduced }));
afterEach(() => { cleanup(); preferences.reduced = false; vi.unstubAllGlobals(); delete (HTMLElement.prototype as Partial<HTMLElement>).animate; });
function LocalReading({ identity }: { identity: string }) {
  const ref = useContentTransition<HTMLDivElement>(identity);
  return <div ref={ref}>{identity}</div>;
}
describe('local content motion never fades a surface', () => {
  it('unsupported content effects leave the updated content usable', () => {
    const node = document.createElement('div');
    Object.defineProperty(node, 'animate', { value: () => { throw new DOMException('Unsupported'); } });
    expect(() => animateContentSurface(node)).not.toThrow();
    expect(node.style.transform).toBe('');
  });
  it('an active paper reveal owns entrance; local changes do not create a second reveal', () => {
    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    const get = vi.fn(() => [{ id: 'ag-paper-enter', playState: 'running' }]);
    Object.defineProperty(HTMLElement.prototype, 'getAnimations', { configurable: true, value: get });
    try {
      const opened = render(<LocalReading identity="shenyang"/>);
      opened.rerender(<LocalReading identity="tieling"/>);
      expect(animate).not.toHaveBeenCalled();
      get.mockReturnValue([]);
      opened.rerender(<LocalReading identity="dalian"/>);
      expect(animate).toHaveBeenCalledOnce();
    } finally { delete (HTMLElement.prototype as Partial<HTMLElement>).getAnimations; }
  });
  it('contains no opacity, filter or scaling keyframes', () => {
    const node = document.createElement('div'); const animate = vi.fn();
    Object.defineProperty(node, 'animate', { value: animate });
    animateContentSurface(node);
    const frames = animate.mock.calls[0][0] as Keyframe[];
    expect(frames.every(frame => !('opacity' in frame) && !('filter' in frame) && !String(frame.transform).includes('scale'))).toBe(true);
    expect(String(frames[0].transform)).toBe('translateY(0)');
    expect(String(frames.at(-1)!.transform)).toBe('translateY(0)');
    expect(String(frames[1].transform)).toBe('translateY(-2px)');
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
  it('continues rapid content selection from its visible position before canceling the old effect', () => {
    const calls: { frames: Keyframe[] }[] = [];
    const cancel = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: vi.fn((frames: Keyframe[]) => { calls.push({ frames }); return { cancel }; }) });
    const opened = render(<LocalReading identity="A1"/>);
    opened.rerender(<LocalReading identity="A2"/>);
    (opened.container.firstChild as HTMLElement).style.transform = 'matrix(1, 0, 0, 1, 0, -1)';
    opened.rerender(<LocalReading identity="A3"/>);
    expect(calls[1].frames[0].transform).toBe('matrix(1, 0, 0, 1, 0, -1)');
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('cancels a live effect when motion preference changes and resumes for the next allowed selection', () => {
    let listener: (() => void) | undefined;
    const remove = vi.fn();
    const media = { matches: false, addEventListener: vi.fn((_type, callback) => { listener = callback; }), removeEventListener: remove };
    vi.stubGlobal('matchMedia', () => media);
    const cancel = vi.fn(), animate = vi.fn(() => ({ cancel }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    const opened = render(<LocalReading identity="A1"/>);
    opened.rerender(<LocalReading identity="A2"/>);
    expect(animate).toHaveBeenCalledOnce();
    media.matches = true; listener!();
    expect(cancel).toHaveBeenCalledOnce();
    opened.rerender(<LocalReading identity="A3"/>);
    expect(animate).toHaveBeenCalledOnce();
    media.matches = false; listener!();
    opened.rerender(<LocalReading identity="A4"/>);
    expect(animate).toHaveBeenCalledTimes(2);
    opened.unmount();
    expect(remove).toHaveBeenCalledWith('change', listener);
    expect(cancel).toHaveBeenCalledTimes(2);
  });
});
