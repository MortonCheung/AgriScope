import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ROUTES } from '../../app/routes';
import { MOTION_DURATION } from '../../design/motion';
import { markOpeningSeen } from './openingSession';
import { useOpeningStore } from './openingPhase';
import './opening.css';

/**
 * 首页：一张当代研究草稿纸（V5 §22–§34、§57–§63）。
 *
 * 流程：草稿研究图 → 用户点击「进入」→ 一条 3.6s 的时间轴同时驱动
 * 「14 块行政区从空间落下」与「相机螺旋环绕一圈后落到省域机位」→ 切到 /liaoning。
 *
 * 两个关键点：
 *   - 只有真的点击过（assembleStarted）才会在组装结束后跳转，
 *     否则"本次 session 已看过"的用户一进首页就会被自动带走；
 *   - 相机不再决定路由提交：时间轴走完即完成态（§58/§67）。
 */
export function OpeningPage() {
  const navigate = useNavigate();
  const reducedMotion = Boolean(useReducedMotion());
  const phase = useOpeningStore((state) => state.phase);
  const begin = useOpeningStore((state) => state.begin);
  const [assembleStarted, setAssembleStarted] = useState(false);

  useEffect(() => {
    if (!assembleStarted || phase !== 'ready') return;
    markOpeningSeen();
    navigate(ROUTES.liaoning, { viewTransition: true });
  }, [assembleStarted, navigate, phase]);

  /** 完成态：直接给沙盘，入口仍在，但不再触发组装（§36）。 */
  const settled = phase === 'ready';
  /** 组装一开始就让文字安静退场，让地图成为唯一焦点。 */
  const leaving = phase === 'assembling';

  return (
    <main className="opening" data-phase={phase} data-leaving={leaving || undefined}>
      <motion.div
        className="opening__inner"
        initial={reducedMotion || settled ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reducedMotion ? 0 : MOTION_DURATION.slow, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="opening__wordmark">
          {/*
            品牌（本轮 §28）：没有用户指定的正式 Logo 时**不渲染空占位方块**，只写品牌名。
          */}
          <span className="opening__en">AGRISCOPE</span>
        </h1>
        <p className="opening__subtitle">辽宁农业气候风险研究</p>
        <div className="opening__action">
          {settled ? (
            <Link className="ag-button ag-button--primary opening__cta" to={ROUTES.liaoning}>进入 →</Link>
          ) : (
            <button
              type="button"
              className="ag-button ag-button--primary opening__cta"
              onClick={() => { setAssembleStarted(true); begin(); }}
            >
              进入 →
            </button>
          )}
        </div>
      </motion.div>
    </main>
  );
}
