import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCity } from '../../domain/geography/cities';
import { useCityResearch } from '../../services/useCityResearch';
import { AsyncBoundary } from '../../components/AsyncState';
import { EvidenceBadge } from '../../components/EvidenceBadge';
import { ResearchSummary } from '../research/ResearchSummary';
import { ROUTES } from '../../app/routes';
import type { CityResearchIndex } from '../../domain/research/types';
import './city-space.css';

/**
 * 城市研究空间：以 ResearchTopic → ResearchPoint 呈现研究关系，
 * 而不是文章列表。点开研究点先给 Summary，再进入交互研究。
 */
export function CityResearchSpacePage() {
  const { cityId = '' } = useParams<{ cityId: string }>();
  const city = getCity(cityId);
  const state = useCityResearch(cityId);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);

  if (!city) {
    return (
      <main className="ag-page ag-container">
        <h1 className="ag-hero">未知城市</h1>
        <p className="ag-body">没有名为 {cityId} 的研究城市。</p>
        <Link className="ag-button" to={ROUTES.liaoning}>返回辽宁</Link>
      </main>
    );
  }

  if (!city.hasResearch) {
    return (
      <main className="ag-page ag-container">
        <h1 className="ag-hero">{city.shortName}研究尚未接入</h1>
        <div className="ag-row">
          <Link className="ag-button ag-button--primary" to={ROUTES.city('shenyang')}>查看沈阳研究</Link>
          <Link className="ag-button" to={ROUTES.liaoning}>返回辽宁</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="city-space" aria-label={`${city.name}研究空间`}>
      <AsyncBoundary state={state} label="正在读取城市研究索引">
        {(index) => <CitySpaceBody cityShortName={city.shortName} index={index} selectedPointId={selectedPointId} onSelect={setSelectedPointId} />}
      </AsyncBoundary>
    </main>
  );
}

function CitySpaceBody({ cityShortName, index, selectedPointId, onSelect }: {
  cityShortName: string;
  index: CityResearchIndex;
  selectedPointId: string | null;
  onSelect: (pointId: string | null) => void;
}) {
  const selected = useMemo(
    () => (selectedPointId ? index.points.find((point) => point.id === selectedPointId) ?? null : null),
    [index.points, selectedPointId],
  );

  return (
    <div className="city-space__panel">
      <header className="city-space__head">
        <h1 className="ag-hero city-space__title">{cityShortName}</h1>
        <div className="city-space__entries">
          <Link className="ag-button" to={ROUTES.report(index.cityId)}>综合报告</Link>
          <Link className="ag-button" to={ROUTES.rainstorm}>暴雨专题</Link>
        </div>
      </header>

      <div className="city-space__body">
        <nav className="city-space__topics" aria-label="研究专题">
          {index.topics.map((topic) => (
            <section key={topic.id} className="city-topic">
              <header className="city-topic__head">
                <span className="city-topic__id">{topic.id}</span>
                <h2 className="city-topic__title">{topic.title}</h2>
                <span className="city-topic__count">{topic.points.length} 个研究点</span>
              </header>
              <p className="city-topic__summary">{topic.summary}</p>
              <div className="city-topic__points">
                {topic.points.map((point) => (
                  <button
                    key={point.id}
                    type="button"
                    className="ag-point-row"
                    data-selected={point.id === selectedPointId || undefined}
                    onClick={() => onSelect(point.id)}
                  >
                    <span className="ag-point-row__main">
                      <span className="ag-point-row__id">{point.id}</span>
                      <span className="ag-point-row__title">{point.title}</span>
                    </span>
                    <span className="ag-point-row__tags">
                      <EvidenceBadge level={point.evidenceLevel} compact />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </nav>

        <aside className="city-space__detail" aria-live="polite">
          {selected ? (
            <>
              <button type="button" className="city-space__close" onClick={() => onSelect(null)}>关闭摘要</button>
              <ResearchSummary point={selected} />
            </>
          ) : (
            <div className="city-space__overview">
              <p className="ag-label">城市结论</p>
              <p className="city-space__risk">{index.cityConclusion.riskProfile}</p>
              <p className="city-space__definition">{index.cityConclusion.definition}</p>
              <p className="city-space__hint">选择左侧任一研究点查看摘要。</p>
              <ul className="city-space__blocks">
                {index.topics.map((topic) => (
                  <li key={topic.id}>
                    <span className="city-topic__id">{topic.id}</span>
                    <strong>{topic.title}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
