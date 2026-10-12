import type { V2Article } from '../../domain/research/v2/types';
import { MarkdownBlocks } from './blocks';
import { renderInline } from './markdown';
import { productText } from '../report/productContent';

/** Retain the published overview without development-status or limitation panels. */
export function NotSupportedResearchState({ article }: { article: V2Article; moduleId: string }) {
  const summary = productText(article.frontend_summary);
  return <section className="module-workspace__unsupported" aria-label="研究概览">
    {summary ? <p className="ag-body">{renderInline(summary, 'overview')}</p> : <MarkdownBlocks source={productText(article.abstract)} />}
  </section>;
}
