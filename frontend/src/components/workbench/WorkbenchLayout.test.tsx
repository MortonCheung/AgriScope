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
  it('opens responsive evidence, closes on its backdrop and restores keyboard focus without replacing the paper', () => {
    const { container } = render(<WorkbenchLayout resetKey="report" sidebarLabel="章节" railLabel="报告依据" railMode="responsive" sidebar={() => null}><WorkbenchMain><h1>报告</h1></WorkbenchMain><WorkbenchRail>真实来源</WorkbenchRail></WorkbenchLayout>);
    const paper = container.querySelector('.workbench__paper');
    const toggle = screen.getByRole('button', { name: '报告依据' });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('complementary', { name: '报告依据' }));
    fireEvent.click(container.querySelector('.workbench__backdrop')!);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
    expect(container.querySelector('.workbench__paper')).toBe(paper);
  });
  it('keeps the same rail DOM when its visibility mode changes and hides irrelevant controls', () => {
    const workspace = (railMode: 'hidden' | 'responsive' | 'persistent') => <WorkbenchLayout resetKey="same" railMode={railMode} sidebarLabel="章节" railLabel="依据" sidebar={() => null}><WorkbenchMain>内容</WorkbenchMain><WorkbenchRail>来源</WorkbenchRail></WorkbenchLayout>;
    const opened = render(workspace('hidden'));
    const rail = opened.container.querySelector('.workbench__rail');
    expect(screen.queryByRole('button', { name: '依据' })).toBeNull();
    expect(rail?.getAttribute('aria-hidden')).toBe('true');
    opened.rerender(workspace('responsive'));
    expect(opened.container.querySelector('.workbench__rail')).toBe(rail);
    expect(screen.getByRole('button', { name: '依据' })).toBeTruthy();
    opened.rerender(workspace('persistent'));
    expect(opened.container.querySelector('main')?.getAttribute('data-rail-mode')).toBe('persistent');
  });
});
