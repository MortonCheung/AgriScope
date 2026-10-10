import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ROUTES } from './routes';
import { NAV_ITEMS } from './navItems';
import { AnimatedUnderline } from '../components/AnimatedUnderline';
import { NavigationControls } from '../components/NavigationControls';
import { useAppContext } from './context/appContext';
import { primaryNavigationTarget } from './context/navigationContext';
import './app-header.css';

/** Stable brand/history and four task entrances; narrow screens use the same ordered menu. */
export function AppHeader() {
  const location = useLocation();
  const { pathname, search } = location;
  const context = useAppContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuToggle = useRef<HTMLButtonElement>(null);

  // 路由变化（点了菜单里的入口、或其它导航）后收起菜单。
  useEffect(() => { setMenuOpen(false); }, [pathname, search]);

  // An open menu consumes Escape before a page can treat it as structural Up.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      setMenuOpen(false);
      menuToggle.current?.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [menuOpen]);

  return (
    <header
      className="ag-header"
      aria-label="全域导航"
      style={{ viewTransitionName: 'ag-header' }}
    >
      <div className="ag-header__inner">
        <div className="ag-header__lead">
          {/*
            品牌：仓库与设计参考里都没有用户指定的正式 Logo，
            因此**不渲染空的占位方块**，只写 AGRISCOPE；有真实 Logo 再插进去。
          */}
          <NavLink to={ROUTES.liaoning} className="ag-header__brand" aria-label="AgriScope">
            <span className="ag-header__brand-en">AGRISCOPE</span>
          </NavLink>
          {/* ‹ › ^：始终渲染，保证 Header 的 DOM 在路由切换时稳定 */}
          <NavigationControls />
        </div>
        <div className="ag-header__tail">
          {/* 窄屏溢出菜单开关：桌面隐藏，窄屏显示。 */}
          <button
            type="button"
            ref={menuToggle}
            className="ag-header__menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="ag-header-nav"
            onClick={() => setMenuOpen((value) => !value)}
          >
            菜单
            <span className="ag-header__menu-mark" aria-hidden>{menuOpen ? '×' : '≡'}</span>
          </button>
          <nav id="ag-header-nav" className="ag-header__nav" data-open={menuOpen || undefined} aria-label="主导航">
            {NAV_ITEMS.map((item) => {
              const active = item.match(pathname);
              return (
                <NavLink
                  key={item.label}
                  to={primaryNavigationTarget(item.id, location, context)}
                  className="ag-header__link"
                  aria-current={active ? 'page' : undefined}
                  data-active={active || undefined}
                >
                  {item.label}
                  {/* 常驻渲染、仅切换 active；不使用 layoutId（V3 §37 修复飞入 Bug） */}
                  <AnimatedUnderline active={active} tone="ink" />
                </NavLink>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
