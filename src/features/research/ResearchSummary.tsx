import { Link } from 'react-router-dom';
import { ROUTES } from '../../app/routes';
import { EVIDENCE_LEVELS } from '../../domain/research';
import type { ResearchPoint } from '../../domain/research/types';
import './research.css';

/**
 * 城市页右侧摘要（V3 §24）。
 *
 * 只保留：编号 / 问题标题 / 一段很短的结论 / 证据等级 / 进入研究。
 * 已删除：带文字的"关闭摘要"按钮、多个 Badge、核心数据宫格、
 * 重复的"研究问题"与"关键结论"、多余方法标签、专题摘要。
 * 收起用 `×`（关闭临时视图，§57），返回页面层级仍然用 `←`。
 */
export function ResearchSummary({ point, onClose }: {
  point: ResearchPoint;
  onClose?: () => void;
}) {
  const evidence = EVIDENCE_LEVELS[point.evidenceLevel];
  const short = point.frontendText ?? point.conclusion;

  return (
    <article className="research-summary">
      <div className="research-summary__meta">
        <span className="research-summary__id">{point.id}</span>
        {onClose && (
          <button type="button" className="research-summary__close" onClick={onClose} aria-label="收起摘要">×</button>
        )}
      </div>
      <h2 className="research-summary__title">{point.title}</h2>
      <p className="research-summary__lead">{short}</p>
      <p className="research-summary__evidence">
        <span className="research-summary__code">{point.evidenceLevel === 'Unsupported' ? '—' : point.evidenceLevel}</span>
        证据 {evidence.label}
      </p>
      <div className="research-summary__actions">
        <Link className="ag-button ag-button--primary" to={ROUTES.research(point.cityId, point.id)}>进入研究 →</Link>
      </div>
    </article>
  );
}
