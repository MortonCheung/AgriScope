import type { ReactNode } from 'react';
import { EvidenceBadge } from './EvidenceBadge';
import { SourceCitation } from './SourceCitation';
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
  children?: ReactNode;
}

/**
 * 统一的研究图表容器：图片 / 可交互组件共用同一套 Caption 与来源标注。
 * 来源统一走 SourceCitation（V3 §35）；不再用"静态图"这种 Pill 长期占据视觉（§35）。
 */
export function ResearchFigure({ src, alt, caption, source, evidenceLevel, interactiveState = 'static', method, children }: ResearchFigureProps) {
  return (
    <figure className="research-figure" data-state={interactiveState}>
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
        </div>
      </figcaption>
    </figure>
  );
}
