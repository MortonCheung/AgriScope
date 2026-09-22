import { NavLink, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ROUTES } from './routes';
import { MOTION_DURATION } from '../design/motion';
import './app-header.css';

const NAV_ITEMS = [
  { to: ROUTES.liaoning, label: '辽宁', match: (path: string) => path === ROUTES.liaoning },
  { to: ROUTES.city('shenyang'), label: '研究', match: (path: string) => path.startsWith('/cities/') },
  { to: ROUTES.scenarioLab, label: '情景实验', match: (path: string) => path === ROUTES.scenarioLab || path === ROUTES.rainstorm },
  { to: ROUTES.about, label: '关于', match: (path: string) => path === ROUTES.about },
] as const;

/** 全局导航保持极少入口：品牌 + 辽宁 / 研究 / 情景实验 / 关于。 */
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
        <NavLink to={ROUTES.root} className="ag-header__brand" aria-label="AgriScope 穹衡">
          <span className="ag-header__brand-cn">穹衡</span>
          <span className="ag-header__brand-en">AgriScope</span>
        </NavLink>
        <nav className="ag-header__nav" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className="ag-header__link"
              aria-current={item.match(pathname) ? 'page' : undefined}
              data-active={item.match(pathname) || undefined}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </motion.header>
  );
}
