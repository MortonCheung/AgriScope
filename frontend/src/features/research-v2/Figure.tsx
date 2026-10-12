import type { KeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useFocusable } from '../../components/useFocusable';
import { MOTION_SPRING } from '../../design/motion';
import { researchFigureSize } from '../../domain/research/v2/figureSize';

export interface V2FigureProps {
  src: string;
  alt: string;
  /** 图序号：原文模式自动编号（V5 §35）。 */
  index: number;
}

/**
 * v2 论文图（V5 §34/§35/§88）。
 *
 * 现实约束（见 docs/SHENYANG_V2_FRONTEND_AUDIT.md §G3）：v2 只给了文件名，
 * **没有** 图标题、图注、图级来源。因此这里只做三件确定的事：
 *   图编号、图片本体（点击放大、object-fit: contain、不裁切）、统一的来源段落在文末。
 * 缺的那三样**不编**，记入文档。
 *
 * 发布 PNG 的真实宽高由只读生成脚本登记。图片请求开始前即按真实比例占位，
 * 放大后沿用 contain，不裁切、不修改研究图像。
 */
export function V2Figure({ src, alt, index }: V2FigureProps) {
  const reducedMotion = Boolean(useReducedMotion());
  const focus = useFocusable(true);
  const dimensions = researchFigureSize(src);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    focus.toggle();
  };

  return (
    <>
      {focus.expanded && <div className="ag-focus-backdrop" onClick={focus.close} aria-hidden />}
      <motion.figure
        layout
        className="research-figure research-note__asset"
        data-expanded={focus.expanded || undefined}
        data-clickable
        transition={reducedMotion ? { duration: 0 } : MOTION_SPRING.soft}
      >
        {focus.expanded && (
          <button type="button" className="ag-focus-close" onClick={focus.close} aria-label="关闭放大">×</button>
        )}
        <div
          className="research-figure__media"
          role="button"
          tabIndex={0}
          aria-label={`${alt}（放大查看）`}
          onClick={focus.toggle}
          onKeyDown={onKeyDown}
          style={focus.expanded || !dimensions ? undefined : { aspectRatio: `${dimensions[0]} / ${dimensions[1]}` }}
        >
          <img
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            width={dimensions?.[0]}
            height={dimensions?.[1]}
          />
        </div>
        <figcaption className="research-figure__caption">
          <div className="research-figure__text">
            <p className="research-figure__desc">图 {index}</p>
          </div>
        </figcaption>
      </motion.figure>
    </>
  );
}
