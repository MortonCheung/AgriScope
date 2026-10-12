import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import './workbench.css';
import '../../design/paper-motion.css';

const RailContext = createContext<{ id: string; label: string; hidden: boolean }>({ id: '', label: '当前信息', hidden: false });

export interface WorkbenchLayoutProps {
  sidebar: (close: () => void) => ReactNode;
  sidebarLabel: string;
  railLabel: string;
  children: ReactNode;
  className?: string;
  mode?: string;
  resetKey: string;
  contentKey?: string;
  onEscape?: () => void;
  mainRef?: Ref<HTMLElement>;
  railMode?: 'persistent' | 'responsive' | 'hidden';
}

/** 稳定纸面只承载布局；业务组件在自己的状态作用域内输出 Main / Rail 两个 slot。 */
export function WorkbenchLayout({ sidebar, sidebarLabel, railLabel, children, className = '', mode, resetKey, contentKey, onEscape, mainRef, railMode = 'responsive' }: WorkbenchLayoutProps) {
  const id = useId();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const drawerToggle = useRef<HTMLButtonElement>(null);
  const railToggle = useRef<HTMLButtonElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const closeDrawer = () => { setDrawerOpen(false); if (drawerOpen) drawerToggle.current?.focus(); };
  const closeRail = () => { setRailOpen(false); if (railOpen) railToggle.current?.focus(); };

  useEffect(() => { setDrawerOpen(false); setRailOpen(false); }, [resetKey]);
  useEffect(() => { if (railMode !== 'responsive') setRailOpen(false); }, [railMode]);
  useEffect(() => { if (drawerOpen) sidebarRef.current?.focus(); }, [drawerOpen]);
  useEffect(() => { if (railOpen) paper.current?.querySelector<HTMLElement>('.workbench__rail')?.focus(); }, [railOpen]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (drawerOpen) { event.preventDefault(); setDrawerOpen(false); drawerToggle.current?.focus(); }
      else if (railOpen) { event.preventDefault(); setRailOpen(false); railToggle.current?.focus(); }
      else if (onEscape) { event.preventDefault(); onEscape(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen, onEscape, railOpen]);

  return <main className={`workbench ${className}`} data-mode={mode} data-content-key={contentKey} data-rail-mode={railMode} ref={mainRef}>
    <div className="workbench__paper city-research__paper" data-paper-surface ref={paper}>
      <header className="workbench__chrome city-research__chrome">
        <div className="workbench__actions">
          <button type="button" className="workbench__toggle workbench__drawer-toggle" aria-expanded={drawerOpen} aria-controls={`${id}-sidebar`} ref={drawerToggle} onClick={() => { if (drawerOpen) closeDrawer(); else { setRailOpen(false); setDrawerOpen(true); } }}>{sidebarLabel}</button>
          <button type="button" className="workbench__toggle workbench__rail-toggle" hidden={railMode !== 'responsive'} aria-expanded={railOpen} aria-controls={`${id}-rail`} ref={railToggle} onClick={() => { if (railOpen) closeRail(); else { setDrawerOpen(false); setRailOpen(true); } }}>{railLabel}</button>
        </div>
      </header>
      <RailContext.Provider value={{ id: `${id}-rail`, label: railLabel, hidden: railMode === 'hidden' }}>
        <div className="workbench__body city-research__body" data-layout="workbench" data-rail-open={railOpen || undefined}>
          <div className="workbench__backdrop city-research__drawer-backdrop" data-open={drawerOpen || undefined} data-rail-open={railOpen || undefined} onClick={() => { closeDrawer(); closeRail(); }} aria-hidden />
          <aside id={`${id}-sidebar`} className="workbench__sidebar city-research__sidebar" aria-label={sidebarLabel} data-drawer-open={drawerOpen || undefined} tabIndex={-1} ref={sidebarRef}>{sidebar(closeDrawer)}</aside>
          {children}
        </div>
      </RailContext.Provider>
    </div>
  </main>;
}

export function WorkbenchMain({ children, toolbar, className = '', label }: { children: ReactNode; toolbar?: ReactNode; className?: string; label?: string }) {
  return <section className={`workbench__column city-research__column ${className}`} aria-label={label}>
    {toolbar}
    <div className="workbench__stage city-research__stage">{children}</div>
  </section>;
}

export function WorkbenchRail({ children, className = '' }: { children: ReactNode; className?: string }) {
  const rail = useContext(RailContext);
  return <aside id={rail.id || undefined} className={`workbench__rail city-research__evidence ${className}`} aria-label={rail.label} aria-hidden={rail.hidden || undefined} tabIndex={-1}>{children}</aside>;
}
