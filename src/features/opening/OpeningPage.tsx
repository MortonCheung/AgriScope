import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ROUTES } from '../../app/routes';
import { MOTION_DURATION } from '../../design/motion';
import './opening.css';

/**
 * 首页只有产品身份与空间入口：
 * 穹衡 AgriScope / 一句话定位 / 一个主操作。
 */
export function OpeningPage() {
  const reducedMotion = Boolean(useReducedMotion());
  const rise = (delay: number) => ({
    initial: reducedMotion ? { opacity: 0 } : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reducedMotion ? 0.2 : MOTION_DURATION.slow, delay: reducedMotion ? 0 : delay, ease: [0.16, 1, 0.3, 1] as const },
  });

  return (
    <main className="opening">
      <div className="opening__inner">
        <motion.p className="ag-label opening__kicker" {...rise(0.05)}>辽宁农业气候风险交互研究</motion.p>
        <motion.h1 className="opening__wordmark" {...rise(0.14)}>
          <span className="opening__cn">穹衡</span>
          <span className="opening__en">AgriScope</span>
        </motion.h1>
        <motion.p className="opening__subtitle" {...rise(0.26)}>辽宁农业气候风险分析与情景研究</motion.p>
        <motion.div className="opening__action" {...rise(0.38)}>
          <Link className="ag-button ag-button--primary opening__cta" to={ROUTES.liaoning}>
            查看辽宁
          </Link>
        </motion.div>
      </div>
      <motion.dl className="opening__meta" {...rise(0.5)}>
        <div><dt>研究窗口</dt><dd className="ag-number">2021–2026</dd></div>
        <div><dt>研究城市</dt><dd className="ag-number">6</dd></div>
      </motion.dl>
    </main>
  );
}
