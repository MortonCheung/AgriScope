// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DataTable } from './DataTable';
import type { V2Table } from '../../domain/research/v2/types';
const table = (file: string, crops=['黄瓜','大豆']):V2Table => ({file,columns:['crop','beta'],rows:crops.map((crop,index)=>({crop,beta:String(index+1)}))});
afterEach(cleanup);
describe('research source table filters preserve rows and recover across resources',()=>{
  it('selects source values and restores all rows without a native select',()=>{
    const {container}=render(<DataTable table={table('A01.csv')} filterColumn="crop"/>);
    expect(container.querySelector('select')).toBeNull();
    fireEvent.click(screen.getByRole('combobox')); fireEvent.click(screen.getByRole('option',{name:'黄瓜'}));
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2);
    expect(within(screen.getByRole('table')).queryByText('大豆')).toBeNull();
    fireEvent.click(screen.getByRole('combobox'));fireEvent.click(screen.getByRole('option',{name:'全部'}));
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3);
  });
  it('resets a filter for a different file and does not revive an invalid old value',()=>{
    const {rerender}=render(<DataTable table={table('A01.csv')} filterColumn="crop"/>);
    fireEvent.click(screen.getByRole('combobox'));fireEvent.click(screen.getByRole('option',{name:'黄瓜'}));
    rerender(<DataTable table={table('A02.csv')} filterColumn="crop"/>);
    expect(screen.getByRole('combobox').textContent).toContain('全部');
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3);
    fireEvent.click(screen.getByRole('combobox'));fireEvent.click(screen.getByRole('option',{name:'黄瓜'}));
    rerender(<DataTable table={table('A02.csv',['玉米','大豆'])} filterColumn="crop"/>);
    expect(screen.getByRole('combobox').textContent).toContain('全部');
    rerender(<DataTable table={table('A02.csv')} filterColumn="crop"/>);
    expect(screen.getByRole('combobox').textContent).toContain('全部');
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3);
  });
});
