import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ROUTES } from '../../app/routes';
import { MOTION_DURATION } from '../../design/motion';
import { hasSeenOpening, markOpeningSeen } from './openingSession';
import './opening.css';

/**
 * 首页：暖白纸面上先把辽宁的轮廓画出来，再让它隆起成三维模型，标题随之出现（V2 §60/§61）。
 *
 * - 完整编排只在首次进入时播放，总长取自 MOTION_DURATION.opening（§62）；
 * - 用户点击 / 滚动 / 按键可以随时打断，直接进入最终状态（§63）；
 * - reduced motion 或 session 内已看过：直接显示最终状态（§64）。
 * 文字保持在一侧，3D 辽宁是视觉中心（§69）。
 */
export function OpeningPage() {
  const reducedMotion = Boolean(useReducedMotion());
  const [instant] = useState(() => reducedMotion || hasSeenOpening());
  const [revealed, setRevealed] = useState(instant);

  useEffect(() => {
    if (revealed) return;
    // 模型揭示到约 62% 时标题出现：文字落在编排的后半段，而不是一开始就等在那（§61 阶段 6）。
    const timer = window.setTimeout(() => setRevealed(true), MOTION_DURATION.opening * 0.62 * 1000);
    const skip = () => setRevealed(true);
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'wheel', 'keydown', 'scroll', 'touchstart'];
    for (const name of events) window.addEventListener(name, skip, { once: true, passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const name of events) window.removeEventListener(name, skip);
    };
  }, [revealed]);

  useEffect(() => {
    if (revealed) markOpeningSeen();
  }, [revealed]);

  const rest = revealed ? { opacity: 1, y: 0 } : { opacity: 0, y: reducedMotion ? 0 : 18 };
  const rise = (delay: number) => ({
    initial: instant ? false : rest,
    animate: rest,
    transition: {
      duration: reducedMotion ? 0.2 : MOTION_DURATION.slow,
      delay: reducedMotion ? 0 : (instant ? 0 : delay),
      ease: [0.16, 1, 0.3, 1] as const,
    },
  });

  return (
    <main className="opening">
      <div className="opening__inner">
        <motion.h1 className="opening__wordmark" {...rise(0)}>
          <span className="opening__cn">穹衡</span>
          <span className="opening__en">AgriScope</span>
        </motion.h1>
        <motion.p className="opening__subtitle" {...rise(0.16)}>辽宁农业气候风险分析与情景研究</motion.p>
        <motion.div className="opening__action" {...rise(0.3)}>
          <Link className="ag-button ag-button--primary opening__cta" to={ROUTES.liaoning}>
            进入
          </Link>
        </motion.div>
      </div>
    </main>
  );
}
