// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { changesPaper, paperPageKey, withPaperExit } from './paperNavigation';
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('统一纸张导航', () => {
  it('输入和城市上下文变化保留展开状态；报告视图保留同纸', () => {
    expect(changesPaper('/liaoning', '/liaoning?city=dalian')).toBe(false);
    expect(changesPaper('/cities/shenyang/decision?crop=黄瓜', '/cities/shenyang/decision?crop=甘蓝')).toBe(false);
    expect(changesPaper('/reports', '/reports?view=cross_city')).toBe(false);
    expect(changesPaper('/reports?view=cross_city', '/reports?view=synthesis')).toBe(false);
    expect(changesPaper('/reports/shenyang', '/cities/shenyang/decision')).toBe(true);
    expect(changesPaper('/cities/shenyang/decision', '/cities/dalian/decision')).toBe(false);
    expect(changesPaper('/reports', '/reports/dalian')).toBe(false);
    expect(paperPageKey('/reports','?city=dandong')).toBe('/reports');
  });
  it('无动画API与减少动态时导航立即完成', () => {
    vi.stubGlobal('matchMedia', () => ({matches:true}));
    const commit = vi.fn();
    withPaperExit('/reports', '/about', commit);
    expect(commit).toHaveBeenCalledOnce();
  });
  it('旧浏览器先反向收纸；快速新导航取消过期目的地', async () => {
    vi.stubGlobal('matchMedia', () => ({matches:false}));
    document.body.innerHTML = '<div class="route-page"><main data-paper-surface></main></div>';
    let finish!: () => void;
    const finished = new Promise<void>(resolve => { finish = resolve; });
    const cancel = vi.fn(() => finish());
    const animate = vi.fn(() => ({finished, cancel}));
    Object.defineProperty(document.querySelector('main'), 'animate', {value:animate});
    const old = vi.fn(), latest = vi.fn();
    const pending = withPaperExit('/reports', '/about', old);
    expect(animate.mock.calls[0]).toBeDefined();
    const current = withPaperExit('/reports', '/cities/dandong/decision', latest);
    finish(); await pending; await current;
    expect(old).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalled();
  });
});
