// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WorkbenchLayout, WorkbenchMain, WorkbenchRail } from './WorkbenchLayout';
afterEach(cleanup);
const view = (module: string, onEscape = vi.fn()) => <WorkbenchLayout resetKey="shenyang" sidebarLabel="目录" railLabel="当前结果" onEscape={onEscape} sidebar={close => <button onClick={close}>选择模块</button>}><WorkbenchMain><h1>{module}</h1></WorkbenchMain><WorkbenchRail>{module}结果</WorkbenchRail></WorkbenchLayout>;
describe('共享工作台的稳定边界与局部面板', () => {
  it('keeps paper/sidebar DOM while replacing module slots, with exactly three columns', () => {
    const rendered = render(view('经营计划'));
    const paper = rendered.container.querySelector('.workbench__paper'); const sidebar = rendered.container.querySelector('.workbench__sidebar');
    rendered.rerender(view('市场观察'));
    expect(rendered.container.querySelector('.workbench__paper')).toBe(paper);
    expect(rendered.container.querySelector('.workbench__sidebar')).toBe(sidebar);
    expect(rendered.container.querySelectorAll('.workbench__body > aside, .workbench__body > section')).toHaveLength(3);
  });
  it('escapes local drawer then result collapse before invoking page parent, returning keyboard focus', () => {
    const onEscape = vi.fn(); render(view('经营计划', onEscape));
    const drawer = screen.getByRole('button', { name: '目录' }); const rail = screen.getByRole('button', { name: '当前结果' });
    fireEvent.click(drawer); expect(document.activeElement).toBe(screen.getByRole('complementary', { name: '目录' }));
    fireEvent.keyDown(window, { key: 'Escape' }); expect(document.activeElement).toBe(drawer); expect(onEscape).not.toHaveBeenCalled();
    fireEvent.click(rail); fireEvent.keyDown(window, { key: 'Escape' }); expect(document.activeElement).toBe(rail); expect(onEscape).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' }); expect(onEscape).toHaveBeenCalledOnce();
  });
  it('leaves modal Escape to the local evidence dialog', () => {
    const onEscape = vi.fn(); render(<>{view('经营计划', onEscape)}<div role="dialog" aria-modal="true" /></>);
    fireEvent.keyDown(window, { key: 'Escape' }); expect(onEscape).not.toHaveBeenCalled();
  });
});
