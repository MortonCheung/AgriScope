// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DiscreteHorizonSlider } from './DiscreteHorizonSlider';
afterEach(cleanup);
describe('supported horizon nodes',()=>{
  it('keeps an unselected horizon explicit and maps each index to a registered day',()=>{
    const change=vi.fn();const {rerender}=render(<DiscreteHorizonSlider label="期限" nodes={[7,14,30]} value={null} onChange={change}/>);
    const slider=screen.getByRole('slider',{name:'期限'});
    expect(slider.getAttribute('aria-valuetext')).toBe('尚未选择期限');
    fireEvent.keyDown(slider,{key:'Home'});expect(change).toHaveBeenLastCalledWith(7);
    fireEvent.change(slider,{target:{value:'1'}});expect(change).toHaveBeenLastCalledWith(14);
    rerender(<DiscreteHorizonSlider label="期限" nodes={[30,60,90,120,150,180]} value={180} onChange={change}/>);
    expect(slider.getAttribute('aria-valuetext')).toBe('180 天');expect(slider.getAttribute('max')).toBe('5');
    fireEvent.change(slider,{target:{value:'3'}});expect(change).toHaveBeenLastCalledWith(120);
  });
  it('cannot issue a selection before capability nodes exist',()=>{
    const change=vi.fn();render(<DiscreteHorizonSlider label="期限" nodes={[]} value={null} onChange={change}/>);
    const slider=screen.getByRole('slider');expect(slider.hasAttribute('disabled')).toBe(true);
    fireEvent.change(slider,{target:{value:'0'}});expect(change).not.toHaveBeenCalled();
  });
});
