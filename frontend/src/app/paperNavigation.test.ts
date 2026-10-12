// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cancelPendingPaperNavigation, changesPaper, paperPageKey, withPaperExit } from './paperNavigation';

afterEach(() => { cancelPendingPaperNavigation(); document.body.innerHTML = ''; vi.unstubAllGlobals(); vi.restoreAllMocks(); delete (document as Partial<Document>).startViewTransition; });
function surface() {
  document.body.innerHTML = '<div class="route-page"><main data-paper-surface></main></div>';
  const effects: { finish: () => void; cancel: ReturnType<typeof vi.fn>; finished: Promise<void> }[] = [];
  const animate = vi.fn(() => {
    let finish!: () => void;
    const finished = new Promise<void>(resolve => { finish = resolve; });
    const effect = { finished, finish, cancel: vi.fn(finish) }; effects.push(effect); return effect;
  });
  Object.defineProperty(document.querySelector('main'), 'animate', { value: animate });
  return { animate, effects };
}
describe('single paper navigation', () => {
  it('queries, scope and cities keep the same workbench paper', () => {
    expect(changesPaper('/liaoning', '/liaoning?city=dalian')).toBe(false);
    expect(changesPaper('/cities/shenyang/decision?crop=黄瓜', '/cities/shenyang/decision?crop=甘蓝')).toBe(false);
    expect(changesPaper('/reports', '/reports?view=cross_city')).toBe(false);
    expect(changesPaper('/reports?view=cross_city', '/reports?view=synthesis')).toBe(false);
    expect(changesPaper('/reports/shenyang', '/cities/shenyang/decision')).toBe(true);
    expect(changesPaper('/cities/shenyang/decision', '/cities/dalian/decision')).toBe(false);
    expect(changesPaper('/reports', '/reports/dalian')).toBe(false);
    expect(paperPageKey('/reports','?city=dandong')).toBe('/reports');
  });
  it('reduced motion and absent WAAPI commit immediately', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const commit = vi.fn();
    withPaperExit('/reports', '/about', commit);
    expect(commit).toHaveBeenCalledOnce();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    document.body.innerHTML = '<div class="route-page"><main data-paper-surface></main></div>';
    withPaperExit('/reports', '/about', commit);
    expect(commit).toHaveBeenCalledTimes(2);
  });
  it('native support does not skip the sole WAAPI exit', async () => {
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: vi.fn() });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { animate, effects } = surface(); const commit = vi.fn();
    const waiting = withPaperExit('/reports', '/about', commit);
    expect(animate).toHaveBeenCalledOnce(); expect(commit).not.toHaveBeenCalled();
    effects[0].finish(); await waiting;
    expect(commit).toHaveBeenCalledOnce(); expect(document.startViewTransition).not.toHaveBeenCalled();
    expect(effects[0].cancel).toHaveBeenCalledOnce();
  });
  it('rapid cross-page intents cancel the first destination and commit only the latest', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { effects } = surface(); const old = vi.fn(), latest = vi.fn();
    const pending = withPaperExit('/reports', '/about', old);
    const current = withPaperExit('/reports', '/cities/dandong/decision', latest);
    effects[1].finish(); await pending; await current;
    expect(old).not.toHaveBeenCalled(); expect(latest).toHaveBeenCalledOnce();
    expect(effects[0].cancel).toHaveBeenCalled();
  });
  it('an immediate same-workspace intent also invalidates a previous delayed target', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { animate } = surface(); const old = vi.fn(), latest = vi.fn();
    const pending = withPaperExit('/reports', '/about', old);
    withPaperExit('/reports', '/reports/shenyang', latest);
    await pending;
    expect(old).not.toHaveBeenCalled(); expect(latest).toHaveBeenCalledOnce();
    expect(animate).toHaveBeenCalledOnce();
  });
  it('retract cancels this owner’s unfinished reveal but leaves content effects alone', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { effects } = surface();
    const reveal = { id: 'ag-paper-enter', cancel: vi.fn() }, content = { id: '', cancel: vi.fn() };
    Object.defineProperty(document.querySelector('main'), 'getAnimations', { value: () => [reveal, content] });
    const waiting = withPaperExit('/reports', '/about', vi.fn());
    expect(reveal.cancel).toHaveBeenCalledOnce(); expect(content.cancel).not.toHaveBeenCalled();
    effects[0].finish(); await waiting;
  });
});
