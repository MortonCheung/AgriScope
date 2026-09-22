import './source-citation.css';

export interface SourceCitationProps {
  sources: string[];
  prefix?: string;
  compact?: boolean;
}

/**
 * 统一数据来源（V3 §29–§40）。
 *
 * 来源不是装饰，但字号可以小；必须是 ink-muted 级别，不能用 ink-ghost；
 * 无 Badge、无 Pill、无圆角容器。
 * 找不到确切来源时不猜、不编：留空并写「来源待补充」，
 * 并记录到 docs/SOURCE_GAPS.md（§32）。
 */
export function SourceCitation({ sources, prefix = '数据来源', compact }: SourceCitationProps) {
  const list = sources.map((source) => source.trim()).filter(Boolean);

  if (list.length === 0) {
    return (
      <p className="source-citation" data-compact={compact || undefined} data-missing>
        来源待补充
      </p>
    );
  }

  return (
    <p className="source-citation" data-compact={compact || undefined}>
      <span className="source-citation__prefix">{prefix}</span>
      <span className="source-citation__list">{list.join('；')}</span>
    </p>
  );
}
