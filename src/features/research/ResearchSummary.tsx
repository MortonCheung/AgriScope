import { Link } from 'react-router-dom';
import { ROUTES } from '../../app/routes';
import { EvidenceBadge, StatusBadge } from '../../components/EvidenceBadge';
import { KeyNumberGrid } from '../../components/KeyNumberGrid';
import type { ResearchPoint } from '../../domain/research/types';
import './research.css';

/**
 * Research Summary：从研究空间点开一个研究点时的第一层内容。
 * 先给现象与结论，方法与限制放在后面（渐进披露）。
 */
export function ResearchSummary({ point, onOpenArticle }: { point: ResearchPoint; onOpenArticle?: () => void }) {
  return (
    <article className="research-summary">
      <header className="research-summary__head">
        <p className="ag-label">{point.id} · {point.topicTitle}</p>
        <h2 className="ag-section-title">{point.title}</h2>
        <div className="research-summary__tags">
          <EvidenceBadge level={point.evidenceLevel} />
          <StatusBadge status={point.status} />
          {point.category && <span className="ag-badge ag-badge--plain">{point.category}</span>}
        </div>
      </header>

      {point.frontendText && <p className="research-summary__lead">{point.frontendText}</p>}

      <dl className="ag-deflist">
        <div className="ag-deflist__item"><dt>研究问题</dt><dd>{point.question}</dd></div>
        <div className="ag-deflist__item"><dt>关键结论</dt><dd>{point.conclusion}</dd></div>
      </dl>

      {point.keyNumbers.length > 0 && (
        <section className="research-summary__block">
          <p className="ag-label">核心数据</p>
          <KeyNumberGrid numbers={point.keyNumbers} />
        </section>
      )}

      {point.method && (
        <details className="research-summary__more">
          <summary>方法与数据</summary>
          <div className="research-summary__more-body">
            <p><strong>数据</strong>{point.data}</p>
            <p><strong>方法</strong>{point.method}</p>
          </div>
        </details>
      )}

      {point.limitations.length > 0 && (
        <details className="research-summary__more">
          <summary>研究限制（{point.limitations.length}）</summary>
          <ul className="research-summary__limits">
            {point.limitations.map((limit) => <li key={limit.text}>{limit.text}</li>)}
          </ul>
        </details>
      )}

      <div className="research-summary__actions">
        <Link className="ag-button ag-button--primary" to={ROUTES.research(point.cityId, point.id)}>进入研究</Link>
        {onOpenArticle && <button type="button" className="ag-button" onClick={onOpenArticle}>查看原文</button>}
      </div>
    </article>
  );
}
