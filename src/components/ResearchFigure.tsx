import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { EvidenceBadge } from './EvidenceBadge';
import { SourceCitation } from './SourceCitation';
import { useFocusable } from './useFocusable';
import { MOTION_SPRING } from '../design/motion';
import type { EvidenceLevelCode } from '../domain/research/types';
import './research-figure.css';

export interface ResearchFigureProps {
  src: string;
  alt: string;
  caption?: string | null;
  source?: string;
  evidenceLevel?: EvidenceLevelCode;
  /** 该图暂时无法交互时，如实标注前端开发状态，而不是改写研究结论 */
  interactiveState?: 'interactive' | 'static' | 'pending';
  method?: string | null;
  /** 默认允许放大（V3 §26） */
  expandable?: boolean;
  children?: ReactNode;
}

/**
 * 统一的研究图表容器：图片 / 可交互组件共用同一套 Caption 与来源标注。
 * 来源统一走 SourceCitation（V3 §35）；不再用"静态图"这种 Pill 长期占据视觉（§35）。
 * 放大不重新 mount：当前元素进入 fixed focus 状态，来源随之一起进入（§27/§58）。
 */
export function ResearchFigure({ src, alt, caption, source, evidenceLevel, interactiveState = 'static', method, expandable = true, children }: ResearchFigureProps) {
  const reducedMotion = Boolean(useReducedMotion());
  const focus = useFocusable(expandable);

  return (
    <>
      {focus.expanded && <div className="ag-focus-backdrop" onClick={focus.close} aria-hidden />}
      <motion.figure
        layout
        className="research-figure"
        data-state={interactiveState}
        data-expanded={focus.expanded || undefined}
        transition={reducedMotion ? { duration: 0 } : MOTION_SPRING.soft}
      >
        <div className="research-figure__media">
          {children ?? <img src={src} alt={alt} loading="lazy" decoding="async" />}
        </div>
        <figcaption className="research-figure__caption">
          {(caption || method) && (
            <div className="research-figure__text">
              {caption && <p className="research-figure__desc">{caption}</p>}
              {method && <p className="research-figure__method">{method}</p>}
            </div>
          )}
          <div className="research-figure__meta">
            <SourceCitation sources={source ? [source] : []} />
            {interactiveState === 'pending' && <span className="ag-badge ag-badge--plain">交互数据正在接入</span>}
            {evidenceLevel && <EvidenceBadge level={evidenceLevel} compact />}
            {focus.canExpand && (
              <button type="button" className="ag-focus-toggle" onClick={focus.toggle} aria-expanded={focus.expanded}>
                {focus.expanded ? '×' : '放大'}
              </button>
            )}
          </div>
        </figcaption>
      </motion.figure>
    </>
  );
}
