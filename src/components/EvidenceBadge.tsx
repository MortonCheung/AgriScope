import { EVIDENCE_LEVELS, STATUS_META } from '../domain/research/evidence';
import type { EvidenceLevelCode, ResearchStatus } from '../domain/research/types';

/** 证据等级徽标：统一视觉表示，不简化为"高/中/低"。 */
export function EvidenceBadge({ level, compact = false }: { level: EvidenceLevelCode; compact?: boolean }) {
  const meta = EVIDENCE_LEVELS[level];
  return (
    <span className="ag-badge" data-tone={level === 'Unsupported' ? 'unsupported' : level === 'A' ? 'observed' : 'negative'} title={meta.description}>
      {compact ? `证据 ${level}` : `证据 ${level} · ${meta.label}`}
    </span>
  );
}

/** 研究状态徽标：阴性结果与"获得支持"同等正式。 */
export function StatusBadge({ status }: { status: ResearchStatus }) {
  const meta = STATUS_META[status];
  return <span className="ag-badge" data-tone={meta.tone}>{meta.label}</span>;
}
