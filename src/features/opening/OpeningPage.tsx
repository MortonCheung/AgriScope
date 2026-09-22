import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ROUTES } from '../../app/routes';
import { MOTION_DURATION } from '../../design/motion';
import { markOpeningSeen } from './openingSession';
import { useOpeningStore } from './openingPhase';
import './opening.css';

/**
 * 首页：一张当代研究草稿纸（V4 §二十二–§三十四）。
 *
 * 流程是 草稿研究图 → 用户点击「进入」→ 三维辽宁被构建出来，
 * 而不是旧版的"自动播放一遍动画"。阶段由 `openingPhase` 状态机统一管理。
 *
 * - 本次 session 已看过、或 reduced motion → 直接给完成态，不再重放（§三十六/§三十七）；
 * - 相机收束完成（settling → exiting）时才切路由，此时位姿已与 /liaoning 完全一致（§三十四）。
 */
export function OpeningPage() {
  const navigate = useNavigate();
  const reducedMotion = Boolean(useReducedMotion());
  const phase = useOpeningStore((state) => state.phase);
  const begin = useOpeningStore((state) => state.begin);
  const finish = useOpeningStore((state) => state.finish);

  useEffect(() => {
    if (phase !== 'exiting') return;
    markOpeningSeen();
    finish();
    navigate(ROUTES.liaoning, { viewTransition: true });
  }, [finish, navigate, phase]);

  /** 完成态：直接显示沙盘，入口仍在，但不再触发组装。 */
  const settled = phase === 'ready';
  /** 收束/离开：让首页文字先安静地退场，避免路由切换时闪白（§六十八）。 */
  const leaving = phase === 'settling' || phase === 'exiting';

  return (
    <main className="opening" data-phase={phase} data-leaving={leaving || undefined}>
      <motion.div
        className="opening__inner"
        initial={reducedMotion || settled ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reducedMotion ? 0 : MOTION_DURATION.slow, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="opening__wordmark">
          <span className="opening__cn">穹衡</span>
          <span className="opening__en">AgriScope</span>
        </h1>
        {/* §二十六：只留一行说明，且不再重复"分析与情景研究" */}
        <p className="opening__subtitle">辽宁农业气候风险研究</p>
        <div className="opening__action">
          {settled ? (
            <Link className="ag-button ag-button--primary opening__cta" to={ROUTES.liaoning}>进入 →</Link>
          ) : (
            <button type="button" className="ag-button ag-button--primary opening__cta" onClick={begin}>
              进入 →
            </button>
          )}
        </div>
      </motion.div>
    </main>
  );
}
