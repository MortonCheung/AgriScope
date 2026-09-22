import { NavLink, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ROUTES } from './routes';
import { AnimatedUnderline } from '../components/AnimatedUnderline';
import { MOTION_DURATION } from '../design/motion';
import './app-header.css';

/**
 * 导航职责（V2 §25）：
 *   辽宁      地理与城市探索：/liaoning 与 /cities/:cityId
 *   研究      正式研究内容：/cities/:cityId/report、/cities/:cityId/research/*、暴雨专题
 *   情景实验  只代表 Scenario Lab（暴雨专题本身属于研究）
 *   关于      不变
 */
const NAV_ITEMS = [
  {
    to: ROUTES.liaoning,
    label: '辽宁',
    match: (path: string) => path === ROUTES.liaoning || /^\/cities\/[^/]+\/?$/.test(path),
  },
  {
    to: ROUTES.report('shenyang'),
    label: '研究',
    match: (path: string) => path.endsWith('/report') || path.includes('/research/') || path === ROUTES.rainstorm,
  },
  { to: ROUTES.scenarioLab, label: '情景实验', match: (path: string) => path === ROUTES.scenarioLab },
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
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname);
            return (
              <NavLink
                key={item.label}
                to={item.to}
                className="ag-header__link ag-underline-host"
                aria-current={active ? 'page' : undefined}
                data-active={active || undefined}
              >
                {item.label}
                {/* Hover 是本地临时下划线；Active 是共享指示线，两者不打架（V2 §42/§43/§44） */}
                <AnimatedUnderline hover tone="soft" />
                {active && <AnimatedUnderline layoutId="main-nav-indicator" tone="ink" />}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </motion.header>
  );
}
