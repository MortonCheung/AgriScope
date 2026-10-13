import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import './select-control.css';

export interface SelectControlProps {
  label: string;
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

type PopupPosition = { left: number; width: number; maxHeight: number; top?: number; bottom?: number };

/** One tab stop, real source options, and a portal that paper clipping cannot cut off. */
export function SelectControl({ label, value, options, onChange, disabled = false, className = '' }: SelectControlProps) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLUListElement>(null);
  const search = useRef({ text: '', time: 0 });
  const [open, setOpen] = useState(false);
  const [activeValue, setActiveValue] = useState<string | null>(null);
  const [position, setPosition] = useState<PopupPosition | null>(null);
  const available = options.filter(option => !option.disabled);
  const selected = options.find(option => option.value === value);
  const inactive = disabled || available.length === 0;
  const active = available.find(option => option.value === activeValue)
    ?? available.find(option => option.value === value) ?? available[0];
  const expanded = open && !inactive;
  const optionId = (index: number) => `${id}-option-${index}`;
  const close = (restoreFocus = false) => {
    setOpen(false);
    search.current = { text: '', time: 0 };
    if (restoreFocus) button.current?.focus();
  };
  const choose = (next: string) => {
    if (!available.some(option => option.value === next)) return;
    onChange(next);
    close(true);
  };
  const show = (fromEnd = false) => {
    if (inactive) return;
    setActiveValue(available.find(option => option.value === value)?.value
      ?? (fromEnd ? available.at(-1)?.value : available[0]?.value) ?? null);
    search.current = { text: '', time: 0 };
    setOpen(true);
  };
  const move = (step: number) => {
    const index = available.findIndex(option => option.value === active?.value);
    setActiveValue(available[(index + step + available.length) % available.length]?.value ?? null);
  };
  const typeahead = (input: string) => {
    if (!input || inactive) return;
    const now = Date.now();
    const letter = input.toLocaleLowerCase('zh-CN');
    const previous = now - search.current.time < 700 ? search.current.text : '';
    const repeated = previous && [...previous].every(character => character === letter);
    const text = repeated ? letter : previous + letter;
    search.current = { text, time: now };
    const start = expanded ? available.findIndex(option => option.value === active?.value) : -1;
    const ordered = [...available.slice(start + 1), ...available.slice(0, start + 1)];
    const match = ordered.find(option => option.label.toLocaleLowerCase('zh-CN').startsWith(text))
      ?? ordered.find(option => option.label.toLocaleLowerCase('zh-CN').startsWith(letter));
    if (match) { setActiveValue(match.value); setOpen(true); }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (inactive || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    if (event.key === 'Tab') { close(); return; }
    if (event.key === 'Escape') {
      if (expanded) { event.preventDefault(); event.stopPropagation(); close(true); }
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!expanded) show(event.key === 'ArrowUp'); else move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault(); setOpen(true);
      setActiveValue((event.key === 'Home' ? available[0] : available.at(-1))?.value ?? null);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!expanded) show(); else if (active) choose(active.value);
    } else if (event.key.length === 1) {
      event.preventDefault(); typeahead(event.key);
    }
  };

  useEffect(() => { if (inactive) setOpen(false); }, [inactive]);
  useEffect(() => {
    setActiveValue(value);
  }, [value]);
  useLayoutEffect(() => {
    if (!expanded) return;
    const measure = () => {
      const rect = button.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const gutter = 8, gap = 6;
      const width = Math.min(Math.max(rect.width, 180), Math.max(0, viewportWidth - 2 * gutter));
      const left = Math.max(viewportLeft + gutter, Math.min(rect.left, viewportLeft + viewportWidth - width - gutter));
      const viewportBottom = viewportTop + viewportHeight - gutter;
      const belowAnchor = Math.max(viewportTop + gutter, Math.min(rect.bottom + gap, viewportBottom));
      const aboveAnchor = Math.max(viewportTop + gutter, Math.min(rect.top - gap, viewportBottom));
      const below = Math.max(0, viewportBottom - belowAnchor);
      const above = Math.max(0, aboveAnchor - viewportTop - gutter);
      const useAbove = below < 176 && above > below;
      setPosition({ left, width, maxHeight: Math.min(320, useAbove ? above : below),
        ...(useAbove ? { bottom: Math.max(gutter, window.innerHeight - aboveAnchor) } : { top: belowAnchor }) });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (button.current) observer?.observe(button.current);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [expanded]);
  useEffect(() => {
    if (!expanded) return;
    const onOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && !button.current?.contains(target) && !popup.current?.contains(target)) close();
    };
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault(); event.stopPropagation(); close(true);
    };
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('keydown', onEscape, true);
    return () => {
      document.removeEventListener('pointerdown', onOutside, true);
      window.removeEventListener('keydown', onEscape, true);
    };
  }, [expanded]);
  useEffect(() => {
    if (!expanded || !active) return;
    document.getElementById(optionId(options.findIndex(option => option.value === active.value)))?.scrollIntoView?.({ block: 'nearest' });
  }, [expanded, active?.value, options]);

  return <div className={`select-control ${className}`}>
    <span className="select-control__label" id={`${id}-label`}>{label}</span>
    <button ref={button} type="button" className="select-control__trigger" role="combobox"
      aria-labelledby={`${id}-label`} aria-describedby={`${id}-value`} aria-haspopup="listbox" aria-expanded={expanded}
      aria-controls={expanded ? `${id}-listbox` : undefined}
      aria-activedescendant={expanded && active ? optionId(options.findIndex(option => option.value === active.value)) : undefined}
      disabled={inactive} onKeyDown={onKeyDown} onCompositionEnd={event => typeahead(event.data)}
      onBlur={() => close()} onClick={() => expanded ? close() : show()}>
      <span id={`${id}-value`} className="select-control__value">{selected?.label ?? '请选择'}</span>
      <svg aria-hidden viewBox="0 0 12 12" width="12" height="12"><path d="m2 4 4 4 4-4"/></svg>
    </button>
    {expanded && typeof document !== 'undefined' && createPortal(<ul ref={popup} id={`${id}-listbox`}
      role="listbox" aria-labelledby={`${id}-label`} className="select-control__popup"
      style={position ?? { visibility: 'hidden' }}>
      {options.map((option, index) => <li key={option.value} id={optionId(index)} role="option"
        aria-selected={option.value === value} aria-disabled={option.disabled || undefined}
        data-active={option.value === active?.value || undefined}
        onMouseDown={event => event.preventDefault()}
        onPointerMove={() => { if (!option.disabled) setActiveValue(option.value); }}
        onClick={() => choose(option.value)}>{option.label}<span aria-hidden>{option.value === value ? '✓' : ''}</span></li>)}
    </ul>, button.current?.closest('dialog[aria-modal="true"]') ?? document.body)}
  </div>;
}
