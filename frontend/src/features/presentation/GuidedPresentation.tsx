import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useReducedMotion } from 'motion/react';
import { usePageNavigate } from '../../app/pageNavigation';
import { PRESENTATION_STEPS, clampStep, stepDwellMs } from './steps';
import './guided-presentation.css';

/** 聚焦高亮只加这一个类，退出 / 换步时移除，保证不残留。 */
const HIGHLIGHT_CLASS = 'ag-guide-highlight';
/** 目标元素可能随懒加载路由晚到；只做有上限的轮询，不做无限定时器。 */
const ANCHOR_MAX_ATTEMPTS = 40;
const ANCHOR_POLL_MS = 120;

/**
 * 演示导览模式（规范 §42）。
 *
 * 一个可开关的右下角入口：
 *   · 开启 → 从第一步开始，自动导航到目标路由、滚动并高亮目标、播报旁白；
 *   · 播放 → 按旁白长度自动前进到下一步；暂停停止计时；
 *   · 键盘可达：Tab 走控件、Enter 触发、Escape 退出；
 *   · `aria-live` 播报步骤；`prefers-reduced-motion` 下只滚动到位、不做入场动画。
 *
 * 边界（不破坏既有交互）：
 *   · 面板是右下角浮层，**没有全屏遮罩**，页面其它功能照常可用；
 *   · 退出只做两件事——关闭面板、移除高亮；不强制跳回上一页；
 *   · Escape 用捕获阶段处理，导览开启时先退出导览，不再触发城市退出。
 */
export function GuidedPresentation() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const location = useLocation();
  const navigate = usePageNavigate();
  const reducedMotion = Boolean(useReducedMotion());

  const step = PRESENTATION_STEPS[index];
  const lastIndex = PRESENTATION_STEPS.length - 1;

  const highlighted = useRef<HTMLElement | null>(null);
  const navigatedStepId = useRef<string | null>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  const clearHighlight = useCallback(() => {
    highlighted.current?.classList.remove(HIGHLIGHT_CLASS);
    highlighted.current = null;
  }, []);

  const start = useCallback(() => {
    setIndex(0);
    setPaused(false);
    setOpen(true);
  }, []);

  const exit = useCallback(() => {
    setOpen(false);
  }, []);

  const next = useCallback(() => {
    setIndex((current) => {
      if (current >= lastIndex) {
        setOpen(false);
        return current;
      }
      return current + 1;
    });
  }, [lastIndex]);

  /** 只按步骤推进导航一次；用户手动离开时不反复拉回（不和生产交互打架）。 */
  useEffect(() => {
    if (!open) {
      navigatedStepId.current = null;
      return;
    }
    if (navigatedStepId.current === step.id) return;
    navigatedStepId.current = step.id;
    navigate(step.to);
  }, [open, step.id, step.to, navigate]);

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

  /** 自动前进：读完旁白前进一步；最后一步不再自动走。 */
  useEffect(() => {
    if (!open || paused || index >= lastIndex) return;
    const timer = window.setTimeout(() => setIndex(clampStep(index + 1)), stepDwellMs(step));
    return () => window.clearTimeout(timer);
  }, [open, paused, index, lastIndex, step]);

  /** Escape 退出：捕获阶段，优先于城市退出等既有 Escape 语义。 */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  /** 开启后把焦点交给主操作（Enter 即可下一步）；关闭后停在原处，不强制回焦。 */
  useEffect(() => {
    if (!open) return;
    primaryRef.current?.focus({ preventScroll: true });
  }, [open, index]);

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
            <button type="button" className="ag-button" onClick={() => setIndex(clampStep(index - 1))} disabled={index === 0}>
              上一步
            </button>
            <button type="button" className="ag-button ag-button--primary" ref={primaryRef} onClick={next}>
              {index >= lastIndex ? '结束' : '下一步'}
            </button>
            <button type="button" className="ag-button" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>
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