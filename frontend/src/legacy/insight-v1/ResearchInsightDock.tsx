import { useMemo, useState } from 'react';
import { EvidenceBadge, StatusBadge } from '../../components/EvidenceBadge';
import type { ResearchPoint } from '../../domain/research/types';
import { useResearchContextStore } from './researchContextStore';
import './insight.css';

/**
 * 研究解读（Research Insight Dock）。
 *
 * 只能解释当前页面上已经存在的内容：当前研究点、结论、证据等级、核心数字、
 * 方法、限制、当前图表与当前选择。它不会生成新的研究结论，也不会把弱证据说强。
 * 它以结构化的"当前研究上下文"呈现内容，不伪装成对话式的问答。
 */
export function ResearchInsightDock({ point }: { point: ResearchPoint }) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<string | null>(null);
  const context = useResearchContextStore();

  const sections = useMemo(() => ([
    { id: 'point', label: '当前研究点', answer: `${point.id} · ${point.title}\n研究问题：${point.question}` },
    { id: 'conclusion', label: '当前结论', answer: `${point.conclusion}\n\n状态：${point.status === 'null_result' ? '阴性结果（正式结论）' : point.status}；证据等级：${point.evidenceLevel}。` },
    { id: 'numbers', label: '核心数据', answer: point.keyNumbers.length ? point.keyNumbers.map((entry) => `${entry.label}：${entry.value}`).join('\n') : '该研究点没有登记核心数字。' },
    { id: 'method', label: '方法', answer: point.method ?? '该研究点没有登记方法说明。' },
    { id: 'limits', label: '限制', answer: point.limitations.length ? point.limitations.map((limit) => `· ${limit.text}`).join('\n') : '该研究点没有登记限制条目。' },
    { id: 'figure', label: '当前图表', answer: context.currentFigure ? `当前查看：${context.currentFigure}` : '当前没有选中的图表读数。' },
    { id: 'selection', label: '当前选择', answer: [context.selectedCrop && `品种：${context.selectedCrop}`, context.selectedVariable && `变量：${context.selectedVariable}`, context.selectedDateRangeOrWindow && `窗口：${context.selectedDateRangeOrWindow}`].filter(Boolean).join('；') || '尚未选择品种/变量/窗口。' },
  ]), [context.currentFigure, context.selectedCrop, context.selectedDateRangeOrWindow, context.selectedVariable, point]);

  const active = sections.find((section) => section.id === topic) ?? null;

  return (
    <div className="insight-dock" data-open={open || undefined}>
      <button type="button" className="insight-dock__trigger" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        研究解读
      </button>
      {open && (
        <aside className="insight-dock__panel" aria-label="研究解读">
          <header className="insight-dock__head">
            <div>
              <p className="ag-label">研究解读</p>
              <p className="insight-dock__scope">范围：本研究页 · {point.id} · {context.cityName ?? point.cityId}</p>
            </div>
            <button type="button" className="insight-dock__close" onClick={() => setOpen(false)} aria-label="关闭研究解读">关闭</button>
          </header>

          <div className="insight-dock__tags">
            <EvidenceBadge level={point.evidenceLevel} />
            <StatusBadge status={point.status} />
          </div>

          <ul className="insight-dock__topics">
            {sections.map((section) => (
              <li key={section.id}>
                <button type="button" data-active={topic === section.id || undefined} onClick={() => setTopic(section.id === topic ? null : section.id)}>
                  {section.label}
                </button>
              </li>
            ))}
          </ul>

          {active && <pre className="insight-dock__answer">{active.answer}</pre>}

          <p className="insight-dock__note">
            研究解读只解释当前页面上已有的研究内容，不会生成新结论、不会把弱证据说强、不会把情景写成事实。
          </p>
        </aside>
      )}
    </div>
  );
}
