import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useReducedMotion } from 'motion/react';
import { usePageNavigate } from '../../app/pageNavigation';
import { useAppContext, type ContextHorizon } from '../../app/context/appContext';
import { PRESENTATION_STEPS, clampStep, stepDwellMs } from './steps';
import './guided-presentation.css';

/** 聚焦高亮只加这一个类，退出 / 换步时移除，保证不残留。 */
const HIGHLIGHT_CLASS = 'ag-guide-highlight';
/** 目标元素可能随懒加载路由晚到；只做有上限的轮询，不做无限定时器。 */
const ANCHOR_MAX_ATTEMPTS = 40;
const ANCHOR_POLL_MS = 120;
/**
 * 「停稳」窗口：换步 / 开启后，先让路由与高亮落定，再允许自动前进与「下一步」。
 * 不是动画，而是给评委看清这一步的时间；`prefers-reduced-motion` 下压到最短。
 */
const SETTLE_MS = 700;
const SETTLE_MS_REDUCED = 200;

/** 进入导览前的现场：URL 与四要素 Context，退出时原样恢复。 */
interface EntrySnapshot {
  url: string;
  cityId: string;
  crop: string | null;
  horizon: ContextHorizon;
  asOf: string | null;
}

/**
 * 演示导览模式（规范 §42）。
 *
 * 一个可开关的右下角入口：
 *   · 开启 → 记录进入前的 URL 与四要素 Context，从第一步开始，自动导航、滚动、高亮、播报；
 *   · 停稳 → 换步后有一个短暂「停稳」窗口，停稳前不自动前进、也不接受「下一步」；
 *   · 播放 → 按旁白长度自动前进；暂停停止计时；
 *   · 键盘可达：Tab 走控件、Enter / Space 触发、← → 上一步 / 下一步、Space 暂停继续、Escape 退出；
 *   · `aria-live` 播报步骤；`prefers-reduced-motion` 下只滚动到位、不做入场动画。
 *
 * 边界（不破坏既有交互）：
 *   · 面板是右下角浮层，**没有全屏遮罩**，页面其它功能照常可用；
 *   · 退出会**恢复进入前的 URL 与 Context**（演示不应把评委留在演示路径上）；
 *   · Escape 用捕获阶段处理，导览开启时先退出导览，不再触发城市退出。
 */
export function GuidedPresentation() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const location = useLocation();
  const navigate = usePageNavigate();
  const reducedMotion = Boolean(useReducedMotion());

  const step = PRESENTATION_STEPS[index];
  const lastIndex = PRESENTATION_STEPS.length - 1;

  const highlighted = useRef<HTMLElement | null>(null);
  const navigatedIndex = useRef<number | null>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const entryRef = useRef<EntrySnapshot | null>(null);

  const clearHighlight = useCallback(() => {
    highlighted.current?.classList.remove(HIGHLIGHT_CLASS);
    highlighted.current = null;
  }, []);

  /** 记录进入前的现场（URL + 四要素）。 */
  const start = useCallback(() => {
    const ctx = useAppContext.getState();
    entryRef.current = {
      url: `${location.pathname}${location.search}`,
      cityId: ctx.cityId,
      crop: ctx.crop,
      horizon: ctx.horizon,
      asOf: ctx.asOf,
    };
    setIndex(0);
    setPaused(false);
    setOpen(true);
  }, [location.pathname, location.search]);

  /** 退出：关闭面板，并**恢复**进入前的 URL 与 Context（原样回到演示前）。 */
  const exit = useCallback(() => {
    setOpen(false);
    const entry = entryRef.current;
    entryRef.current = null;
    if (!entry) return;
    const ctx = useAppContext.getState();
    if (entry.cityId !== ctx.cityId) ctx.setCity(entry.cityId);
    if (entry.crop !== ctx.crop) ctx.setCrop(entry.crop);
    if (entry.horizon !== ctx.horizon) ctx.setHorizon(entry.horizon);
    if (entry.asOf !== ctx.asOf) ctx.setAsOf(entry.asOf);
    const current = `${location.pathname}${location.search}`;
    if (entry.url !== current) navigate(entry.url, { replace: true });
  }, [navigate, location.pathname, location.search]);

  const prev = useCallback(() => {
    setIndex((current) => clampStep(current - 1));
  }, []);

  const next = useCallback(() => {
    if (index >= lastIndex) { exit(); return; }
    if (!ready) return;
    setIndex((current) => clampStep(current + 1));
  }, [ready, index, lastIndex, exit]);

  const togglePause = useCallback(() => setPaused((value) => !value), []);

  /**
   * 每次「步序」变化（前进或后退）导航一次；用户手动离开当前步时不反复拉回
   * （不和生产交互打架）。按 **index** 记账而不是按 step.id，这样「上一步」回到
   * 已经去过的步骤时仍会真正导航回去。
   */
  useEffect(() => {
    if (!open) {
      navigatedIndex.current = null;
      return;
    }
    if (navigatedIndex.current === index) return;
    navigatedIndex.current = index;
    navigate(step.to);
  }, [open, index, step.to, navigate]);

  /** 自动聚焦：目标出现后滚动到视口中间并加高亮；换步 / 退出 / 目标缺失都清干净。 */
  useEffect(() => {
    if (!open || !step.anchor) return;
    let cancelled = false;
    let timer = 0;
    let attempts = 0;
    const selector = step.anchor;

    const tick = () => {
      if (cancelled) return;
      const element = document.querySelector<HTMLElement>(selector);
      if (element) {
        if (highlighted.current !== element) {
          clearHighlight();
          highlighted.current = element;
          element.classList.add(HIGHLIGHT_CLASS);
        }
        element.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
        return;
      }
      attempts += 1;
      if (attempts >= ANCHOR_MAX_ATTEMPTS) return;
      timer = window.setTimeout(tick, ANCHOR_POLL_MS);
    };

    tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      clearHighlight();
    };
  }, [open, step.id, step.anchor, location.pathname, reducedMotion, clearHighlight]);

  /** 停稳窗口：换步 / 开启后先落定，再允许自动前进与「下一步」。 */
  useEffect(() => {
    if (!open) { setReady(false); return; }
    setReady(false);
    const timer = window.setTimeout(() => setReady(true), reducedMotion ? SETTLE_MS_REDUCED : SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [open, index, reducedMotion]);

  /** 自动前进：停稳后读够旁白前进一步；最后一步不再自动走。 */
  useEffect(() => {
    if (!open || paused || !ready || index >= lastIndex) return;
    const timer = window.setTimeout(() => setIndex(clampStep(index + 1)), stepDwellMs(step));
    return () => window.clearTimeout(timer);
  }, [open, paused, ready, index, lastIndex, step]);

  /** 键盘：Escape 退出、← → 上一步 / 下一步、Space 暂停继续（捕获阶段，优先于页面语义）。 */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        exit();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        next();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        prev();
        return;
      }
      if (event.key === ' ' || event.key === 'Spacebar') {
        // 焦点在控件上时交给控件自身（Enter / Space 触发），避免与按钮重复触发。
        const target = event.target as HTMLElement | null;
        if (target instanceof Element && target.closest('button, a, input, select, textarea')) return;
        event.preventDefault();
        togglePause();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, exit, next, prev, togglePause]);

  /** 停稳后把焦点交给主操作（Enter 即可下一步）；关闭后停在原处，不强制回焦。 */
  useEffect(() => {
    if (!open || !ready) return;
    primaryRef.current?.focus({ preventScroll: true });
  }, [open, index, ready]);

  return (
    <div className="ag-guide" data-open={open || undefined}>
      {open ? (
        <section className="ag-guide__panel" role="region" aria-label="演示导览模式">
          <header className="ag-guide__head">
            <p className="ag-label">演示导览模式</p>
            <button type="button" className="ag-guide__exit ag-button ag-button--quiet" onClick={exit}>
              退出讲解
            </button>
          </header>

          <p className="ag-guide__counter">
            第 {index + 1} / {lastIndex + 1} 步 · {step.label}
          </p>
          <p className="ag-guide__narration" aria-live="polite" aria-atomic="true">
            {step.narration}
          </p>
          <p className="ag-guide__source">旁白来源：{step.source}</p>

          <div className="ag-guide__controls">
            <button
              type="button"
              className="ag-button"
              onClick={prev}
              disabled={index === 0}
            >
              上一步
            </button>
            <button
              type="button"
              className="ag-button ag-button--primary"
              ref={primaryRef}
              onClick={next}
              disabled={index < lastIndex && !ready}
            >
              {index >= lastIndex ? '结束' : '下一步'}
            </button>
            <button type="button" className="ag-button" aria-pressed={paused} onClick={togglePause}>
              {paused ? '继续' : '暂停'}
            </button>
            <button type="button" className="ag-button ag-button--quiet" onClick={exit}>
              退出
            </button>
          </div>
        </section>
      ) : (
        <button type="button" className="ag-guide__launcher ag-button" onClick={start} aria-label="开启演示导览模式">
          讲解模式
        </button>
      )}
    </div>
  );
}