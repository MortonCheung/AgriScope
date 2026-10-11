import { useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ROUTES } from '../../app/routes';
import { MOTION_DURATION } from '../../design/motion';
import { useOpeningStore } from './openingPhase';
import './opening.css';

/** Each visit automatically starts one short push, ending at the homepage pose. */
export function OpeningPage() {
  const navigate = useNavigate();
  const reducedMotion = Boolean(useReducedMotion());
  const phase = useOpeningStore((state) => state.phase);
  const begin = useOpeningStore((state) => state.begin);
  const reset = useOpeningStore((state) => state.reset);
  const finish = useOpeningStore((state) => state.finish);
  const initialized = useRef(false);
  const navigated = useRef(false);
  const skipRef = useRef<HTMLButtonElement>(null);

  /**
   * 每次打开 `/` 都回到草稿态。
   * 放在 layout effect 里，避免先按上一次的「完成态」画一帧再跳回草稿（可见闪一下）。
   * `reset` 幂等：StrictMode 双执行、重复挂载都只产生同一结果。
   */
  useLayoutEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    reset();
    begin();
  }, [begin, reset]);

  useEffect(() => {
    if (!initialized.current || phase !== 'ready' || useOpeningStore.getState().phase !== 'ready' || navigated.current) return;
    navigated.current = true;
    navigate(ROUTES.liaoning, { replace: true });
  }, [navigate, phase]);

  useEffect(() => {
    if (phase === 'assembling') skipRef.current?.focus({ preventScroll: true });
  }, [phase]);

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
        initial={reducedMotion ? false : { opacity: 1, y: 0 }}
        animate={{ opacity: leaving ? 0 : 1, y: 0 }}
        transition={{ duration: reducedMotion ? 0 : MOTION_DURATION.slow, delay: reducedMotion ? 0 : MOTION_DURATION.fast, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="opening__wordmark">
          {/*
            品牌（本轮 §28）：没有用户指定的正式 Logo 时**不渲染空占位方块**，只写品牌名。
          */}
          <span className="opening__en">AGRISCOPE</span>
        </h1>
        <p className="opening__subtitle">辽宁农业气候风险研究</p>
      </motion.div>
    </main>
  );
}
