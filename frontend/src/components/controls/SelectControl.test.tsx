// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectControl, type SelectControlProps } from './SelectControl';

const options = [
  { value: 'cucumber', label: '黄瓜' },
  { value: 'disabled', label: '不可选', disabled: true },
  { value: 'soy', label: '大豆' },
  { value: 'corn', label: '玉米' },
];
function Harness({ onChange = vi.fn(), ...props }: Partial<SelectControlProps>) {
  const [value, setValue] = useState(props.value ?? 'cucumber');
  return <SelectControl label="作物" value={value} options={options} {...props}
    onChange={next => { setValue(next); onChange(next); }}/>;
}
const activeText = () => document.getElementById(screen.getByRole('combobox').getAttribute('aria-activedescendant') ?? '')?.textContent;
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('shared paper select is keyboard, touch and clipping safe', () => {
  it('renders one labeled tab stop and opens the list outside its paper container', () => {
    const { container } = render(<Harness/>);
    const button = screen.getByRole('combobox', { name: '作物' });
    expect(container.querySelector('select')).toBeNull();
    button.focus(); fireEvent.click(button);
    const list = screen.getByRole('listbox', { name: '作物' });
    expect(container.contains(list)).toBe(false);
    expect(list.parentElement).toBe(document.body);
    expect(button.getAttribute('aria-controls')).toBe(list.id);
    expect(activeText()).toContain('黄瓜');
    fireEvent.click(screen.getByRole('option', { name: '大豆' }));
    expect(button.textContent).toContain('大豆');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(button);
  });
  it('moves without changing the value until confirmation and skips disabled options', () => {
    const change = vi.fn(); render(<Harness onChange={change}/>);
    const button = screen.getByRole('combobox'); button.focus();
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    expect(activeText()).toBe('大豆'); expect(change).not.toHaveBeenCalled();
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(change).toHaveBeenLastCalledWith('soy'); expect(button.textContent).toContain('大豆');
    fireEvent.keyDown(button, { key: 'ArrowUp' });
    fireEvent.keyDown(button, { key: 'Home' }); expect(activeText()).toBe('黄瓜');
    fireEvent.keyDown(button, { key: 'End' }); expect(activeText()).toBe('玉米');
    fireEvent.keyDown(button, { key: ' ' }); expect(change).toHaveBeenLastCalledWith('corn');
  });
  it('consumes Escape before the workbench parent action and restores focus', () => {
    render(<Harness/>); const button = screen.getByRole('combobox'); button.focus(); fireEvent.click(button);
    const parent = vi.fn(); window.addEventListener('keydown', parent);
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(parent).not.toHaveBeenCalled(); expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(button);
    fireEvent.keyDown(button, { key: 'Escape' }); expect(parent).toHaveBeenCalledOnce();
    window.removeEventListener('keydown', parent);
  });
  it('closes for Tab and outside pointer actions without preventing the new target focus', () => {
    render(<><Harness/><button type="button">其他操作</button></>);
    const button = screen.getByRole('combobox'); button.focus(); fireEvent.click(button);
    expect(fireEvent.keyDown(button, { key: 'Tab' })).toBe(true);
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(button); const other = screen.getByRole('button', { name: '其他操作' });
    other.focus(); fireEvent.pointerDown(other);
    expect(screen.queryByRole('listbox')).toBeNull(); expect(document.activeElement).toBe(other);
  });
  it('supports Chinese, Latin typeahead and repeated-character cycling', () => {
    render(<Harness options={[{value:'soy',label:'大豆'},{value:'dalian',label:'大连'},{value:'a',label:'Apple'},{value:'b',label:'Banana'}]}/>);
    const button = screen.getByRole('combobox');
    fireEvent.keyDown(button, { key: '大' }); expect(activeText()).toBe('大豆');
    fireEvent.keyDown(button, { key: '大' }); expect(activeText()).toBe('大连');
    fireEvent.keyDown(button, { key: 'Enter' }); expect(button.textContent).toContain('大连');
    fireEvent.keyDown(button, { key: 'a' }); expect(activeText()).toBe('Apple');
    fireEvent.keyDown(button, { key: 'Enter' }); expect(button.textContent).toContain('Apple');
    fireEvent.compositionEnd(button, { data: '大连' }); expect(activeText()).toBe('大连');
  });
  it('allows the empty all-value, ignores disabled clicks and adapts to changing options safely', () => {
    const change = vi.fn(); const props = { label: '品种', value: 'corn', options, onChange: change };
    const { rerender } = render(<SelectControl {...props}/>);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: '不可选' })); expect(change).not.toHaveBeenCalled();
    rerender(<SelectControl {...props} options={[{value:'',label:'全部'},{value:'carrot',label:'胡萝卜'}]}/>);
    expect(activeText()).toBe('全部');
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' }); expect(change).toHaveBeenLastCalledWith('');
    rerender(<SelectControl {...props} value="carrot" options={[{value:'carrot',label:'胡萝卜'}]}/>);
    expect(screen.getByRole('combobox').textContent).toContain('胡萝卜');
  });
  it('keeps a chart dialog menu in the same top layer and closes only the menu on Escape', () => {
    const cancel = vi.fn();
    const { container } = render(<dialog open aria-modal="true" onCancel={cancel}><Harness/></dialog>);
    const button = screen.getByRole('combobox'); button.focus(); fireEvent.click(button);
    const dialog = container.querySelector('dialog')!;
    expect(dialog.contains(screen.getByRole('listbox'))).toBe(true);
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull(); expect(dialog.open).toBe(true);
    expect(cancel).not.toHaveBeenCalled(); expect(document.activeElement).toBe(button);
  });
  it('synchronizes an externally changed value while a popup is open', () => {
    const props = { label:'作物', value:'cucumber', options, onChange:vi.fn() };
    const { rerender } = render(<SelectControl {...props}/>);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    expect(activeText()).toBe('大豆');
    rerender(<SelectControl {...props} value="corn"/>);
    expect(activeText()).toContain('玉米');
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(props.onChange).toHaveBeenCalledWith('corn');
  });
  it('never opens disabled or empty controls and closes when all options disappear', () => {
    const props = { label:'作物', value:'cucumber', options, onChange:vi.fn() };
    const { rerender } = render(<SelectControl {...props} disabled/>);
    expect(screen.getByRole('combobox').hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('combobox')); expect(screen.queryByRole('listbox')).toBeNull();
    rerender(<SelectControl {...props}/>); fireEvent.click(screen.getByRole('combobox'));
    rerender(<SelectControl {...props} options={[]}/>);
    expect(screen.queryByRole('listbox')).toBeNull(); expect(screen.getByRole('combobox').hasAttribute('disabled')).toBe(true);
  });
  it('places a portal above a near-bottom mobile trigger and keeps it inside viewport bounds', () => {
    vi.stubGlobal('innerWidth',390); vi.stubGlobal('innerHeight',844);
    render(<Harness/>);
    const button = screen.getByRole('combobox');
    vi.spyOn(button,'getBoundingClientRect').mockReturnValue({left:310,top:760,right:382,bottom:804,width:72,height:44,x:310,y:760,toJSON:()=>({})});
    fireEvent.click(button);
    const popup = screen.getByRole('listbox') as HTMLElement;
    expect(parseFloat(popup.style.left)).toBe(202);
    expect(parseFloat(popup.style.width)).toBe(180);
    expect(parseFloat(popup.style.bottom)).toBe(90);
    expect(parseFloat(popup.style.maxHeight)).toBe(320);
    act(()=>window.dispatchEvent(new Event('resize')));
    expect(parseFloat(popup.style.left)+parseFloat(popup.style.width)).toBeLessThanOrEqual(382);
  });
  it('cleans popup scroll, resize, Escape and ResizeObserver handlers after repeated use', () => {
    const add = vi.spyOn(window,'addEventListener'); const remove = vi.spyOn(window,'removeEventListener');
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver',class { observe=vi.fn(); disconnect=disconnect; });
    const { unmount } = render(<Harness/>);
    const button = screen.getByRole('combobox');
    for(let i=0;i<20;i++){fireEvent.click(button);fireEvent.keyDown(button,{key:'Escape'});}
    for(const event of ['resize','scroll','keydown']) {
      const attached = add.mock.calls.filter(call=>call[0]===event);
      const detached = remove.mock.calls.filter(call=>call[0]===event);
      expect(detached).toHaveLength(attached.length);
      for(const entry of attached) expect(detached.some(call=>call[1]===entry[1]&&call[2]===entry[2])).toBe(true);
    }
    expect(disconnect).toHaveBeenCalledTimes(20);
    fireEvent.click(button); unmount(); expect(disconnect).toHaveBeenCalledTimes(21);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });
});
