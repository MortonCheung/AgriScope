import { useLocation } from 'react-router-dom';
import { useAppHistory } from '../app/appHistory';
import { usePageNavigate } from '../app/pageNavigation';
import { ROUTES, parseCityPath, structuralParent } from '../app/routes';
import { requestCityExit } from '../features/spatial/cityExit';
import './navigation-controls.css';

/** 细线 chevron：不依赖字体里的 ‹ › ^ 字形，跨 Safari / Chromium / WebKit 一致（V4 §十二/§五十二）。 */
function Chevron({ dir }: { dir: 'back' | 'forward' | 'up' }) {
  const path = dir === 'back'
    ? 'M10.5 3.5 6 8l4.5 4.5'
    : dir === 'forward'
      ? 'M5.5 3.5 10 8l-4.5 4.5'
      : 'M3.5 10 8 5.5l4.5 4.5';
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d={path} />
    </svg>
  );
}

/**
 * 页面导航控件（V4 §八/§九/§十/§十二）。
 *
 *   ‹  应用访问历史中的上一页（没有历史就禁用，不伪装成"上一级"）
 *   ›  前进，与浏览器 / 资源管理器一致；主动导航后前进栈自动废弃
 *   ^  上一级，只依赖 structuralParent()，与"刚才去过哪里"无关
 *
 * 视觉：无背景 / 无圆角 / 无边框框体，黑或暖灰细线图标；
 * Hover 只做 opacity + 1–2px 位移；禁用态 opacity .24 且 pointer-events none，但图标保留、不突然消失。
 * 不把「后退 / 前进 / 上一级」三个中文显示出来，只用 aria-label。
 */
export function NavigationControls() {
  const { pathname } = useLocation();
  const history = useAppHistory();
  const navigate = usePageNavigate();
  const up = structuralParent(pathname);
  /** 在城市空间里，"回退 / 上一级"都会离开城市 —— 必须走空间退出动画（本轮 §26）。 */
  const inCity = parseCityPath(pathname) !== null;

  return (
    <div className="ag-nav-controls" role="group" aria-label="页面导航">
      <button
        type="button"
        className="ag-nav-control"
        data-dir="back"
        aria-label="后退"
        disabled={!history?.canGoBack}
        onClick={() => {
          if (inCity) requestCityExit({ via: 'back' });
          else history?.goBack({ to: up ?? ROUTES.root });
        }}
      >
        <Chevron dir="back" />
      </button>
      <button
        type="button"
        className="ag-nav-control"
        data-dir="forward"
        aria-label="前进"
        disabled={!history?.canGoForward}
        onClick={() => history?.goForward()}
      >
        <Chevron dir="forward" />
      </button>
      <button
        type="button"
        className="ag-nav-control"
        data-dir="up"
        aria-label="上一级"
        disabled={!up}
        onClick={() => {
          if (!up) return;
          if (inCity) requestCityExit({ target: up, via: 'push' });
          else navigate(up);
        }}
      >
        <Chevron dir="up" />
      </button>
    </div>
  );
}
