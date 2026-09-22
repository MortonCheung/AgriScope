import { EVIDENCE_LEVELS } from '../../../domain/research';
import type { ResearchPoint } from '../../../domain/research/types';
import type { LineageRef, SourceRef } from '../../../domain/research/sourceRef';
import { SourceCitation } from '../../../components/SourceCitation';
import './evidence-rail.css';

/**
 * 右栏研究信息（V3 §23/§37；V4 §五十三–§五十五）。
 *
 * 不是第二篇文章，只给 3–5 项：证据等级、时间范围、来源、研究方法、关键限制。
 *
 * 来源与血缘严格分开：
 *   - 「来源」只展示 `SourceRef`（机构 / 数据集），索引没声明就如实写「来源待补充」；
 *   - 技术血缘（.md / .csv 文件名）只在开发模式作为技术折叠区出现，正式界面不展示。
 * 每个具体数据块下方仍然必须有自己的来源（§37）。
 */
export function ResearchEvidenceRail({ point, timeWindow, sources, lineage }: {
  point: ResearchPoint;
  timeWindow: string;
  sources: SourceRef[];
  lineage: LineageRef[];
}) {
  const evidence = EVIDENCE_LEVELS[point.evidenceLevel];
  const limit = point.limitations[0]?.text ?? null;
  const artifacts = lineage.map((entry) => entry.artifact).filter((artifact): artifact is string => Boolean(artifact));

  return (
    <div className="evidence-rail">
      <p className="ag-label">研究信息</p>
      <dl className="evidence-rail__list">
        <div className="evidence-rail__item">
          <dt>证据</dt>
          <dd>
            <span className="evidence-rail__code">{point.evidenceLevel === 'Unsupported' ? '—' : point.evidenceLevel}</span>
            {evidence.label}
          </dd>
        </div>
        <div className="evidence-rail__item">
          <dt>时间</dt>
          <dd>{timeWindow}</dd>
        </div>
        <div className="evidence-rail__item">
          <dt>来源</dt>
          <dd>
            {/* §五十五：没有声明就不猜、不编，只如实标注待补充 */}
            {sources.length > 0
              ? <SourceCitation sources={sources} compact />
              : <span className="evidence-rail__pending">来源待补充</span>}
          </dd>
        </div>
        {point.method && (
          <div className="evidence-rail__item">
            <dt>方法</dt>
            <dd>{point.method}</dd>
          </div>
        )}
        {limit && (
          <div className="evidence-rail__item">
            <dt>限制</dt>
            <dd>{limit}</dd>
          </div>
        )}
      </dl>
      {/* §五十四：技术血缘只在开发模式出现 */}
      {import.meta.env.DEV && artifacts.length > 0 && (
        <details className="evidence-rail__lineage">
          <summary>技术血缘（仅开发模式）</summary>
          <p>{artifacts.join('；')}</p>
        </details>
      )}
    </div>
  );
}
