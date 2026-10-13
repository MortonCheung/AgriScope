import { useLayoutEffect, useRef, useState } from 'react';

/** Promote the existing chart to the browser's top layer; never mount another chart. */
export function useChartFocus() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const normalHeight = useRef(0);
  const modal = useRef(false);
  const restoreFocus = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const canExpand = typeof HTMLDialogElement !== 'undefined'
    && typeof HTMLDialogElement.prototype.showModal === 'function';

  const open = () => {
    if (!canExpand || expanded) return;
    normalHeight.current = dialogRef.current?.getBoundingClientRect().height ?? 0;
    restoreFocus.current = true;
    setExpanded(true);
  };
  const close = () => setExpanded(false);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !canExpand) return;
    if (expanded) {
      // A normal open dialog must be closed before showModal can promote it.
      // Both operations are synchronous, and React retains every descendant.
      dialog.close();
      try {
        dialog.showModal();
        modal.current = true;
        closeRef.current?.focus({ preventScroll: true });
      } catch {
        dialog.show();
        modal.current = false;
        setExpanded(false);
      }
    } else {
      if (modal.current) {
        dialog.close();
        dialog.show();
        modal.current = false;
      }
      if (restoreFocus.current) {
        restoreFocus.current = false;
        triggerRef.current?.focus({ preventScroll: true });
      }
    }
  }, [canExpand, expanded]);

  useLayoutEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [expanded]);

  return { dialogRef, triggerRef, closeRef, expanded, canExpand, open, close,
    placeholderHeight: expanded ? normalHeight.current : undefined };
}
