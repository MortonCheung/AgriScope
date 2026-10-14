// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WorkbenchLayout, WorkbenchMain, WorkbenchRail } from './WorkbenchLayout';
const preferences = vi.hoisted(() => ({ reduced: false }));
vi.mock('motion/react', async original => ({ ...await original<typeof import('motion/react')>(), useReducedMotion: () => preferences.reduced }));
afterEach(() => { cleanup(); preferences.reduced = false; vi.restoreAllMocks(); });
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
  it('twenty content changes preserve the host and do not fade the reading or results columns', () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    const animate = vi.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => ({ cancel: vi.fn() }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    try {
      const workspace = (key: string) => <WorkbenchLayout resetKey={key} contentKey={key} sidebarLabel="章节" railLabel="依据" sidebar={() => <p>目录</p>}><WorkbenchMain>{key}正文</WorkbenchMain><WorkbenchRail>{key}来源</WorkbenchRail></WorkbenchLayout>;
      const opened = render(workspace('first'));
      const selectors = ['.workbench__paper', '.workbench__sidebar', '.workbench__column', '.workbench__rail'];
      const nodes = selectors.map(selector => opened.container.querySelector(selector));
      for (let index = 0; index < 20; index++) {
        opened.rerender(workspace(`research-${index}`));
        selectors.forEach((selector, position) => expect(opened.container.querySelector(selector)).toBe(nodes[position]));
      }
      expect(animate).toHaveBeenCalledTimes(20);
      for (const [frames, options] of animate.mock.calls) {
        expect(options.id).toBe('ag-content-switch');
        expect(frames.every((frame: Keyframe) => !('opacity' in frame) && !('filter' in frame))).toBe(true);
      }
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, 'animate', descriptor);
      else delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    }
  });
  it('explicit article and mode identity moves only live content, preserves the source and never replays for unchanged input', () => {
    const cancel = vi.fn();
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    const animate = vi.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => ({ cancel }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    try {
    const workspace = (identity: string, input: string) => <WorkbenchLayout resetKey="shenyang" contentKey="shenyang" sidebarLabel="文章" railLabel="依据" sidebar={() => <p>稳定目录</p>}>
      <WorkbenchMain contentKey={identity}>{input}</WorkbenchMain>
      <WorkbenchRail><section>当前结论</section><section className="data-source-links">来源</section></WorkbenchRail>
    </WorkbenchLayout>;
    const opened = render(workspace('A1.3:interactive', '条件1'));
    const paper = opened.container.querySelector('.workbench__paper');
    const source = opened.container.querySelector('.data-source-links');
    expect(animate).not.toHaveBeenCalled();
    opened.rerender(workspace('A1.4:interactive', '条件1'));
    expect(animate).toHaveBeenCalledTimes(2);
    opened.rerender(workspace('A1.4:interactive', '条件2'));
    expect(animate).toHaveBeenCalledTimes(2); expect(cancel).not.toHaveBeenCalled();
    opened.rerender(workspace('A1.4:article', '条件2'));
    expect(animate).toHaveBeenCalledTimes(4); expect(cancel).toHaveBeenCalledTimes(2);
    expect(opened.container.querySelector('.workbench__paper')).toBe(paper);
    expect(opened.container.querySelector('.data-source-links')).toBe(source);
    preferences.reduced = true;
    opened.rerender(workspace('A2:interactive', '条件2'));
    expect(animate).toHaveBeenCalledTimes(4); expect(cancel).toHaveBeenCalledTimes(4);
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, 'animate', descriptor);
      else delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    }
  });
  it('keeps input controls and reading chrome outside local content effects through repeated crop selections', () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    const targets: HTMLElement[] = [];
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: function(this: HTMLElement) { targets.push(this); return { cancel: vi.fn() }; } });
    try {
      const view = (crop: string) => <WorkbenchLayout resetKey="shenyang" contentKey="shenyang" sidebarLabel="城市" railLabel="结果" sidebar={() => <p>城市索引</p>}>
        <WorkbenchMain contentKey={crop} contentMotion={false} toolbar={<button>稳定工具栏</button>}><form><button>黄瓜</button><input aria-label="面积" defaultValue="10"/></form></WorkbenchMain>
        <WorkbenchRail><section className="planning-result">{crop}结果</section><section className="data-source-links">来源</section></WorkbenchRail>
      </WorkbenchLayout>;
      const opened = render(view('黄瓜'));
      const paper = opened.container.querySelector('.workbench__paper');
      const input = screen.getByRole('textbox', { name: '面积' });
      const toolbar = screen.getByRole('button', { name: '稳定工具栏' });
      for (let index = 0; index < 20; index++) {
        opened.rerender(view(index % 2 ? '黄瓜' : '甘蓝'));
        expect(opened.container.querySelector('.workbench__paper')).toBe(paper);
        expect(screen.getByRole('textbox', { name: '面积' })).toBe(input);
        expect(screen.getByRole('button', { name: '稳定工具栏' })).toBe(toolbar);
      }
      expect(targets).toHaveLength(0);
      expect(opened.container.querySelector('.workbench__stage')?.getAttribute('style')).toBeNull();
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, 'animate', descriptor);
      else delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    }
  });
});
