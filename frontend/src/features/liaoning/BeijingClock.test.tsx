// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BeijingClock } from './BeijingClock';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-14T02:32:07Z')); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('独立纸张实时时钟', () => {
  it('显示北京MM-DD HH:mm:ss，不建立每秒播报区域', () => {
    const { container } = render(<BeijingClock/>);
    expect(screen.getByText('10-14 10:32:07')).toBeTruthy();
    expect(screen.getByLabelText('北京时间').getAttribute('aria-live')).toBe('off');
    expect(container.querySelector('time')?.dateTime).toBe('2026-10-14T02:32:07.000Z');
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.querySelector('.flip-value')).toBeNull();
  });
  it('每秒读取真实浏览器时钟，跨分钟与跨日期正确', () => {
    vi.setSystemTime(new Date('2026-10-14T15:59:58Z'));
    render(<BeijingClock/>);
    expect(screen.getByText('10-14 23:59:58')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1000)); expect(screen.getByText('10-14 23:59:59')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1000)); expect(screen.getByText('10-15 00:00:00')).toBeTruthy();
  });
  it('隐藏时暂停，恢复可见与焦点时马上同步，不显示加载时刻', () => {
    let visibility: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    render(<BeijingClock/>); expect(vi.getTimerCount()).toBe(1);
    visibility = 'hidden'; act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(new Date('2026-10-15T03:01:09Z'));
    act(() => window.dispatchEvent(new Event('focus')));
    expect(screen.getByText('10-14 10:32:07')).toBeTruthy();
    visibility = 'visible'; act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(screen.getByText('10-15 11:01:09')).toBeTruthy(); expect(vi.getTimerCount()).toBe(1);
    vi.setSystemTime(new Date('2026-10-15T03:04:22Z'));
    act(() => window.dispatchEvent(new Event('focus')));
    expect(screen.getByText('10-15 11:04:22')).toBeTruthy();
  });
  it('秒变化仅重新渲染时钟，不渲染父区域或地图，也不请求API', () => {
    const parentRender = vi.fn(), mapRender = vi.fn(), fetchSpy = vi.spyOn(globalThis, 'fetch');
    function Map() { mapRender(); return <div>地图</div>; }
    function Ticket() { parentRender(); return <><BeijingClock/><Map/></>; }
    render(<Ticket/>); act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('10-14 10:32:12')).toBeTruthy();
    expect(parentRender).toHaveBeenCalledOnce(); expect(mapRender).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('重复挂载卸载清理定时器和恢复监听', () => {
    const removeDocument = vi.spyOn(document, 'removeEventListener'), removeWindow = vi.spyOn(window, 'removeEventListener');
    for (let i = 0; i < 4; i++) {
      const { unmount } = render(<BeijingClock/>); expect(vi.getTimerCount()).toBe(1);
      unmount(); expect(vi.getTimerCount()).toBe(0);
    }
    expect(removeDocument.mock.calls.filter(call => call[0] === 'visibilitychange')).toHaveLength(4);
    expect(removeWindow.mock.calls.filter(call => call[0] === 'focus')).toHaveLength(4);
    act(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    expect(vi.getTimerCount()).toBe(0);
  });
});
