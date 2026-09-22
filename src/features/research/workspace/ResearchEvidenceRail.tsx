import { EVIDENCE_LEVELS } from '../../../domain/research';
import type { ResearchPoint } from '../../../domain/research/types';
import './evidence-rail.css';

/**
 * 右栏研究信息（V3 §23/§37）。
 *
 * 不是第二篇文章，只给 3–5 项：证据等级、时间范围、来源声明、研究方法、关键限制。
 * 这里只转述研究工程在 index.json 里声明的来源（sourceOfTruth），前端不新增、不猜测（§31/§32）。
 * 每个具体数据块下方仍然必须有自己来源（§37）。
 */
export function ResearchEvidenceRail({ point, timeWindow, provenance }: {
  point: ResearchPoint;
  timeWindow: string;
  provenance: string[];
}) {
  const evidence = EVIDENCE_LEVELS[point.evidenceLevel];
  const sources = provenance.filter(Boolean);
  const limit = point.limitations[0]?.text ?? null;

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
          <dt>来源声明</dt>
          <dd>{sources.length > 0 ? sources.join('；') : '来源未在当前前端索引中声明'}</dd>
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
    </div>
  );
}
