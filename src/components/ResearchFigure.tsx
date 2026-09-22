import type { KeyboardEvent, ReactNode } from 'react';
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
  method?: string | null;
  /** 默认允许放大（V3 §26） */
  expandable?: boolean;
  children?: ReactNode;
}

/**
 * 统一的研究图表容器：图片 / 可交互组件共用同一套 Caption 与来源标注。
 * 来源统一走 SourceCitation（V3 §35）。
 *
 * 放大（V4 §四十七–§四十九）：
 *   - **点击图片本体**直接进入 Focus，不再有「放大」这种专门按钮；
 *   - 关闭只走 背景 / ESC / ×，绝不复用页面层级的 ‹（那属于 History 语义）；
 *   - 放大不重新 mount：当前元素进入 fixed focus，图片 / 标题 / 来源一起进入（§27/§58）。
 */
export function ResearchFigure({ src, alt, caption, source, evidenceLevel, method, expandable = true, children }: ResearchFigureProps) {
  const reducedMotion = Boolean(useReducedMotion());
  const focus = useFocusable(expandable);
  const media = children ?? <img src={src} alt={alt} loading="lazy" decoding="async" />;
  /** 只有纯静态图才把整块媒体变成可点击区：可交互组件内部有自己的点击语义，不能被外层抢走。 */
  const clickable = focus.canExpand && !children;

  const onMediaKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    focus.toggle();
  };

  return (
    <>
      {focus.expanded && <div className="ag-focus-backdrop" onClick={focus.close} aria-hidden />}
      <motion.figure
        layout
        className="research-figure"
        data-expanded={focus.expanded || undefined}
        data-clickable={clickable || undefined}
        transition={reducedMotion ? { duration: 0 } : MOTION_SPRING.soft}
      >
        {focus.expanded && (
          <button type="button" className="ag-focus-close" onClick={focus.close} aria-label="关闭放大">×</button>
        )}
        {clickable ? (
          <div
            className="research-figure__media"
            role="button"
            tabIndex={0}
            aria-label={`${alt}（放大查看）`}
            onClick={focus.toggle}
            onKeyDown={onMediaKeyDown}
          >
            {media}
          </div>
        ) : (
          <div className="research-figure__media">{media}</div>
        )}
        <figcaption className="research-figure__caption">
          {(caption || method) && (
            <div className="research-figure__text">
              {caption && <p className="research-figure__desc">{caption}</p>}
              {method && <p className="research-figure__method">{method}</p>}
            </div>
          )}
          <div className="research-figure__meta">
            <SourceCitation sources={source ? [source] : []} />
            {evidenceLevel && <EvidenceBadge level={evidenceLevel} compact />}
            {focus.canExpand && !clickable && (
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
