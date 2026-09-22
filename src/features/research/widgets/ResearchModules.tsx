import { ResearchFigure } from '../../../components/ResearchFigure';
import type { CityResearchIndex, ResearchPoint } from '../../../domain/research/types';
import { buildResearchModules, fallbackTable } from './registry';
import { TableExplorer } from './TableExplorer';
import './widgets.css';

/**
 * 交互研究体：渐进披露 现象 → 分析 → 方法与限制。
 * 第一屏不谈 Pearson / HAC / AR(1)；方法名放在最后一层，需要时再展开。
 */
export function InteractiveResearchBody({ index, point }: { index: CityResearchIndex; point: ResearchPoint }) {
  const modules = buildResearchModules(index, point);
  const fallback = fallbackTable(point);

  return (
    <div className="research-modules">
      <section className="research-modules__step">
        <header className="research-modules__step-head">
          <span className="research-modules__step-index">01</span>
          <h2 className="research-modules__step-title">现象</h2>
        </header>
        {point.frontendText && <p className="research-modules__step-note">{point.frontendText}</p>}
        <div className="ag-grid ag-grid--2">
          {point.figures.map((figure) => (
            <ResearchFigure
              key={figure.id}
              src={figure.src}
              alt={point.title}
              caption={figure.caption}
              source={figure.source}
              evidenceLevel={figure.evidenceLevel}
            />
          ))}
        </div>
      </section>

      <section className="research-modules__step">
        <header className="research-modules__step-head">
          <span className="research-modules__step-index">02</span>
          <h2 className="research-modules__step-title">分析</h2>
        </header>
        {modules.length > 0 ? modules.map((module) => (
          <div key={module.id} className="research-modules__module">{module.node}</div>
        )) : fallback ? (
          <TableExplorer
            title="支撑该研究点的研究表"
            source={fallback}
            evidenceLevel={point.evidenceLevel}
          />
        ) : (
          <p className="ag-meta">该研究点没有登记可交互的研究表。</p>
        )}
      </section>

      <section className="research-modules__step">
        <header className="research-modules__step-head">
          <span className="research-modules__step-index">03</span>
          <h2 className="research-modules__step-title">方法与限制</h2>
        </header>
        <dl className="ag-deflist">
          {point.data && <div className="ag-deflist__item"><dt>数据</dt><dd>{point.data}</dd></div>}
          {point.method && <div className="ag-deflist__item"><dt>方法</dt><dd>{point.method}</dd></div>}
          {point.why && <div className="ag-deflist__item"><dt>为什么研究</dt><dd>{point.why}</dd></div>}
        </dl>
        {point.limitations.length > 0 && (
          <div className="research-modules__limits">
            <p className="ag-label">研究限制</p>
            <ul>
              {point.limitations.map((limit) => <li key={limit.text}>{limit.text}</li>)}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
