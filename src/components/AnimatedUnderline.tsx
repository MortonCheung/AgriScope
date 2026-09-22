import { motion, useReducedMotion } from 'motion/react';
import { MOTION_SPRING } from '../design/motion';
import './animated-underline.css';

/**
 * 全站统一的“线”（V3 §8/§9）。
 *
 * 线只表达"当前状态"，不再给 Hover 加下划线：
 * 三种允许的线是信息结构线、当前状态指示线、数据/图表/注释线。
 * 因此这里只保留共享指示线：传入 `layoutId`，在元素之间连续滑动，而不是消失再出现。
 */
export function AnimatedUnderline({ layoutId, tone = 'ink' }: {
  layoutId?: string;
  tone?: 'ink' | 'soft';
}) {
  const reducedMotion = Boolean(useReducedMotion());
  const className = ['ag-underline', `ag-underline--${tone}`].join(' ');

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
