// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePaperSelection } from './usePaperSelection';
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('稳定纸面内容切换', () => {
  it('旧内容先退出；快速选择只提交最新城市，并最终停止动画', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ city }) => usePaperSelection(city, false), { initialProps: { city: null as string | null } });
    rerender({ city: 'shenyang' });
    expect(result.current).toEqual({ displayedCityId: null, phase: 'out' });
    act(() => vi.advanceTimersByTime(70));
    rerender({ city: 'dandong' });
    act(() => vi.advanceTimersByTime(110));
    expect(result.current).toEqual({ displayedCityId: 'dandong', phase: 'in' });
    act(() => vi.advanceTimersByTime(180));
    expect(result.current).toEqual({ displayedCityId: 'dandong', phase: 'idle' });
  });
  it('取消选择能接管退出过程；卸载不遗留回调', () => {
    vi.useFakeTimers();
    const { result, rerender, unmount } = renderHook(({ city }) => usePaperSelection(city, false), { initialProps: { city: 'shenyang' as string | null } });
    rerender({ city: 'dalian' });
    act(() => vi.advanceTimersByTime(50));
    rerender({ city: 'shenyang' });
    expect(result.current).toEqual({ displayedCityId: 'shenyang', phase: 'idle' });
    expect(vi.getTimerCount()).toBe(0);
    rerender({ city: null });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('减少动效在选择首帧立即返回新对象', () => {
    const { result, rerender } = renderHook(({ city }) => usePaperSelection(city, true), { initialProps: { city: null as string | null } });
    rerender({ city: 'chaoyang' });
    expect(result.current).toEqual({ displayedCityId: 'chaoyang', phase: 'idle' });
  });
});
