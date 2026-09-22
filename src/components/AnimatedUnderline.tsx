import { motion, useReducedMotion } from 'motion/react';
import { MOTION_SPRING } from '../design/motion';
import './animated-underline.css';

/**
 * 全站统一的“线”（V2 §41 / §43）。
 *
 * 只用 1px 细线表达层级，不用色块按钮。两种形态共用同一视觉：
 *   - 本地 hover 线：父级加 `ag-underline-host`，子级从左侧 scaleX(0)→scaleX(1)。
 *   - 共享指示线：传入 `layoutId`，跨元素连续滑动，而不是消失再出现（§42）。
 */
export function AnimatedUnderline({ layoutId, hover = false, tone = 'ink' }: {
  layoutId?: string;
  hover?: boolean;
  tone?: 'ink' | 'soft';
}) {
  const reducedMotion = Boolean(useReducedMotion());
  const className = ['ag-underline', `ag-underline--${tone}`, hover && 'ag-underline--hover'].filter(Boolean).join(' ');

  if (layoutId) {
    return (
      <motion.span
        aria-hidden
        layoutId={layoutId}
        className={className}
        transition={reducedMotion ? { duration: 0 } : MOTION_SPRING.direct}
      />
    );
  }

  return <span aria-hidden className={className} />;
}
