// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { AppHeader } from './AppHeader';
import { AppHistoryProvider, APP_HISTORY_STORAGE_KEY } from './appHistory';
import { resetAppContext, useAppContext } from './context/appContext';
import { useContextUrlSync } from './context/useContextUrl';

function Page() {
  useContextUrlSync();
  const location = useLocation();
  const navigate = useNavigate();
  return <><AppHeader/><output data-testid="location" data-key={location.key}>{location.pathname}{location.search}</output>
    <button onClick={() => navigate('/liaoning?city=dandong')}>选择丹东</button>
    <button onClick={() => navigate('/cities/shenyang/research/A2.2')}>沈阳研究点</button></>;
}
const open = (entry: string | { pathname: string; search: string; key: string } = '/') => render(<MemoryRouter initialEntries={[entry]}><AppHistoryProvider><Page/></AppHistoryProvider></MemoryRouter>);
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
beforeEach(() => { window.sessionStorage.clear(); resetAppContext(); vi.stubGlobal('matchMedia', () => ({ matches: false })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Header和历史控件生命周期', () => {
  it('正式报告仍将报告标为当前任务，链接直达统一六城入口', () => {
    open('/reports/dandong');
    const report = screen.getByRole('link', { name: '报告' });
    expect(report.getAttribute('aria-current')).toBe('page');
    expect(report.getAttribute('href')).toContain('/reports?city=dandong');
    expect(screen.getByRole('link', { name: '主页' }).getAttribute('aria-current')).toBeNull();
  });
  it('开场即显示品牌、四入口和三个禁用/可用图标，没有入场隐藏', () => {
    const { container } = open();
    const header = container.querySelector('header')!;
    expect(header.hasAttribute('inert')).toBe(false);
    expect(header.hasAttribute('data-concealed')).toBe(false);
    expect(header.style.opacity).toBe('');
    expect(screen.getByRole('link', { name: 'AgriScope' }).getAttribute('href')).toBe('/liaoning');
    expect([...screen.getByRole('navigation', { name: '主导航' }).querySelectorAll('a')].map(link => link.textContent)).toEqual(['主页', '决策', '报告', '关于']);
    expect(['后退', '前进', '上一级'].map(name => button(name).disabled)).toEqual([true, true, true]);
  });

  it('跨任务保持同一组三图标，后退/前进不等待折纸，上一级回选城地图', () => {
    open('/liaoning');
    const arrows = ['后退', '前进', '上一级'].map(name => button(name));
    act(() => { useAppContext.getState().setCrop('玉米'); useAppContext.getState().setHorizon(30); useAppContext.getState().setAsOf('2026-10-06'); });
    fireEvent.click(button('选择丹东'));
    fireEvent.click(screen.getByRole('link', { name: '决策' }));
    expect(screen.getByTestId('location').textContent).toContain('/cities/dandong/decision?');
    expect(screen.getByTestId('location').textContent).toContain('horizon=30');
    expect(['后退', '前进', '上一级'].map(name => button(name))).toEqual(arrows);
    fireEvent.click(button('后退'));
    expect(screen.getByTestId('location').textContent).toBe('/liaoning?city=dandong');
    fireEvent.click(button('前进'));
    expect(screen.getByTestId('location').textContent).toContain('/cities/dandong/decision?');
    fireEvent.click(button('上一级'));
    expect(screen.getByTestId('location').textContent).toBe('/liaoning?city=dandong');
    expect(button('前进').disabled).toBe(true);
    fireEvent.click(button('上一级'));
    expect(screen.getByTestId('location').textContent).toBe('/liaoning');
    expect(button('上一级').disabled).toBe(true);
  });

  it('刷新当前已观察key恢复应用内历史，陌生key重新禁用后退', () => {
    open('/liaoning');
    fireEvent.click(button('选择丹东'));
    fireEvent.click(screen.getByRole('link', { name: '决策' }));
    const node = screen.getByTestId('location');
    const url = new URL(node.textContent!, 'http://localhost');
    const current = { pathname: url.pathname, search: url.search, key: node.dataset.key! };
    const saved = window.sessionStorage.getItem(APP_HISTORY_STORAGE_KEY);
    cleanup();
    open(current);
    expect(button('后退').disabled).toBe(false);
    cleanup();
    window.sessionStorage.setItem(APP_HISTORY_STORAGE_KEY, saved!);
    open({ ...current, key: 'unobserved' });
    expect(button('后退').disabled).toBe(true);
  });

  it('菜单消费Escape且恢复焦点，页面不会同时返回', () => {
    open('/cities/shenyang/research/A2.2');
    const toggle = button('菜单');
    let pageEscapes = 0;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) pageEscapes++; };
    window.addEventListener('keydown', onKey);
    fireEvent.click(toggle);
    fireEvent.keyDown(toggle, { key: 'Escape', cancelable: true });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
    expect(pageEscapes).toBe(0);
    expect(screen.getByTestId('location').textContent).toBe('/cities/shenyang/research/A2.2');
    fireEvent.keyDown(toggle, { key: 'Escape', cancelable: true });
    expect(pageEscapes).toBe(1);
    window.removeEventListener('keydown', onKey);
  });
});


describe('ordinary Up does not restart Opening', () => {
  it.each(['/reports', '/about', '/scenario-lab', '/decision', '/research'])('%s goes to normal province home', path => {
    open(path);
    fireEvent.click(button('上一级'));
    expect(screen.getByTestId('location').textContent).toBe('/liaoning');
    expect(button('上一级').disabled).toBe(true);
  });
});
