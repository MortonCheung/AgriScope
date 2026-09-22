import { Fragment, type ReactNode } from 'react';

/**
 * 有限 markdown 解析（V5 §33 的现实退化）。
 *
 * v2 的 `sections[].content` **本身就是 markdown 字符串**（见 docs/SHENYANG_V2_FRONTEND_AUDIT.md §4），
 * 所以"完全不解析"在这一版数据上做不到。这里的边界是：
 *
 *   只解析研究侧**实际用到**的 4 种语法 —— `###` 小标题、`- ` 列表、`| 表格 |`、行内 `**加粗**` 与 `` `代码` ``；
 *   其余一律按普通段落原样呈现，**不推断语义、不补结构、不生成内容**。
 *
 * 也就是说：这是渲染层的转述，不是内容创作。
 */

export type MdBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; header: string[]; rows: string[][] };

const HEADING = /^(#{1,4})\s+(.*)$/;
const LIST_ITEM = /^[-*]\s+(.*)$/;
const TABLE_ROW = /^\|(.+)\|$/;

function splitRow(line: string): string[] {
  const inner = TABLE_ROW.exec(line.trim());
  if (!inner) return [];
  return inner[1].split('|').map((cell) => cell.trim());
}

function isDivider(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell));
}

export function parseMarkdownBlocks(source: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = source.split('\n');
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', text: paragraph.join(' ').trim() });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ kind: 'list', items: list });
      list = [];
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') { flushParagraph(); flushList(); continue; }
    // 引用块在研究正文里只承担"内部路径说明"，不面向读者；忽略它就不会把 .md/.csv 带进界面（§38）。
    if (trimmed.startsWith('>')) { flushParagraph(); flushList(); continue; }

    const heading = HEADING.exec(trimmed);
    if (heading) {
      flushParagraph(); flushList();
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2].trim() });
      continue;
    }

    if (TABLE_ROW.test(trimmed)) {
      flushParagraph(); flushList();
      const header = splitRow(trimmed);
      const rows: string[][] = [];
      let cursor = i + 1;
      // 分隔行可有可无；有就跳过。
      if (cursor < lines.length && isDivider(splitRow(lines[cursor]))) cursor += 1;
      while (cursor < lines.length && TABLE_ROW.test(lines[cursor].trim())) {
        rows.push(splitRow(lines[cursor]));
        cursor += 1;
      }
      i = cursor - 1;
      blocks.push({ kind: 'table', header, rows });
      continue;
    }

    const item = LIST_ITEM.exec(trimmed);
    if (item) {
      flushParagraph();
      const previous = lines[i - 1]?.trim();
      // 续行（缩进但没有列表符号）并回上一项。
      if (previous && previous !== '' && !LIST_ITEM.test(previous) && list.length > 0) {
        list[list.length - 1] = `${list[list.length - 1]} ${item[1].trim()}`;
      } else {
        list.push(item[1].trim());
      }
      continue;
    }

    if (list.length > 0 && /^\s{2,}/.test(line)) {
      list[list.length - 1] = `${list[list.length - 1]} ${trimmed}`;
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks;
}

/** 数据文件名（含扩展名）：可见文本里绝不能出现（V5 §38）。 */
const FILE_LIKE = /\.(csv|md|png|json|txt)$/i;
/** 正文里**没有加反引号**的文件名同样要处理（研究正文两种写法都有）。 */
const FILE_IN_TEXT = /[A-Za-z0-9_./-]+\.(?:csv|md|png|json|txt)\b/gi;

/**
 * 行内语法：只认 `**加粗**` 与 `` `代码` ``，其余原样。
 *
 * 数据文件名（V5 §38 红线）在两种写法下都不许进界面：
 *   - 能对应到已渲染资产 → 换成编号（`表 2` / `图 1`），引用仍然可读；
 *   - 对应不上 → 直接不渲染，绝不把文件名露给用户。
 */
export function renderInline(text: string, keyPrefix = 'i', refs?: Map<string, string>): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter((part) => part !== '');
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) {
      const inner = part.slice(1, -1);
      if (FILE_LIKE.test(inner)) {
        const label = refs?.get(inner);
        return label ? <span key={key} className="md-ref">{label}</span> : null;
      }
      return <code key={key}>{inner}</code>;
    }
    const matches = part.match(FILE_IN_TEXT) ?? [];
    if (matches.length === 0) return <span key={key}>{part}</span>;
    const segments = part.split(FILE_IN_TEXT);
    return (
      <span key={key}>
        {segments.map((segment, segmentIndex) => (
          <Fragment key={segmentIndex}>
            {segment}
            {matches[segmentIndex] && (() => {
              const label = refs?.get(matches[segmentIndex]);
              return label ? <span className="md-ref">{label}</span> : null;
            })()}
          </Fragment>
        ))}
      </span>
    );
  });
}
