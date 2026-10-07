import type { SourceRef } from '../domain/research/sourceRef';
import './source-citation.css';

export interface SourceCitationProps {
  sources: SourceRef[];
  /**
   * 无来源声明时的处理（V4 §五十五）：
   *   - `none`：整块不渲染（图表页脚默认，避免每张图都重复一句提示）；
   *   - `pending`：如实写「来源待补充」，用于页面级的来源区块。
   */
  fallback?: 'none' | 'pending';
  compact?: boolean;
}

/**
 * 统一数据来源（V4 §五十三–§五十五）。
 *
 * 只渲染 `SourceRef`（机构 / 数据集 / 链接）；**技术血缘文件名绝不进这里**。
 * 没有来源时不猜、不编网站，也不显示"来源未在当前前端索引中声明"这类开发文案。
 */
export function SourceCitation({ sources, fallback = 'none', compact }: SourceCitationProps) {
  if (sources.length === 0) {
    if (fallback === 'none') return null;
    return <p className="source-citation" data-compact={compact || undefined} data-missing>来源待补充</p>;
  }

  return (
    <ul className="source-citation" data-compact={compact || undefined}>
      {sources.map((source) => {
        const label = source.dataset ?? source.title ?? source.organization;
        return (
          <li className="source-citation__item" key={`${source.organization}｜${label}`}>
            <span className="source-citation__org">{source.organization}</span>
            <span className="source-citation__dataset">
              {source.url
                ? <a className="source-citation__link" href={source.url} target="_blank" rel="noreferrer noopener">{label} ↗</a>
                : label}
            </span>
            {source.accessedAt && <span className="source-citation__accessed">访问于 {source.accessedAt}</span>}
          </li>
        );
      })}
    </ul>
  );
}
