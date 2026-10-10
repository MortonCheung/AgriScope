import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ROUTES } from '../../app/routes';
import { MOTION_DURATION } from '../../design/motion';
import { useOpeningStore } from './openingPhase';
import './opening.css';

/**
 * 首页：一张当代研究草稿纸（V5 §22–§34、§57–§63）。
 *
 * 流程：草稿研究图 → 用户点击「进入」→ 一条 4.8s 的导演时间轴同时驱动
 * 「14 块行政区从空间落下」与「摄影机在省域外围完整环绕一周，再上升接正式机位」→ /liaoning。
 *
 * 本轮 §10/§11 修订：**每次真正进入 `/` 都重放开场**。
 * 挂载时用 `reset()` 把状态机拉回草稿态（幂等，StrictMode 安全），
 * 因此不再需要 sessionStorage，也不会出现"一个 session 只看一次"。
 *
 * 两个仍然成立的关键点：
 *   - 只有真的点击过（assembleStarted）才会在组装结束后跳转，
 *     否则减少动效的用户一进首页就会被自动带走；
 *   - 相机不再决定路由提交：时间轴走完即完成态（§58/§67）。
 */
export function OpeningPage() {
  const navigate = useNavigate();
  const reducedMotion = Boolean(useReducedMotion());
  const phase = useOpeningStore((state) => state.phase);
  const begin = useOpeningStore((state) => state.begin);
  const reset = useOpeningStore((state) => state.reset);
  const finish = useOpeningStore((state) => state.finish);
  const [assembleStarted, setAssembleStarted] = useState(false);
  const navigated = useRef(false);
  const skipRef = useRef<HTMLButtonElement>(null);

  /**
   * 每次打开 `/` 都回到草稿态。
   * 放在 layout effect 里，避免先按上一次的「完成态」画一帧再跳回草稿（可见闪一下）。
   * `reset` 幂等：StrictMode 双执行、重复挂载都只产生同一结果。
   */
  useLayoutEffect(() => { reset(); }, [reset]);

  useEffect(() => {
    if (!assembleStarted || phase !== 'ready' || navigated.current) return;
    navigated.current = true;
    navigate(ROUTES.liaoning, { viewTransition: true });
  }, [assembleStarted, navigate, phase]);

  useEffect(() => {
    if (phase === 'assembling') skipRef.current?.focus({ preventScroll: true });
  }, [phase]);

  /** 完成态：直接给沙盘，入口仍在，但不再触发组装（§36）。 */
  const settled = phase === 'ready';
  /** 组装一开始就让文字安静退场，让地图成为唯一焦点。 */
  const leaving = phase === 'assembling';

  return (
    <main className="opening" data-phase={phase} data-leaving={leaving || undefined}>
      {leaving && (
        <button
          type="button"
          className="ag-button ag-button--quiet opening__skip"
          ref={skipRef}
          onClick={finish}
        >
          跳过动画
        </button>
      )}
      <motion.div
        className="opening__inner"
        aria-hidden={leaving || undefined}
        initial={reducedMotion || settled ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: leaving ? 0 : 1, y: 0 }}
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
              disabled={leaving}
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
