import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { MOTION_DURATION, MOTION_EASE } from '../../design/motion';
import './flip-value.css';

/** A fixed paper reveals only the changed value. Units belong outside this mask. */
export function FlipValue({ value, className = '' }: { value: string; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <span className={`flip-value ${className}`}>{value}</span>;
  return <span className={`flip-value ${className}`} aria-label={value}>
    <AnimatePresence initial={false} mode="popLayout">
      <motion.span key={value} className="flip-value__item" aria-hidden
        initial={{ y: '55%', opacity: 0 }} animate={{ y: '0%', opacity: 1 }}
        exit={{ y: '-55%', opacity: 0, transition: { duration: MOTION_DURATION.valueExit } }}
        transition={{ duration: MOTION_DURATION.valueEnter, ease: MOTION_EASE.standard }}>
        {value}
      </motion.span>
    </AnimatePresence>
  </span>;
}
