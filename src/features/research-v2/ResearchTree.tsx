import { useState } from 'react';
import { Link } from 'react-router-dom';
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
   * index：城市页上的完整两层树（默认全部展开）。
   * rail：研究页左侧的紧凑树（默认只展开当前方向）。
   */
  variant: 'index' | 'rail';
}

function PointRow({ cityId, point, current }: { cityId: string; point: ResearchPoint; current: boolean }) {
  return (
    <li className="tree__point" data-current={current || undefined}>
      <Link className="tree__point-link" to={ROUTES.research(cityId, point.id)}>
        <span className="tree__point-id">{point.id}</span>
        <span className="tree__point-title">{point.title}</span>
      </Link>
    </li>
  );
}

function TopicBlock({ cityId, topic, currentTopicId, currentPointId, variant }: {
  cityId: string;
  topic: ResearchTopic;
  currentTopicId?: string;
  currentPointId?: string;
  variant: 'index' | 'rail';
}) {
  const containsCurrent = topic.id === currentTopicId
    || topic.points.some((point) => point.id === currentPointId);
  const [open, setOpen] = useState(variant === 'index' ? true : containsCurrent);

  return (
    <li className="tree__topic" data-open={open || undefined} data-current={topic.id === currentTopicId || undefined}>
      <div className="tree__topic-head">
        <button
          type="button"
          className="tree__toggle"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="tree__topic-id">{topic.id}</span>
          <span className="tree__topic-title">{topic.title}</span>
        </button>
        <Link className="tree__topic-open" to={ROUTES.research(cityId, topic.id)} aria-label={`进入 ${topic.id}`}>→</Link>
      </div>
      {open && (
        <ol className="tree__points">
          {topic.points.map((point) => (
            <PointRow key={point.id} cityId={cityId} point={point} current={point.id === currentPointId} />
          ))}
        </ol>
      )}
    </li>
  );
}

/**
 * 城市研究树（本轮 §7/§8/§26）。
 *
 * 两级：方向（A1–A8）→ 研究点（A?.?）。
 * 组件完全由 catalog 驱动，不假设方向数量（铁岭可能是 6，朝阳可能是 10）。
 * 不做卡片墙、不做徽标墙：编辑式目录，直角、线性层级。
 */
export function ResearchTree({ cityId, topics, currentTopicId, currentPointId, variant }: ResearchTreeProps) {
  return (
    <ol className="tree" data-variant={variant}>
      {topics.map((topic) => (
        <TopicBlock
          key={topic.id}
          cityId={cityId}
          topic={topic}
          currentTopicId={currentTopicId}
          currentPointId={currentPointId}
          variant={variant}
        />
      ))}
    </ol>
  );
}
