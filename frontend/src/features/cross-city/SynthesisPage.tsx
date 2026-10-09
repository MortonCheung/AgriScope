import { assetUrl } from '../../domain/research/v2/repository';
import { ROUTES } from '../../app/routes';
import { TransitionLink } from '../../app/pageNavigation';
import { DataTable } from '../research-v2/DataTable';
import { V2Figure } from '../research-v2/Figure';
import { MarkdownBlocks } from '../research-v2/blocks';
import { renderInline, stripListPrefix } from '../research-v2/markdown';
import { useArticle, useTable } from '../research-v2/useV2';
import './cross-city.css';

/**
 * 六城综合研究专题（Frontend V3 §26）。
 *
 * 一个**放在研究中心一级入口**上的专题页，不是藏在 A11 模块里的文章：
 * 以 A11「辽宁六城农业市场周期、气象响应与区域差异研究」的真实内容做 hero 版式呈现
 * —— 标题 / 摘要 / 关键发现 / 图 / 表 / 局限，全部来自 article.json，前端不改写结论。
 */

const CITY_ID = 'cross_city';

function SynthesisTable({ file }: { file: string }) {
  const table = useTable(CITY_ID, file);
  if (table.status === 'loading') return <div className="cx-detail__skeleton" aria-hidden role="status" aria-label="数据表加载中" />;
  if (table.status === 'error') return null;
  return <DataTable table={table.data} caption="研究侧原始表（A11）" filterColumn={table.data.columns.includes('crop') ? 'crop' : undefined} />;
}

export function SynthesisPage() {
  const articleState = useArticle(CITY_ID, 'A11');
  const article = articleState.status === 'ready' ? articleState.data : null;

  return (
    <main className="ag-page">
      <div className="ag-container cross-city">
        <header className="ag-section__head">
          <p className="ag-label">六城综合研究 · A11</p>
          <h1 className="ag-hero">{article?.title ?? '辽宁六城农业市场周期、气象响应与区域差异研究'}</h1>
          {article?.frontend_summary && <p className="ag-lead">{article.frontend_summary}</p>}
          <p className="cx-back">
            <TransitionLink className="research-center__city-link" to={ROUTES.researchCenter}>← 返回研究中心</TransitionLink>
          </p>
        </header>

        {articleState.status === 'loading' && <p className="ag-body-secondary" aria-busy="true">六城综合研究载入中</p>}
        {articleState.status === 'error' && (
          <p className="ag-body" role="alert">六城综合研究读取失败；不展示占位内容。</p>
        )}

        {article && (
          <>
            <section className="ag-section" aria-labelledby="syn-abstract">
              <div className="ag-section__head">
                <h2 className="ag-section-title" id="syn-abstract">摘要</h2>
              </div>
              <MarkdownBlocks source={article.abstract} />
            </section>

            <section className="ag-section" aria-labelledby="syn-findings">
              <div className="ag-section__head">
                <h2 className="ag-section-title" id="syn-findings">关键发现</h2>
                <p className="ag-caption">以下为研究侧导出的关键发现小标题（研究侧未随附小节正文，前端不代写）。</p>
              </div>
              <ul className="cx-findings">
                {article.key_findings.map((finding, index) => <li key={index}>{finding.heading}</li>)}
              </ul>
            </section>

            <section className="ag-section" aria-labelledby="syn-figure">
              <div className="ag-section__head">
                <h2 className="ag-section-title" id="syn-figure">研究总览图</h2>
              </div>
              <V2Figure src={assetUrl.figure(CITY_ID, 'cross_city_overview.png')} alt="A11 六城综合研究总览图" index={1} />
            </section>

            <section className="ag-section" aria-labelledby="syn-result">
              <div className="ag-section__head">
                <h2 className="ag-section-title" id="syn-result">研究结果</h2>
              </div>
              {article.sections.map((section) => (
                <div className="cx-section" key={section.number}>
                  <h3 className="cx-section__title">{section.title}</h3>
                  <MarkdownBlocks source={section.content} />
                </div>
              ))}
            </section>

            <section className="ag-section" aria-labelledby="syn-tables">
              <div className="ag-section__head">
                <h2 className="ag-section-title" id="syn-tables">数据表</h2>
                <p className="ag-body-secondary">A11 声明的导出表，逐列沿用研究受限列名。</p>
              </div>
              {article.tables.map((table) => <SynthesisTable key={table.file} file={table.file} />)}
            </section>

            <section className="ag-section" aria-labelledby="syn-limits">
              <div className="ag-section__head">
                <h2 className="ag-section-title" id="syn-limits">研究局限</h2>
              </div>
              <ul className="cx-limits">
                {article.limitations.map((item, index) => <li key={index}>{renderInline(stripListPrefix(item), `syn-lim-${index}`)}</li>)}
              </ul>
            </section>

            <section className="ag-section" aria-labelledby="syn-conclusion">
              <div className="ag-section__head">
                <h2 className="ag-section-title" id="syn-conclusion">结论</h2>
              </div>
              <MarkdownBlocks source={article.conclusion} />
            </section>
          </>
        )}
      </div>
    </main>
  );
}