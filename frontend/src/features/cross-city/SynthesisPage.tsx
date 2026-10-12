import { assetUrl } from '../../domain/research/v2/repository';
import { ROUTES } from '../../app/routes';
import { usePageNavigate } from '../../app/pageNavigation';
import { WorkbenchLayout, WorkbenchMain, WorkbenchRail } from '../../components/workbench/WorkbenchLayout';
import { ReportNavigation } from '../report/ReportNavigation';
import { productSections, productText } from '../report/productContent';
import { DataTable } from '../research-v2/DataTable';
import { V2Figure } from '../research-v2/Figure';
import { MarkdownBlocks } from '../research-v2/blocks';
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
  return <DataTable table={table.data} caption="研究数据" filterColumn={table.data.columns.includes('crop') ? 'crop' : undefined} />;
}

export function SynthesisPage() {
  const navigate = usePageNavigate();
  const articleState = useArticle(CITY_ID, 'A11');
  const article = articleState.status === 'ready' ? articleState.data : null;

  return (
    <WorkbenchLayout className="report-workbench report-index-workbench" resetKey="synthesis" sidebarLabel="报告目录" railLabel="报告信息" onEscape={() => navigate(ROUTES.reports)} sidebar={close => <ReportNavigation close={close} />}><WorkbenchMain>
      <div className="cross-city">
        <header className="ag-section__head">
          <p className="ag-label">综合研究</p>
          <h1 className="ag-hero">{article?.title ?? '辽宁六城农业市场周期、气象响应与区域差异研究'}</h1>
          {article?.frontend_summary && <p className="ag-lead">{productText(article.frontend_summary)}</p>}
        </header>

        {articleState.status === 'loading' && <p className="ag-body-secondary" aria-busy="true">六城综合研究载入中</p>}
        {articleState.status === 'error' && (
          <p className="ag-body" role="alert">综合研究读取失败，请稍后重试。</p>
        )}

        {article && (
          <>
            <section className="ag-section" aria-labelledby="syn-abstract">
              <div className="ag-section__head">
                <h2 className="ag-section-title" id="syn-abstract">摘要</h2>
              </div>
              <MarkdownBlocks source={productText(article.abstract)} />
            </section>

            <section className="ag-section" aria-labelledby="syn-findings">
              <div className="ag-section__head">
                <h2 className="ag-section-title" id="syn-findings">关键发现</h2>
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
              {productSections(article.sections).map((section) => (
                <div className="cx-section" key={section.number}>
                  <h3 className="cx-section__title">{section.title}</h3>
                  <MarkdownBlocks source={section.content} />
                </div>
              ))}
            </section>

            <section className="ag-section" aria-labelledby="syn-tables">
              <div className="ag-section__head">
                <h2 className="ag-section-title" id="syn-tables">数据表</h2>
              </div>
              {article.tables.map((table) => <SynthesisTable key={table.file} file={table.file} />)}
            </section>

            <section className="ag-section" aria-labelledby="syn-conclusion">
              <div className="ag-section__head">
                <h2 className="ag-section-title" id="syn-conclusion">结论</h2>
              </div>
              <MarkdownBlocks source={productText(article.conclusion)} />
            </section>
          </>
        )}
      </div>
    </WorkbenchMain><WorkbenchRail>{null}</WorkbenchRail></WorkbenchLayout>
  );
}
