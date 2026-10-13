// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectorRow } from './Selectors';
afterEach(cleanup);
describe('research selectors keep actual source dimensions and values',()=>{
  it('uses a shared combobox for many values in source order without inventing options',()=>{
    const change=vi.fn();
    const rows=['玉米','黄瓜','土豆','甘蓝','西红柿','玉米'].map(crop=>({crop}));
    const {container}=render(<SelectorRow rows={rows} selectors={['crop']} selected={{crop:'黄瓜'}} onChange={change}/>);
    expect(container.querySelector('select')).toBeNull();
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getAllByRole('option').map(option=>option.textContent?.replace('✓',''))).toEqual(['玉米','黄瓜','土豆','甘蓝','西红柿']);
    fireEvent.click(screen.getByRole('option',{name:'土豆'}));
    expect(change).toHaveBeenCalledWith('crop','土豆');
  });
  it('retains compact buttons for small real dimensions and makes no absent filter',()=>{
    const change=vi.fn();
    render(<SelectorRow rows={[{crop:'黄瓜'},{crop:'土豆'}]} selectors={['crop']} selected={{crop:'黄瓜'}} onChange={change}/>);
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'土豆'})); expect(change).toHaveBeenCalledWith('crop','土豆');
    expect(screen.getByRole('button',{name:'黄瓜'}).getAttribute('aria-pressed')).toBe('true');
  });
});
