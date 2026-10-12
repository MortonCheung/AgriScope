// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetAppContext, useAppContext } from '../../app/context/appContext';
import { useResearchSelectors } from './useResearchSelectors';

beforeEach(resetAppContext);
afterEach(cleanup);
const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;
describe('research dimensions follow the actual resource and applicable crop context', () => {
  it('resolves the product potato identity without rewriting source rows', () => {
    useAppContext.getState().setCrop('土豆');
    const rows = [{ crop: '黄瓜', window: '7' }, { crop: '马铃薯', window: '14' }];
    const { result } = renderHook(() => useResearchSelectors('shenyang:A2', rows, ['crop', 'window']), { wrapper });
    expect(result.current.selected).toEqual({ crop: '马铃薯', window: '7' });
    act(() => result.current.change('crop', '黄瓜'));
    expect(result.current.selected.crop).toBe('黄瓜');
    expect(useAppContext.getState().crop).toBe('黄瓜');
    expect(rows[1].crop).toBe('马铃薯');
  });
  it('uses a real default for an unsupported crop and resets stale conditions on city changes', () => {
    useAppContext.getState().setCrop('玉米');
    const { result, rerender } = renderHook(({ identity, rows }) => useResearchSelectors(identity, rows, ['crop', 'window']), {
      initialProps: { identity: 'jinzhou:A2', rows: [{ crop: '黄瓜', window: '7' }, { crop: '黄瓜', window: '14' }] },
      wrapper,
    });
    act(() => result.current.change('window', '14'));
    expect(result.current.selected).toEqual({ crop: '黄瓜', window: '14' });
    rerender({ identity: 'dalian:A2', rows: [{ crop: '白菜', window: '30' }] });
    expect(result.current.selected).toEqual({ crop: '白菜', window: '30' });
    expect(useAppContext.getState().crop).toBe('玉米');
  });
  it('does not invent a crop dimension and recovers valid defaults when a resource finishes loading', () => {
    useAppContext.getState().setCrop('玉米');
    const { result, rerender } = renderHook(({ rows }) => useResearchSelectors('tieling:A7', rows, ['year']), {
      initialProps: { rows: [] as Record<string, string>[] },
      wrapper,
    });
    rerender({ rows: [{ year: '2020' }, { year: '2021' }] });
    expect(result.current.selected).toEqual({ year: '2020' });
    act(() => result.current.change('year', '2021'));
    expect(result.current.selected).toEqual({ year: '2021' });
    expect(useAppContext.getState().crop).toBe('玉米');
  });
});
