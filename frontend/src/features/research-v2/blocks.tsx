import { useMemo } from 'react';
import { VOLUME_UNIT_NOTE } from '../../domain/research/v2/metrics';
import { useTable } from './useV2';
import { DataTable } from './DataTable';
import { parseMarkdownBlocks, renderInline } from './markdown';

/**
 * 研究正文的区块渲染（研究页与报告页共用）。
 *
 * 只解析研究正文真实用到的四种行内语法（见 markdown.tsx），
 * 不做任何内容改写：`refs` 只把正文里的文件名换成已渲染资产的编号。
 */

/** 只有出现成交量类表时才配口径注；成交量口径一次就够（§14）。 */
function tableNote(file: string): string | undefined {
  return /price_volume|daily_response|seasonal|trend|lag|forecast|accumulation/i.test(file)
    ? VOLUME_UNIT_NOTE
    : undefined;
}

/** 一节里被点名的资产落位渲染。 */
export function TableAsset({ cityId, file, caption }: { cityId: string; file: string; caption: string }) {
  const table = useTable(cityId, file);
  if (table.status === 'loading') return <div className="research__asset-skeleton" aria-hidden />;
  if (table.status === 'error') return null;
  return <DataTable table={table.data} caption={caption} filterColumn="crop" note={tableNote(file)} />;
}

/**
 * 研究侧原句（引文）。
 *
 * 引文进的是界面，所以必须和正文走同一套行内规则：
 * 研究常写成「显著（表 `A02_daily_response.csv`）：」，原样渲染就会把
 * 数据文件名和 `**` 一起露给读者（§38 红线）。这里统一过 `renderInline`。
 *
 * 另外：引文若是「……显著（表 `x.csv`）：」这种**引出下文表格**的句式，
 * 去掉内部引用后会剩下一个悬空的冒号，读起来像被截断。展示层收掉这个尾标点；
 * 目录里保存的引文仍是逐字原文，完整性校验不受影响。
 */
export function ResearchQuote({ quote, cite, className = 'research__quote' }: {
  quote: string;
  cite: string;
  className?: string;
}) {
  const body = quote.replace(/[：:]\s*$/, '');
  return (
    <blockquote className={className}>
      {renderInline(body, 'q')}
      <cite>{cite}</cite>
    </blockquote>
  );
}

export function MarkdownBlocks({ source, refs }: { source: string; refs?: Map<string, string> }) {
  const blocks = useMemo(() => parseMarkdownBlocks(source), [source]);
  return (
    <>
      {blocks.map((block, index) => {
        const key = `md-${index}`;
        if (block.kind === 'heading') {
          const Tag = block.level <= 3 ? 'h3' : 'h4';
          return <Tag key={key} className="research__subheading">{renderInline(block.text, key, refs)}</Tag>;
        }
        if (block.kind === 'list') {
          return (
            <ul key={key} className="research__list">
              {block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`, refs)}</li>)}
            </ul>
          );
        }
        if (block.kind === 'table') {
          return (
            <div key={key} className="research__inline-table">
              <table>
                <thead><tr>{block.header.map((cell, cellIndex) => <th key={cellIndex}>{renderInline(cell, `${key}-h${cellIndex}`, refs)}</th>)}</tr></thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{renderInline(cell, `${key}-${rowIndex}-${cellIndex}`, refs)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p key={key} className="research__paragraph">{renderInline(block.text, key, refs)}</p>;
      })}
    </>
  );
}
