import { Link, useParams } from 'react-router-dom';
import { ROUTES } from '../../app/routes';
import { AsyncBoundary } from '../../components/AsyncState';
import { EvidenceBadge, StatusBadge } from '../../components/EvidenceBadge';
import { getCity } from '../../domain/geography/cities';
import type { CityResearchIndex } from '../../domain/research/types';
import { useCityResearch } from '../../services/useCityResearch';
import './report.css';

/**
 * 城市综合研究页：以城市索引里的"整城问答"（cityConclusion.questions）为主体，
 * 逐问呈现，再进入六大专题的研究点与研究方法红线。前端不重编章节、不新增结论。
 */
export function CityReportPage() {
  const { cityId = '' } = useParams<{ cityId: string }>();
  const city = getCity(cityId);
  const state = useCityResearch(cityId);

  if (!city) {
    return (
      <main className="ag-page ag-container ag-container--prose">
        <h1 className="ag-hero">未知城市</h1>
        <p className="ag-body">没有名为 {cityId} 的研究城市。</p>
        <div className="ag-row">
          <Link className="ag-button" to={ROUTES.liaoning}>返回辽宁</Link>
        </div>
      </main>
    );
  }

  if (!city.hasResearch) {
    return (
      <main className="ag-page ag-container">
        <h1 className="ag-hero">{city.shortName}</h1>
        <p className="ag-lead">研究内容待接入</p>
      </main>
    );
  }

  return (
    <main className="ag-page ag-container ag-container--prose city-report">
      <AsyncBoundary state={state}>
        {(index) => <CityReportBody index={index} />}
      </AsyncBoundary>
    </main>
  );
}

function CityReportBody({ index }: { index: CityResearchIndex }) {
  const conclusion = index.cityConclusion;

  return (
    <div className="city-report__inner">
      <header className="city-report__head">
        <p className="ag-label">城市综合研究 · {index.cityName}</p>
        <h1 className="ag-hero city-report__title">{index.title}</h1>
        <p className="city-report__headline">{index.headline}</p>
        <p className="city-report__risk">
          <span className="ag-badge ag-badge--plain">风险画像</span>
          {conclusion.riskProfile}
        </p>
        <p className="ag-lead city-report__definition">{conclusion.definition}</p>
        <dl className="ag-deflist city-report__meta">
          <div className="ag-deflist__item">
            <dt>研究窗口</dt>
            <dd className="ag-number">{index.window}</dd>
          </div>
          <div className="ag-deflist__item">
            <dt>研究面板</dt>
            <dd className="ag-number">{index.panel}</dd>
          </div>
          <div className="ag-deflist__item">
            <dt>品种 / 专题 / 研究点</dt>
            <dd className="ag-number">{index.counters.crops} / {index.counters.topics} / {index.counters.studies}</dd>
          </div>
          <div className="ag-deflist__item">
            <dt>价格 / 成交量口径</dt>
            <dd>{index.priceUnit} ｜ {index.volumeUnit}</dd>
          </div>
        </dl>
        <div className="ag-row city-report__entries">
          <Link className="ag-button" to={ROUTES.city(index.cityId)}>城市研究空间</Link>
          <Link className="ag-button" to={ROUTES.rainstorm}>2026 暴雨专题</Link>
        </div>
      </header>

      <section className="ag-section" aria-labelledby="city-report-questions">
        <div className="ag-section__head">
          <p className="ag-label">整城问答</p>
          <h2 className="ag-section-title" id="city-report-questions">{conclusion.title}</h2>
        </div>
        <div className="city-report__qa-list">
          {conclusion.questions.map((qa, position) => (
            <details key={qa.question} className="report-qa" open={position === 0}>
              <summary className="report-qa__summary">
                <span className="report-qa__index">{String(position + 1).padStart(2, '0')}</span>
                <span className="report-qa__question">{qa.question}</span>
              </summary>
              <p className="report-qa__answer">{qa.answer}</p>
            </details>
          ))}
        </div>

        <div className="city-report__caveats">
          <p className="ag-label">限定条件</p>
          <ul className="report-list">
            {conclusion.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}
          </ul>
        </div>
      </section>

      <section className="ag-section" aria-labelledby="city-report-topics">
        <div className="ag-section__head">
          <p className="ag-label">专题结构</p>
          <h2 className="ag-section-title" id="city-report-topics">{index.topics.length} 个专题 · {index.points.length} 个研究点</h2>
        </div>
        <div className="city-report__topics">
          {index.topics.map((topic) => (
            <article key={topic.id} className="report-topic">
              <div className="report-topic__head">
                <span className="report-topic__id">{topic.id}</span>
                <h3 className="report-topic__title">{topic.title}</h3>
                <span className="ag-meta">{topic.points.length} 个研究点</span>
              </div>
              <p className="ag-body report-topic__summary">{topic.summary}</p>
              <ul className="report-points">
                {topic.points.map((point) => (
                  <li key={point.id}>
                    <Link className="report-point" to={ROUTES.research(index.cityId, point.id)}>
                      <span className="report-point__id">{point.id}</span>
                      <span className="report-point__title">{point.title}</span>
                      <span className="report-point__tags">
                        <EvidenceBadge level={point.evidenceLevel} compact />
                        <StatusBadge status={point.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="ag-section" aria-labelledby="city-report-method">
        <div className="ag-section__head">
          <p className="ag-label">方法与红线</p>
          <h2 className="ag-section-title" id="city-report-method">研究限制与方法学红线</h2>
        </div>
        <div className="ag-grid ag-grid--2 city-report__method">
          <div>
            <p className="ag-label">方法学说明</p>
            <ul className="report-list report-list--numbered">
              {index.methodologyNotes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </div>
          <div>
            <p className="ag-label">研究红线</p>
            <ul className="report-list report-list--redline">
              {index.redLines.map((redLine) => <li key={redLine}>{redLine}</li>)}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
