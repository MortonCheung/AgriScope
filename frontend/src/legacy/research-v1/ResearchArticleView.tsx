import type { ReactNode } from 'react';
import type { ResearchArticle } from '../../domain/research/types';
import './article.css';

/**
 * 原文模式：研究出版物式排版，不加卡片。
 * 内容直接来自研究正文，前端不做任何改写。
 */

function figureSrcFrom(path: string): string {
  const name = path.split('/').pop() ?? path;
  return `/research/shenyang/figures/${name}`;
}

/** 行内标记：**强调** 与 `代码`。 */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) nodes.push(<strong key={`${keyPrefix}-b${index}`}>{token.slice(2, -2)}</strong>);
    else nodes.push(<code key={`${keyPrefix}-c${index}`}>{token.slice(1, -1)}</code>);
    last = match.index + token.length;
    index += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderTable(rows: string[], key: string) {
  const header = rows[0].split('|').slice(1, -1).map((cell) => cell.trim());
  const body = rows.slice(2).map((row) => row.split('|').slice(1, -1).map((cell) => cell.trim()));
  return (
    <div className="article-table-wrap" key={key}>
      <table className="ag-table article-table">
        <thead><tr>{header.map((cell, index) => <th key={index}>{cell}</th>)}</tr></thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{inline(cell, `${key}-${rowIndex}-${cellIndex}`)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderLines(lines: string[], keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let index = 0;
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length === 0) return;
    nodes.push(<p className="article-p" key={`${keyPrefix}-p${index}`}>{inline(paragraph.join(''), keyPrefix)}</p>);
    paragraph = [];
    index += 1;
  };
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { flush(); index += 1; continue; }
    if (line.startsWith('|')) {
      flush();
      const rows: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) { rows.push(lines[index].trim()); index += 1; }
      nodes.push(renderTable(rows, `${keyPrefix}-t${index}`));
      continue;
    }
    if (/^(\d+\.|[-*])\s/.test(line)) {
      flush();
      const items: string[] = [];
      while (index < lines.length && /^(\d+\.|[-*])\s/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^(\d+\.|[-*])\s/, ''));
        index += 1;
      }
      nodes.push(<ul className="article-list" key={`${keyPrefix}-l${index}`}>{items.map((item, i) => <li key={i}>{inline(item, `${keyPrefix}-li${i}`)}</li>)}</ul>);
      continue;
    }
    const images = line.split('　').map((part) => part.trim()).filter(Boolean);
    if (images.length > 0 && images.every((part) => /^!\[[^\]]*\]\([^)]+\)$/.test(part))) {
      flush();
      nodes.push(
        <div className="article-figures" key={`${keyPrefix}-f${index}`}>
          {images.map((part, i) => {
            const match = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(part);
            if (!match) return null;
            return <figure key={i}><img src={figureSrcFrom(match[2])} alt={match[1] || '研究图'} loading="lazy" /><figcaption>{match[1]}</figcaption></figure>;
          })}
        </div>,
      );
      index += 1;
      continue;
    }
    paragraph.push(line);
    index += 1;
  }
  flush();
  return nodes;
}

export function ResearchArticleView({ article }: { article: ResearchArticle }) {
  return (
    <article className="research-article">
      <header className="research-article__head">
        <h2 className="ag-section-title">{article.title}</h2>
      </header>
      <div className="research-article__body">
        {article.blocks.map((block, index) => (
          <section className="article-block" key={index} id={block.heading ? `section-${index}` : undefined}>
            {block.heading && <h3 className="article-h3" id={`h-${index}`}>{block.heading}</h3>}
            {renderLines(block.lines, `b${index}`)}
          </section>
        ))}
      </div>
    </article>
  );
}
