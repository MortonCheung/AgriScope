import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { CityResearchIndex } from '../../../domain/research/types';
import { MOTION_SPRING } from '../../../design/motion';
import { useResearchTreeStore } from './researchTreeStore';
import './research-tree.css';

/**
 * 研究树（V3 §16–§19）。
 *
 * 城市页与研究点页共用同一个目录：进入 `/cities/:cityId/research/*` 之后研究树不再消失，
 * 用户始终知道"我在沈阳 → S5 → C5"（§65）。
 *
 * 结构线属于 §8 允许的"信息结构线"，但必须很浅、很细、很克制（§18）。
 * 层级文字：专题 14–15px 中等字重接近墨色；研究点 13–14px 正常字重 ink-muted；编号用 mono 小字（§19）。
 */
export function ResearchTreeNav({ index, onSelectPoint }: {
  index: CityResearchIndex;
  onSelectPoint: (pointId: string) => void;
}) {
  const selectedPointId = useResearchTreeStore((state) => state.selectedPointId);
  const closedTopicIds = useResearchTreeStore((state) => state.closedTopicIds);
  const treeScrollTop = useResearchTreeStore((state) => state.treeScrollTop);
  const enterCity = useResearchTreeStore((state) => state.enterCity);
  const selectPoint = useResearchTreeStore((state) => state.selectPoint);
  const toggleTopic = useResearchTreeStore((state) => state.toggleTopic);
  const setTreeScrollTop = useResearchTreeStore((state) => state.setTreeScrollTop);

  const navRef = useRef<HTMLElement>(null);
  const reducedMotion = Boolean(useReducedMotion());
  /** 只在进入时恢复一次滚动位置，之后由用户滚动接管（§60）。 */
  const restored = useRef(false);

  useEffect(() => { enterCity(index.cityId); }, [enterCity, index.cityId]);

  useEffect(() => {
    if (restored.current) return;
    const element = navRef.current;
    if (!element) return;
    element.scrollTop = treeScrollTop;
    restored.current = true;
  }, [treeScrollTop]);

  const selected = selectedPointId
    ? index.points.find((point) => point.id === selectedPointId) ?? null
    : null;
  /** 当前选中的专题必须保持展开（§38）。 */
  const activeTopicId = selected?.topicId ?? null;
  const isExpanded = (topicId: string) => topicId === activeTopicId || !closedTopicIds.includes(topicId);

  const handleToggle = (topicId: string) => {
    if (topicId === activeTopicId) return;
    toggleTopic(topicId);
  };

  return (
    <nav className="research-tree" aria-label={`${index.cityName}研究目录`} ref={navRef} onScroll={(event) => setTreeScrollTop(event.currentTarget.scrollTop)}>
      {index.topics.map((topic) => {
        const expanded = isExpanded(topic.id);
        return (
          <section key={topic.id} className="research-tree__topic">
            <button
              type="button"
              className="research-tree__toggle"
              aria-expanded={expanded}
              aria-controls={`tree-points-${topic.id}`}
              disabled={topic.id === activeTopicId}
              onClick={() => handleToggle(topic.id)}
            >
              <span className="research-tree__topic-id">{topic.id}</span>
              <span className="research-tree__topic-title">{topic.title}</span>
            </button>
            {expanded && (
              <ul className="research-tree__points" id={`tree-points-${topic.id}`}>
                {topic.points.map((point) => (
                  <li key={point.id} className="research-tree__point">
                    <button
                      type="button"
                      className="research-tree__link"
                      data-selected={point.id === selectedPointId || undefined}
                      aria-current={point.id === selectedPointId ? 'true' : undefined}
                      onClick={() => { selectPoint(point.id); onSelectPoint(point.id); }}
                    >
                      {/* 选中态是共享背景块：在目录项之间滑动，而不是旧块消失、新块出现（§45） */}
                      {point.id === selectedPointId && (
                        <motion.span
                          layoutId="reader-selection"
                          className="research-tree__selection"
                          aria-hidden
                          transition={reducedMotion ? { duration: 0 } : MOTION_SPRING.soft}
                        />
                      )}
                      <span className="research-tree__point-id">{point.id}</span>
                      <span className="research-tree__point-title">{point.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </nav>
  );
}
