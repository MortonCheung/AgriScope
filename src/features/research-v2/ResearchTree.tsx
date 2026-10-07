import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ResearchPoint, ResearchTopic } from '../../domain/research/catalog';
import { ROUTES } from '../../app/routes';
import './research-tree.css';

export interface ResearchTreeProps {
  cityId: string;
  topics: ResearchTopic[];
  /** 当前所在的方向 / 研究点，用于高亮。 */
  currentTopicId?: string;
  currentPointId?: string;
  /**
   * rail：研究页左侧的紧凑树（默认只展开当前方向，点条目直接导航）。
   * picker：城市 App 侧栏（默认展开第一个方向；单击只改选择，不导航，§21）。
   */
  variant: 'rail' | 'picker';
  /** picker：当前选中的方向或研究点（canonical id）。 */
  selectedId?: string;
  /** picker：单击某条目时回调，只改 selectedResearchId，URL 不变（§21）。 */
  onSelect?: (researchId: string) => void;
}

/** 展开/收起：height + opacity + translateY，220–300ms，尊重 prefers-reduced-motion（§20）。 */
const EXPAND_DURATION = 0.26;

function StatusMark({ point }: { point: ResearchPoint }) {
  if (point.status === 'ready') return null;
  return <span className="tree__point-state" aria-hidden>{point.status === 'pending' ? '·' : '—'}</span>;
}

function PointRow({ cityId, point, current, selected, onSelect }: {
  cityId: string;
  point: ResearchPoint;
  current: boolean;
  selected: boolean;
  onSelect?: (researchId: string) => void;
}) {
  const inner = (
    <>
      <span className="tree__point-id">{point.id}</span>
      <span className="tree__point-title">{point.title}</span>
      <StatusMark point={point} />
    </>
  );

  if (onSelect) {
    return (
      <li className="tree__point" data-current={current || undefined} data-selected={selected || undefined}>
        <button
          type="button"
          className="tree__point-link"
          aria-current={selected ? 'true' : undefined}
          onClick={() => onSelect(point.id)}
        >
          {inner}
        </button>
      </li>
    );
  }

  return (
    <li className="tree__point" data-current={current || undefined} data-selected={selected || undefined}>
      <Link className="tree__point-link" to={ROUTES.research(cityId, point.id)}>{inner}</Link>
    </li>
  );
}

function TopicBlock({ cityId, topic, currentTopicId, currentPointId, selectedId, onSelect, variant, defaultOpen }: {
  cityId: string;
  topic: ResearchTopic;
  currentTopicId?: string;
  currentPointId?: string;
  selectedId?: string;
  onSelect?: (researchId: string) => void;
  variant: 'rail' | 'picker';
  defaultOpen: boolean;
}) {
  const reducedMotion = Boolean(useReducedMotion());
  const containsCurrent = topic.id === currentTopicId
    || topic.points.some((point) => point.id === currentPointId);
  const containsSelection = topic.id === selectedId
    || topic.points.some((point) => point.id === selectedId);
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const open = manualOpen ?? (containsCurrent || containsSelection || defaultOpen);

  const handleHead = () => {
    if (onSelect) onSelect(topic.id);
    setManualOpen(!open);
  };

  return (
    <li className="tree__topic" data-open={open || undefined} data-current={topic.id === currentTopicId || undefined} data-selected={topic.id === selectedId || undefined}>
      <div className="tree__topic-head">
        <button
          type="button"
          className="tree__toggle"
          aria-expanded={open}
          aria-current={topic.id === selectedId ? 'true' : undefined}
          onClick={handleHead}
        >
          <span className="tree__topic-id">{topic.id}</span>
          <span className="tree__topic-title">{topic.title}</span>
        </button>
        {/* picker 里没有"进入 →"：进入研究只有一个入口，在右侧 Preview（§21/§22）。 */}
        {variant === 'rail' && (
          <Link className="tree__topic-open" to={ROUTES.research(cityId, topic.id)} aria-label={`进入 ${topic.id}`}>→</Link>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol
            className="tree__points"
            initial={reducedMotion ? false : { height: 0, opacity: 0, y: -4 }}
            animate={{ height: 'auto', opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: -4 }}
            transition={{ duration: reducedMotion ? 0 : EXPAND_DURATION, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
          >
            {topic.points.map((point) => (
              <PointRow
                key={point.id}
                cityId={cityId}
                point={point}
                current={point.id === currentPointId}
                selected={point.id === selectedId}
                onSelect={onSelect}
              />
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
    </li>
  );
}

/**
 * 城市研究树（本轮 §7/§8/§20/§21）。
 *
 * 两级：方向（A1–A8）→ 研究点（A?.?）。
 * 组件完全由 catalog 驱动，不假设方向数量（铁岭可能是 6，朝阳可能是 10）。
 * 不做卡片墙、不做徽标墙：编辑式目录，直角、线性层级。
 *
 * picker 变体只做**选择**：单击改变 selectedResearchId，URL 不变；
 * 真正导航由右侧 Preview 的「进入研究」负责（§21）。
 */
export function ResearchTree({
  cityId, topics, currentTopicId, currentPointId, variant, selectedId, onSelect,
}: ResearchTreeProps) {
  return (
    <ol className="tree" data-variant={variant}>
      {topics.map((topic, index) => (
        <TopicBlock
          key={topic.id}
          cityId={cityId}
          topic={topic}
          currentTopicId={currentTopicId}
          currentPointId={currentPointId}
          selectedId={selectedId}
          onSelect={onSelect}
          variant={variant}
          defaultOpen={variant === 'picker' ? index === 0 : false}
        />
      ))}
    </ol>
  );
}
