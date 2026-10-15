import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ResearchPoint, ResearchTopic } from '../../domain/research/catalog';
import { ROUTES } from '../../app/routes';
import { MOTION_DURATION, MOTION_EASE } from '../../design/motion';
import './research-tree.css';
import { SelectionGroup } from '../../components/controls/SelectionGroup';

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
  /** Report navigation uses one local moving surface; legacy research keeps its styling. */
  animatedSelection?: boolean;
  /** A report city can own one surface across both tree and additional articles. */
  externalSelectionSurface?: boolean;
}

/** 展开/收起：height + opacity + translateY，220–300ms，尊重 prefers-reduced-motion（§20）。 */
const pointVariants = {
  closed: { opacity: 0, y: -2, transition: { duration: MOTION_DURATION.fast } },
  open: (index: number) => ({ opacity: 1, y: 0, transition: { duration: MOTION_DURATION.fast, delay: Math.min(index, 4) * 0.016, ease: MOTION_EASE.out } }),
};

function StatusMark({ point }: { point: ResearchPoint }) {
  if (point.status === 'ready') return null;
  return <span className="tree__point-state" aria-hidden>{point.status === 'pending' ? '·' : '—'}</span>;
}

function PointRow({ cityId, point, current, selected, onSelect, index, reducedMotion }: {
  cityId: string;
  point: ResearchPoint;
  current: boolean;
  selected: boolean;
  onSelect?: (researchId: string) => void;
  index: number;
  reducedMotion: boolean;
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
      <motion.li className="tree__point" data-current={current || undefined} data-selected={selected || undefined} variants={reducedMotion ? undefined : pointVariants} custom={index}>
        <button
          type="button"
          className="tree__point-link"
          data-selection-value={point.id}
          aria-current={selected ? 'true' : undefined}
          onClick={() => onSelect(point.id)}
        >
          {inner}
        </button>
      </motion.li>
    );
  }

  return (
    <motion.li className="tree__point" data-current={current || undefined} data-selected={selected || undefined} variants={reducedMotion ? undefined : pointVariants} custom={index}>
      <Link className="tree__point-link" data-selection-value={point.id} to={ROUTES.research(cityId, point.id)} aria-current={current ? 'page' : undefined}>{inner}</Link>
    </motion.li>
  );
}

function TopicBlock({ cityId, topic, currentTopicId, currentPointId, selectedId, onSelect, variant, defaultOpen, animatedSelection }: {
  cityId: string;
  topic: ResearchTopic;
  currentTopicId?: string;
  currentPointId?: string;
  selectedId?: string;
  onSelect?: (researchId: string) => void;
  variant: 'rail' | 'picker';
  defaultOpen: boolean;
  animatedSelection: boolean;
}) {
  const reducedMotion = Boolean(useReducedMotion());
  const panelId = useId();
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
          data-selection-value={topic.id}
          aria-expanded={open}
          aria-controls={panelId}
          aria-current={topic.id === selectedId ? 'true' : undefined}
          onClick={handleHead}
        >
          <span className="tree__topic-id">{topic.id}</span>
          <span className="tree__topic-title">{topic.title}</span>
          {animatedSelection && <svg className="tree__chevron" width="12" height="12" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.25"><path d="m4 6 4 4 4-4"/></svg>}
        </button>
        {/* picker 里没有"进入 →"：进入研究只有一个入口，在右侧 Preview（§21/§22）。 */}
        {variant === 'rail' && (
          <Link className="tree__topic-open" to={ROUTES.research(cityId, topic.id)} aria-label={`进入 ${topic.id}`}>→</Link>
        )}
      </div>
      <div id={panelId} className="tree__points-clip" aria-hidden={!open} inert={!open}>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol
            className="tree__points"
            initial={reducedMotion ? false : 'closed'}
            animate="open"
            exit="closed"
            variants={{
              open: { height: 'auto', opacity: 1, y: 0, marginBottom: 12 },
              closed: { height: 0, opacity: 0, y: -4, marginBottom: 0 },
            }}
            transition={{ duration: reducedMotion ? 0 : MOTION_DURATION.normal, ease: MOTION_EASE.out }}
            style={{ overflow: 'hidden' }}
          >
            {topic.points.map((point, index) => (
              <PointRow
                key={point.id}
                cityId={cityId}
                point={point}
                current={point.id === currentPointId}
                selected={point.id === selectedId}
                onSelect={onSelect}
                index={index}
                reducedMotion={reducedMotion}
              />
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
      </div>
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
  cityId, topics, currentTopicId, currentPointId, variant, selectedId, onSelect, animatedSelection = false, externalSelectionSurface = false,
}: ResearchTreeProps) {
  const entries = topics.map((topic, index) => (
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
          animatedSelection={animatedSelection}
        />
      ));
  return animatedSelection && !externalSelectionSurface ? <SelectionGroup as="ol" className="tree" data-variant={variant} data-moving-selection value={selectedId ?? currentPointId ?? currentTopicId}>{entries}</SelectionGroup>
    : <ol className="tree" data-variant={variant} data-moving-selection={animatedSelection || undefined}>{entries}</ol>;
}
