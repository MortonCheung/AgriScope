import type { EvidenceLevelCode, ResearchEvidence, ResearchStatus } from './types';

/**
 * 证据等级与状态是研究内容层规范的一部分：
 * 阴性结果同样是正式结论，必须能正面表达，而不是只展示"显著发现"。
 */
export const EVIDENCE_LEVELS: Record<EvidenceLevelCode, ResearchEvidence & { rank: number }> = {
  A: { code: 'A', label: '直接观测', description: '由数据直接观测得到的事实，不依赖模型假设。', rank: 4 },
  B: { code: 'B', label: '统计关联', description: '统计检验得到的关联，包含阴性结果；不等于因果。', rank: 3 },
  C: { code: 'C', label: '机制一致', description: '与已知机制方向一致，但缺少直接数据验证。', rank: 2 },
  D: { code: 'D', label: '模型或情景', description: '来自模型估计或情景模拟，属于实验性结果。', rank: 1 },
  Unsupported: { code: 'Unsupported', label: '数据不支持', description: '当前数据无法给出结论。', rank: 0 },
};

export type StatusTone = 'observed' | 'negative' | 'descriptive' | 'exploratory' | 'unsupported';

export const STATUS_META: Record<ResearchStatus, { label: string; tone: StatusTone }> = {
  supported: { label: '获得支持', tone: 'observed' },
  null_result: { label: '阴性结果', tone: 'negative' },
  descriptive: { label: '描述性', tone: 'descriptive' },
  exploratory: { label: '探索性', tone: 'exploratory' },
  unsupported: { label: '数据不支持', tone: 'unsupported' },
};

export const STATUS_ORDER: ResearchStatus[] = ['supported', 'null_result', 'descriptive', 'exploratory', 'unsupported'];

export const EVIDENCE_ORDER: EvidenceLevelCode[] = ['A', 'B', 'C', 'D', 'Unsupported'];

export function parseEvidenceLevel(raw: string): EvidenceLevelCode {
  const match = /([ABCD])\b/.exec(raw ?? '');
  if (match && match[1] in EVIDENCE_LEVELS) return match[1] as EvidenceLevelCode;
  if (/unsupported/i.test(raw ?? '')) return 'Unsupported';
  return 'Unsupported';
}

export function parseStatus(raw: string): ResearchStatus {
  const value = (raw ?? '').trim();
  if (value in STATUS_META) return value as ResearchStatus;
  return 'exploratory';
}

export function evidenceBadge(code: EvidenceLevelCode): string {
  return code === 'Unsupported' ? '数据不支持' : `证据 ${code} · ${EVIDENCE_LEVELS[code].label}`;
}

export function statusBadge(status: ResearchStatus): string {
  return STATUS_META[status].label;
}
