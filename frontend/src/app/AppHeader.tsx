import { NavLink, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ROUTES } from './routes';
import { NAV_ITEMS } from './navItems';
import { AnimatedUnderline } from '../components/AnimatedUnderline';
import { NavigationControls } from '../components/NavigationControls';
import { ContextBar } from './context/ContextBar';
import { MOTION_DURATION } from '../design/motion';
import './app-header.css';

/**
 * 全局导航（V3 §4/§6）。
 *
 * 一级入口只有三件产品事：辽宁农业态势 / 决策中心 / 研究中心。
 * 右侧常驻 ContextBar，让三个入口共享同一座城市与周期。
 * Active 语义见 navItems.ts。
 */
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
          {/*
            品牌：仓库与设计参考里都没有用户指定的正式 Logo，
            因此**不渲染空的占位方块**，只写 AGRISCOPE；有真实 Logo 再插进去。
          */}
          <NavLink to={ROUTES.root} className="ag-header__brand" aria-label="AgriScope">
            <span className="ag-header__brand-en">AGRISCOPE</span>
          </NavLink>
          {/* ‹ › ^：始终渲染，保证 Header 的 DOM 在路由切换时稳定 */}
          <NavigationControls />
        </div>
        <div className="ag-header__tail">
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
                  {/* 常驻渲染、仅切换 active；不使用 layoutId（V3 §37 修复飞入 Bug） */}
                  <AnimatedUnderline active={active} tone="ink" />
                </NavLink>
              );
            })}
          </nav>
          <ContextBar />
        </div>
      </div>
    </motion.header>
  );
}
