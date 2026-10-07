import { memo } from 'react';
import { useAppBack, type AppBackTarget } from '../app/appHistory';
import './app-back-button.css';

/**
 * 全站统一的返回控件（V3 §10–§12、§57）。
 *
 * - 不用圆角 Button：无背景、无圆角、无边框；
 * - hover 只做一次极轻的水平位移（0 → -3px）；
 * - 优先回真实上一站；无应用内历史时走结构 fallback（由调用方给定）。
 * 关闭临时 Overlay 用 `×`，返回页面层级用 `←`，两者不要混用。
 */
export const AppBackButton = memo(function AppBackButton({ fallback, label, className, ariaLabel = '返回上一页' }: {
  fallback: AppBackTarget;
  label?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const goBack = useAppBack(fallback);

  return (
    <button type="button" className={className ? `ag-back ${className}` : 'ag-back'} onClick={goBack} aria-label={ariaLabel}>
      <span className="ag-back__arrow" aria-hidden>←</span>
      {label ? <span className="ag-back__label">{label}</span> : null}
    </button>
  );
});
