// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { acknowledgePaperCommit, cancelPendingPaperNavigation, changesPaper, configurePaperPreparation, handlePaperPopstate, paperPageKey, paperGeometry, withPaperExit, PAPER_OPEN, PAPER_CLOSED, PAPER_NAVIGATION_EVENT, type PaperNavigationDetail } from './paperNavigation';
import { MOTION_DURATION } from '../design/motion';

afterEach(() => { cancelPendingPaperNavigation(); configurePaperPreparation(); document.body.innerHTML = ''; vi.unstubAllGlobals(); vi.restoreAllMocks(); delete (document as Partial<Document>).startViewTransition; });
function surface() {
  document.body.innerHTML = '<div class="route-page"><main data-paper-surface></main></div>';
  const effects: { finish: () => void; cancel: ReturnType<typeof vi.fn>; finished: Promise<void> }[] = [];
  const animate = vi.fn(() => {
    let finish!: () => void, reject!: (reason: unknown) => void;
    const finished = new Promise<void>((resolve, fail) => { finish = resolve; reject = fail; });
    const effect = { finished, finish, cancel: vi.fn(() => reject(new DOMException('Canceled', 'AbortError'))) }; effects.push(effect); return effect;
  });
  Object.defineProperty(document.querySelector('main'), 'animate', { value: animate });
  return { animate, effects };
}
describe('single paper navigation', () => {
  it('a newer target immediately takes over a closed lazy exit and old DOM acknowledgements cannot release it', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { animate, effects } = surface(); const page = document.querySelector<HTMLElement>('.route-page')!;
    page.dataset.paperRouteKey = 'source';
    let finishOld!: () => void; const oldLazy = new Promise<void>(resolve => { finishOld = resolve; });
    const oldCommit = vi.fn(() => oldLazy), latestCommit = vi.fn();
    const first = withPaperExit('/reports/shenyang', '/about', oldCommit);
    effects[0].finish(); await Promise.resolve(); await Promise.resolve();
    expect(oldCommit).toHaveBeenCalledOnce();
    const latest = withPaperExit('/reports/shenyang', '/cities/shenyang/decision', latestCommit);
    expect(latestCommit).toHaveBeenCalledOnce(); expect(animate).toHaveBeenCalledOnce();
    expect(effects[0].cancel).not.toHaveBeenCalled();
    page.dataset.paperRouteKey = 'older-about'; acknowledgePaperCommit(page, 'older-about', '/about');
    expect(effects[0].cancel).not.toHaveBeenCalled();
    page.dataset.paperRouteKey = 'latest-decision'; acknowledgePaperCommit(page, 'latest-decision', '/cities/shenyang/decision');
    finishOld(); await first; await latest;
    expect(effects[0].cancel).toHaveBeenCalledOnce();
  });
  it('multiple already submitted targets cannot release the newest DOM owner, and real POP still releases the held exit', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { effects } = surface(); const page = document.querySelector<HTMLElement>('.route-page')!; page.dataset.paperRouteKey = 'source';
    let finishOld!: () => void; const lazy = new Promise<void>(resolve => { finishOld = resolve; });
    const first = withPaperExit('/reports/shenyang', '/about', () => lazy);
    effects[0].finish(); await Promise.resolve(); await Promise.resolve();
    const second = withPaperExit('/reports/shenyang', '/cities/shenyang/decision', vi.fn());
    const latest = withPaperExit('/reports/shenyang', '/liaoning', vi.fn());
    page.dataset.paperRouteKey = 'old-about'; acknowledgePaperCommit(page, 'old-about', '/about');
    page.dataset.paperRouteKey = 'old-decision'; acknowledgePaperCommit(page, 'old-decision', '/cities/shenyang/decision');
    expect(effects[0].cancel).not.toHaveBeenCalled();
    handlePaperPopstate('/reports/dalian'); finishOld(); await first; await second; await latest;
    expect(effects[0].cancel).toHaveBeenCalledOnce();
  });
  it('a failed replacement lazy load releases the transferred closed effect', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { effects } = surface();
    let finishOld!: () => void; const first = withPaperExit('/reports/shenyang', '/about', () => new Promise<void>(resolve => { finishOld = resolve; }));
    effects[0].finish(); await Promise.resolve(); await Promise.resolve();
    const latest = withPaperExit('/reports/shenyang', '/cities/shenyang/decision', () => Promise.reject(new Error('latest chunk failed')));
    await expect(latest).rejects.toThrow('latest chunk failed'); finishOld(); await first;
    expect(effects[0].cancel).toHaveBeenCalledOnce();
  });
  it('prepares the destination and announces camera intent during retraction, then cancels stale targets', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { effects } = surface(); const prepare = vi.fn(); configurePaperPreparation(prepare);
    const events: PaperNavigationDetail[] = [];
    const listener = (event: Event) => events.push((event as CustomEvent<PaperNavigationDetail>).detail);
    window.addEventListener(PAPER_NAVIGATION_EVENT, listener);
    try {
      const stale = vi.fn(), latest = vi.fn();
      const first = withPaperExit('/reports/shenyang', '/about', stale);
      expect(prepare).toHaveBeenCalledOnce(); expect(events[0].phase).toBe('start');
      expect(stale).not.toHaveBeenCalled();
      const second = withPaperExit('/reports/shenyang', '/cities/shenyang/decision', latest, 'back');
      expect(events.map(event => event.phase)).toEqual(['start', 'cancel', 'start']);
      expect(events[1].id).toBe(events[0].id); expect(events[2].id).not.toBe(events[0].id);
      effects[1].finish(); await first; await second;
      expect(stale).not.toHaveBeenCalled(); expect(latest).toHaveBeenCalledOnce();
      expect(events.map(event => event.phase)).toEqual(['start', 'cancel', 'start', 'finish']);
      expect(events[3].id).toBe(events[2].id);
    } finally { window.removeEventListener(PAPER_NAVIGATION_EVENT, listener); }
  });
  it('long and scrolled papers retract over the visible band without changing their layout', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false })); vi.stubGlobal('innerHeight', 900);
    const { animate, effects } = surface(); const paper = document.querySelector<HTMLElement>('main')!;
    vi.spyOn(paper, 'getBoundingClientRect').mockReturnValue({ top: -3000, height: 12000, bottom: 9000 } as DOMRect);
    expect(paperGeometry(paper)).toEqual({ open: 'polygon(0 3000px, 100% 3000px, 100% 3900px, 0 3900px)', closed: 'polygon(0 3000px, 100% 3000px, 100% 3001px, 0 3001px)' });
    const pending = withPaperExit('/about', '/reports/shenyang', vi.fn());
    expect((animate.mock.calls[0] as unknown as [Keyframe[]])[0]).toEqual([{ clipPath: paperGeometry(paper).open }, { clipPath: paperGeometry(paper).closed }]);
    expect(paper.style.height).toBe(''); expect(paper.style.transform).toBe('');
    effects[0].finish(); await pending;
  });
  it('normal sheets retain their full geometry, while long first screens unfold from their top edge', () => {
    const paper = document.createElement('main'); vi.stubGlobal('innerHeight', 900);
    const box = vi.spyOn(paper, 'getBoundingClientRect');
    box.mockReturnValue({ top: 100, height: 766, bottom: 866 } as DOMRect);
    expect(paperGeometry(paper)).toEqual({ open: PAPER_OPEN, closed: PAPER_CLOSED });
    box.mockReturnValue({ top: 100, height: 12000, bottom: 12100 } as DOMRect);
    expect(paperGeometry(paper)).toEqual({ open: 'polygon(0 0px, 100% 0px, 100% 800px, 0 800px)', closed: 'polygon(0 0px, 100% 0px, 100% 1px, 0 1px)' });
  });
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
  it('a replacement target starts from the interrupted closed geometry instead of reopening old content', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { animate, effects } = surface(); const old = vi.fn(), latest = vi.fn();
    const pending = withPaperExit('/reports', '/about', old);
    document.querySelector<HTMLElement>('main')!.style.clipPath = PAPER_CLOSED;
    const current = withPaperExit('/reports', '/cities/dandong/decision', latest);
    expect((animate.mock.calls[1] as unknown as [Keyframe[], KeyframeAnimationOptions])[0][0].clipPath).toBe(PAPER_CLOSED);
    effects[1].finish(); await pending; await current;
    expect(old).not.toHaveBeenCalled(); expect(latest).toHaveBeenCalledOnce();
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
  it('twenty clicks on the same pending target share one exit and one commit', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { animate, effects } = surface(); const first = vi.fn(), duplicate = vi.fn();
    const pending = withPaperExit('/reports', '/liaoning', first);
    for (let count = 0; count < 20; count++) expect(withPaperExit('/reports', '/liaoning', duplicate)).toBe(pending);
    expect(animate).toHaveBeenCalledOnce(); expect(effects[0].cancel).not.toHaveBeenCalled();
    effects[0].finish(); await pending;
    expect(first).toHaveBeenCalledOnce(); expect(duplicate).not.toHaveBeenCalled();
  });
  it('keeps that identity while Router is awaiting a lazy commit', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { animate, effects } = surface(); let finishCommit!: () => void;
    const lazy = new Promise<void>(resolve => { finishCommit = resolve; }); const commit = vi.fn(() => lazy);
    const pending = withPaperExit('/reports', '/about', commit);
    effects[0].finish(); await Promise.resolve(); await Promise.resolve();
    expect(commit).toHaveBeenCalledOnce();
    expect(withPaperExit('/reports', '/about', vi.fn())).toBe(pending); expect(animate).toHaveBeenCalledOnce();
    finishCommit(); await pending;
    expect(effects[0].cancel).toHaveBeenCalledOnce();
  });
  it('a void POP commit keeps the connected source closed until its real DOM owner confirms the new key', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { animate, effects } = surface(); const page = document.querySelector<HTMLElement>('.route-page')!;
    page.dataset.paperRouteKey = 'source';
    const commit = vi.fn(); const pending = withPaperExit('/reports', '/liaoning', commit, 'back');
    effects[0].finish(); await Promise.resolve(); await Promise.resolve();
    expect(commit).toHaveBeenCalledOnce(); expect(effects[0].cancel).not.toHaveBeenCalled();
    expect(page.isConnected).toBe(true);
    for (let count = 0; count < 20; count++) expect(withPaperExit('/reports', '/liaoning', vi.fn(), 'back')).toBe(pending);
    handlePaperPopstate('/liaoning');
    expect(animate).toHaveBeenCalledOnce(); expect(effects[0].cancel).not.toHaveBeenCalled();
    acknowledgePaperCommit(page, 'source'); expect(effects[0].cancel).not.toHaveBeenCalled();
    page.dataset.paperRouteKey = 'destination'; acknowledgePaperCommit(page, 'destination');
    await pending; expect(effects[0].cancel).toHaveBeenCalledOnce();
  });
  it('unrelated browser POP interrupts even after the old exit has submitted its navigation', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { effects } = surface(); document.querySelector<HTMLElement>('.route-page')!.dataset.paperRouteKey = 'source';
    const pending = withPaperExit('/reports', '/liaoning', vi.fn(), 'back');
    effects[0].finish(); await Promise.resolve(); await Promise.resolve();
    handlePaperPopstate('/about'); await pending;
    expect(effects[0].cancel).toHaveBeenCalledOnce();
  });
  it('a canceled finished Promise cannot be mistaken for a completed exit', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { effects } = surface(); const commit = vi.fn();
    const pending = withPaperExit('/reports', '/about', commit);
    effects[0].cancel(); await pending;
    expect(commit).not.toHaveBeenCalled();
    const retry = withPaperExit('/reports', '/about', commit); effects[1].finish(); await retry;
    expect(commit).toHaveBeenCalledOnce();
  });
  it('one rejected ticket among multiple surfaces invalidates the whole old destination', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { animate, effects } = surface();
    const second = document.createElement('aside'); second.setAttribute('data-paper-surface', '');
    Object.defineProperty(second, 'animate', { value: animate }); document.querySelector('.route-page')!.appendChild(second);
    const commit = vi.fn(); const pending = withPaperExit('/liaoning', '/reports', commit);
    effects[0].finish(); effects[1].cancel(); await pending;
    expect(commit).not.toHaveBeenCalled();
  });
  it('a failed lazy commit releases the intent so another navigation remains possible', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { effects } = surface();
    const pending = withPaperExit('/reports', '/about', () => Promise.reject(new Error('chunk failed')));
    const rejected = expect(pending).rejects.toThrow('chunk failed'); effects[0].finish(); await rejected;
    expect(effects[0].cancel).toHaveBeenCalled();
    const commit = vi.fn(); const retry = withPaperExit('/reports', '/liaoning', commit); effects[1].finish(); await retry;
    expect(commit).toHaveBeenCalledOnce();
  });
  it('unsupported animation construction degrades to immediate functional navigation', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    document.body.innerHTML = '<div class="route-page"><main data-paper-surface></main></div>';
    Object.defineProperty(document.querySelector('main'), 'animate', { value: () => { throw new DOMException('Unsupported'); } });
    const commit = vi.fn(); withPaperExit('/reports', '/about', commit); expect(commit).toHaveBeenCalledOnce();
  });
  it('paper geometry never fades or scales text', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { animate, effects } = surface(); const pending = withPaperExit('/reports', '/about', vi.fn());
    const [frames, options] = animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions];
    expect(frames).toEqual([{ clipPath: PAPER_OPEN }, { clipPath: PAPER_CLOSED }]);
    expect(frames.every(frame => !('opacity' in frame) && !('transform' in frame))).toBe(true);
    expect(String(frames[0].clipPath).split(',')).toHaveLength(4); expect(String(frames[1].clipPath).split(',')).toHaveLength(4);
    expect(options.duration).toBe(MOTION_DURATION.paperExit * 1000); effects[0].finish(); await pending;
  });
  it('history and structural intents with the same URL keep their different navigation semantics', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { effects } = surface(); const back = vi.fn(), up = vi.fn();
    const old = withPaperExit('/reports/shenyang', '/liaoning', back, 'back');
    const next = withPaperExit('/reports/shenyang', '/liaoning', up, 'push');
    effects[1].finish(); await old; await next;
    expect(back).not.toHaveBeenCalled(); expect(up).toHaveBeenCalledOnce();
  });
});
