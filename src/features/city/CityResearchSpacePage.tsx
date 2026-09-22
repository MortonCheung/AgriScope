import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { getCity } from '../../domain/geography/cities';
import { useCityResearch } from '../../services/useCityResearch';
import { AsyncBoundary } from '../../components/AsyncState';
import { ResearchSummary } from '../research/ResearchSummary';
import { ROUTES } from '../../app/routes';
import { useAppHistory } from '../../app/appHistory';
import { MOTION_DURATION, MOTION_EASE, MOTION_SPRING } from '../../design/motion';
import type { CityResearchIndex } from '../../domain/research/types';
import './city-space.css';

/**
 * 研究纸进入的原点（V3 §13）。
 * 进入：从右下方铺到桌面；Back 返回（direction < 0）：更轻的回铺，读起来像"纸被重新摆回来"（V3 §12）。
 */
const PAPER_FROM = {
  enter: { opacity: 0, x: 56, y: 20, scale: 0.975, rotate: 0.3 },
  back: { opacity: 0, x: 18, y: 0, scale: 0.99, rotate: 0 },
} as const;

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
  const reducedMotion = Boolean(useReducedMotion());
  const navDirection = useAppHistory()?.direction ?? 0;
  const sidebarRef = useRef<HTMLElement>(null);
  /** 默认全部展开（§35 的文献目录形态）；被收起过的专题记在这里。 */
  const [closedTopicIds, setClosedTopicIds] = useState<string[]>([]);

  const selected = useMemo(
    () => (selectedPointId ? index.points.find((point) => point.id === selectedPointId) ?? null : null),
    [index.points, selectedPointId],
  );
  /** 当前选中的专题必须保持展开（§38）。 */
  const activeTopicId = selected?.topicId ?? null;

  const isExpanded = (topicId: string) => topicId === activeTopicId || !closedTopicIds.includes(topicId);
  const toggleTopic = (topicId: string) => {
    if (topicId === activeTopicId) return;
    setClosedTopicIds((current) => (current.includes(topicId) ? current.filter((id) => id !== topicId) : [...current, topicId]));
  };

  // 选中研究点后把它带回视野：返回时用户仍知道刚才在哪里（§16）。
  useEffect(() => {
    if (!selectedPointId) return;
    sidebarRef.current?.querySelector('[data-selected]')?.scrollIntoView({ block: 'nearest' });
  }, [selectedPointId]);

  return (
    <motion.div
      className="city-space__panel"
      data-focused={selected ? true : undefined}
      initial={reducedMotion ? false : (navDirection < 0 ? PAPER_FROM.back : PAPER_FROM.enter)}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }}
      transition={reducedMotion
        ? { duration: 0 }
        : { ...MOTION_SPRING.paper, opacity: { duration: MOTION_DURATION.normal, ease: MOTION_EASE.out } }}
    >
      <header className="city-space__head">
        <h1 className="ag-hero city-space__title">{cityShortName}</h1>
        <div className="city-space__entries">
          <Link className="ag-button" to={ROUTES.report(index.cityId)}>综合报告</Link>
          <Link className="ag-button" to={ROUTES.rainstorm}>暴雨专题</Link>
        </div>
      </header>

      <div className="city-space__body">
        <nav className="city-space__topics" aria-label="研究专题" ref={sidebarRef}>
          {index.topics.map((topic) => {
            const expanded = isExpanded(topic.id);
            return (
              <section key={topic.id} className="city-topic">
                <button
                  type="button"
                  className="city-topic__toggle"
                  aria-expanded={expanded}
                  aria-controls={`topic-points-${topic.id}`}
                  onClick={() => toggleTopic(topic.id)}
                >
                  <span className="city-topic__id">{topic.id}</span>
                  <span className="city-topic__title">{topic.title}</span>
                  <span className="city-topic__count ag-number">{topic.points.length}</span>
                </button>
                {expanded && (
                  <div className="city-topic__points" id={`topic-points-${topic.id}`}>
                    {topic.points.map((point) => (
                      <button
                        key={point.id}
                        type="button"
                        className="ag-point-row"
                        data-selected={point.id === selectedPointId || undefined}
                        onClick={() => onSelect(point.id)}
                      >
                        {/* 选中态是一条会滑动的共享背景，而不是旧块消失、新块出现（§45） */}
                        {point.id === selectedPointId && (
                          <motion.span
                            layoutId="reader-selection"
                            className="ag-point-row__selection"
                            aria-hidden
                            transition={reducedMotion ? { duration: 0 } : MOTION_SPRING.soft}
                          />
                        )}
                        <span className="ag-point-row__main">
                          <span className="ag-point-row__id">{point.id}</span>
                          <span className="ag-point-row__title">{point.title}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
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
    </motion.div>
  );
}
