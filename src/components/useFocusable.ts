import { useCallback, useEffect, useState } from 'react';

/**
 * 图表 Focus / 放大（V3 §26–§28）。
 *
 * 关键约束：不可以"点击后重新 mount 一份新图"（§27），否则当前作物 / Lag / 变量 / Hover 全部丢失。
 * 因此这里只让**当前 DOM 元素自己**进入 fixed focus 状态，交互状态完全保留。
 * 关闭方式：ESC、点击背景、点击 ×（§27）。
 * 语义分工（§57）：关闭临时 Overlay 用 ×，返回页面层级仍然用 ←。
 */
export function useFocusable(enableExpand: boolean) {
  const [expanded, setExpanded] = useState(false);
  const close = useCallback(() => setExpanded(false), []);
  const toggle = useCallback(() => {
    if (enableExpand) setExpanded((value) => !value);
  }, [enableExpand]);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close, expanded]);

  return { canExpand: enableExpand, expanded, toggle, close };
}
