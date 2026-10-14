// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SelectionGroup } from './SelectionGroup';

vi.mock('motion/react', async importOriginal => ({ ...await importOriginal<typeof import('motion/react')>(), useReducedMotion: () => true }));
const observers: { disconnect: ReturnType<typeof vi.fn> }[] = [];
beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal('ResizeObserver', class {
    disconnect = vi.fn(); observe = vi.fn(); unobserve = vi.fn();
    constructor() { observers.push(this); }
  });
  // jsdom has no layout. These explicit button rectangles exercise local ownership,
  // not animation timing; continuous movement is checked in the real browser.
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.hasAttribute('data-selection-value') ? 80 : 0; });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.hasAttribute('data-selection-value') ? 44 : 0; });
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (this: HTMLElement) { return this.dataset.selectionValue === 'b' ? 104 : 0; });
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockReturnValue(0);
  vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) { return this.closest('[data-selection-group]'); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('keeps one noninteractive surface and native selection updates through repeated changes', async () => {
  const change = vi.fn();
  function Harness() {
    const [value, setValue] = useState('a');
    return <SelectionGroup value={value}>{['a', 'b'].map(id => <button key={id} data-selection-value={id} aria-pressed={value === id} onClick={() => { change(id); setValue(id); }}>{id}</button>)}</SelectionGroup>;
  }
  const { container, unmount } = render(<Harness/>);
  const surface = container.querySelector('.selection-group__surface');
  expect(surface?.getAttribute('aria-hidden')).toBe('true');
  expect(surface?.hasAttribute('tabindex')).toBe(false);
  for (const id of ['b', 'a', 'b']) {
    fireEvent.click(screen.getByRole('button', { name: id }));
    expect(change).toHaveBeenLastCalledWith(id);
    expect(screen.getByRole('button', { name: id }).getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelectorAll('.selection-group__surface')).toHaveLength(1);
    expect(container.querySelector('.selection-group__surface')).toBe(surface);
  }
  await waitFor(() => expect((surface as HTMLElement).style.transform).toContain('104px'));
  unmount();
  expect(observers.every(observer => observer.disconnect.mock.calls.length > 0)).toBe(true);
});

it('uses legal list decoration and never borrows a nested group selection', () => {
  const { container } = render(<SelectionGroup as="ul" value="b">
    <li><button data-selection-value="a">outer</button></li>
    <li><SelectionGroup value="b"><button data-selection-value="b">inner</button></SelectionGroup></li>
  </SelectionGroup>);
  const outer = container.firstElementChild!;
  expect([...outer.children].every(element => element.tagName === 'LI')).toBe(true);
  expect([...outer.children].some(element => element.classList.contains('selection-group__surface'))).toBe(false);
  expect(container.querySelectorAll('.selection-group__surface')).toHaveLength(1);
});

it.each(['disabled', 'inert', 'aria-hidden'] as const)('hides selection when the target is %s', kind => {
  const { container } = render(<SelectionGroup value="a"><div inert={kind === 'inert'} aria-hidden={kind === 'aria-hidden' || undefined}>
    <button disabled={kind === 'disabled'} data-selection-value="a">unavailable</button>
  </div></SelectionGroup>);
  expect(container.querySelector('.selection-group__surface')).toBeNull();
});
