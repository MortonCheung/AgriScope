import { NavLink, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ROUTES } from './routes';
import { NAV_ITEMS } from './navItems';
import { AnimatedUnderline } from '../components/AnimatedUnderline';
import { NavigationControls } from '../components/NavigationControls';
import { MOTION_DURATION } from '../design/motion';
import './app-header.css';

/** 全局导航保持极少入口：品牌 + ‹ › ^ + 辽宁 / 研究 / 情景实验 / 关于。Active 语义见 navItems.ts（V4 §十四）。 */
export function AppHeader() {
  const { pathname } = useLocation();
  const reducedMotion = Boolean(useReducedMotion());
  const concealed = pathname === ROUTES.root;

  return (
    <motion.header
      className="ag-header"
      aria-label="全域导航"
      data-concealed={concealed || undefined}
      inert={concealed}
      style={{ viewTransitionName: 'ag-header' }}
      initial={false}
      animate={{ opacity: concealed ? 0 : 1, y: concealed ? -12 : 0 }}
      transition={{ duration: reducedMotion ? 0 : MOTION_DURATION.normal, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="ag-header__inner">
        <div className="ag-header__lead">
          <NavLink to={ROUTES.root} className="ag-header__brand" aria-label="AgriScope">
            {/*
              Logo slot（V5 §19）：仓库里没有用户指定的正式品牌 Logo，
              因此**不自行设计**，只预留位置；位形确定后再填。
            */}
            <span className="ag-header__brand-mark" aria-hidden="true" />
            <span className="ag-header__brand-en">AGRISCOPE</span>
          </NavLink>
          {/* ‹ › ^（V4 §八/§九/§十）：始终渲染，保证 Header 的 DOM 在路由切换时稳定 */}
          <NavigationControls />
        </div>
        <nav className="ag-header__nav" aria-label="主导航">
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname);
            return (
              <NavLink
                key={item.label}
                to={item.to}
                className="ag-header__link"
                aria-current={active ? 'page' : undefined}
                data-active={active || undefined}
              >
                {item.label}
                {/* 只保留一根 Active 共享指示线；Hover 仅改变文字颜色（V3 §8/§9） */}
                {active && <AnimatedUnderline layoutId="main-nav-indicator" tone="ink" />}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </motion.header>
  );
}
