import type { V2Article } from '../../domain/research/v2/types';
import { readExplorer } from '../../domain/research/runtime/catalog';
import { MarkdownBlocks } from './blocks';
import { renderInline } from './markdown';

/**
 * NOT_SUPPORTED 正式状态（Frontend V3 §24 / §7）。
 *
 * 这不是错误页，也不是"暂无数据 :("。它要正面回答四件事：
 *   1. 研究侧**判定**是什么（`status` + `explorer.reason`，原句）；
 *   2. 缺失的是什么数据（`explorer.limitations`，研究侧原文）；
 *   3. 现有摘要与研究问题（`frontend_summary` / `title`）；
 *   4. 因此**不生成**什么结论 —— 只复述研究侧已写明的判定，前端不追加解释。
 *
 * 全文任何一句都来自研究侧导出；本组件不补写、不推测、不软化判定。
 */
export function NotSupportedResearchState({ article, moduleId }: {
  article: V2Article;
  moduleId: string;
}) {
  const explorer = readExplorer(article);
  const reason = explorer?.reason ?? '';
  const limitations = explorer?.limitations ?? [];
  const methodology = explorer?.methodology ?? '';

  return (
    <section className="module-workspace__unsupported" aria-labelledby="not-supported-title">
      <p className="ag-label">研究侧判定</p>
      <h2 className="ag-section-title" id="not-supported-title">当前数据不足以支持本研究</h2>
      <p className="ag-body-secondary">
        研究模块 <strong>{moduleId}</strong> 的正式状态为 <code>{article.status}</code>
        。以下内容逐字来自研究侧导出，平台不补充判断。
      </p>

      {reason && (
        <div className="module-workspace__unsupported-block">
          <h3 className="module-workspace__unsupported-heading">研究侧给出的原因</h3>
          <MarkdownBlocks source={reason} />
        </div>
      )}

      {limitations.length > 0 && (
        <div className="module-workspace__unsupported-block">
          <h3 className="module-workspace__unsupported-heading">缺失或受限的数据</h3>
          <ul className="research__list">
            {limitations.map((item, index) => (
              <li key={`limitation-${index}`}>{renderInline(item, `limitation-${index}`)}</li>
            ))}
          </ul>
        </div>
      )}

      {article.frontend_summary && (
        <div className="module-workspace__unsupported-block">
          <h3 className="module-workspace__unsupported-heading">研究侧摘要</h3>
          <p className="ag-body">{renderInline(article.frontend_summary, 'unsupported-summary')}</p>
        </div>
      )}

      {article.abstract && (
        <div className="module-workspace__unsupported-block">
          <h3 className="module-workspace__unsupported-heading">摘要（原文）</h3>
          <MarkdownBlocks source={article.abstract} />
        </div>
      )}

      {methodology && (
        <div className="module-workspace__unsupported-block">
          <h3 className="module-workspace__unsupported-heading">方法与数据口径</h3>
          <MarkdownBlocks source={methodology} />
        </div>
      )}

      <p className="ag-caption">
        因此本研究不生成市场响应结论。可查看本城市状态为可用（非 NOT_SUPPORTED）的其他模块，
        或查看完整文章了解研究侧的数据核查过程。
      </p>
    </section>
  );
}