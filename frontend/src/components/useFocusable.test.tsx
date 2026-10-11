// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFocusable } from './useFocusable';
function Figure() { const focus=useFocusable(true);return <button onClick={focus.toggle} aria-expanded={focus.expanded}>图表</button>; }
afterEach(cleanup);
describe('figure focus owns local Escape',()=>{
 it('closes an expanded figure before an already registered parent navigation listener',()=>{
  const navigate=vi.fn();
  const parent=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented)navigate();};
  window.addEventListener('keydown',parent);
  render(<Figure/>);const button=screen.getByRole('button');
  fireEvent.click(button);expect(button.getAttribute('aria-expanded')).toBe('true');
  fireEvent.keyDown(window,{key:'Escape',cancelable:true});
  expect(button.getAttribute('aria-expanded')).toBe('false');expect(navigate).not.toHaveBeenCalled();
  fireEvent.keyDown(window,{key:'Escape',cancelable:true});expect(navigate).toHaveBeenCalledOnce();
  window.removeEventListener('keydown',parent);
 });
 it('removes the capture listener on unmount, leaving later Escape available to the page',()=>{
  const rendered=render(<Figure/>);fireEvent.click(screen.getByRole('button'));rendered.unmount();
  const parent=vi.fn();window.addEventListener('keydown',parent);
  const event=new KeyboardEvent('keydown',{key:'Escape',cancelable:true});
  window.dispatchEvent(event);expect(event.defaultPrevented).toBe(false);expect(parent).toHaveBeenCalledOnce();
  window.removeEventListener('keydown',parent);
 });
});
