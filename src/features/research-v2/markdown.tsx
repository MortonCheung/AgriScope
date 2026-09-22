import { Fragment, type ReactNode } from 'react';
import { GLOSS_UNWRAP, PROSE_ENUM_REPLACEMENTS, PROSE_TOKEN_CANDIDATES, proseTerm } from '../../domain/research/v2/metrics';

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
const FILE_LIKE = /\.(csv|md|png|json|txt|parquet)$/i;
/** 正文里**没有加反引号**的文件名同样要处理（研究正文两种写法都有）。 */
const FILE_IN_TEXT = /[A-Za-z0-9_./-]+\.(?:csv|md|png|json|txt|parquet)\b/gi;
/** 内部路径与 URL：`results/metrics/…`、`data/x.parquet`、`https://…`（§37/§38 红线）。 */
const PATH_LIKE = /(:\/\/)|(^[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+$)/;
/** 内部标记：`is_core=False`、`volume_unit=unknown` 这类键值对。 */
const FLAG_LIKE = /^[A-Za-z_][A-Za-z_0-9]*\s*=\s*[A-Za-z_][A-Za-z_0-9]*$/;
/** 公式与统计记号：这些是标准写法，按 §76 允许保留（且必须处在中文语境）。 */
const NOTATION = /[=→←~·×±÷≤≥≠∑ΣαβγδεζηθκλμνξπρσςτφχψωΩ]|_\*|_\(|_[a-zA-Z]\b|_[0-9]|^(mean|median|log|exp|sd|max|min)\(/;
/** 判断"这一段像不像公式"：有数学符号又没有中文，就不动它。 */
const MATH_SYMBOL = /[=→←~·×±÷≤≥∑ΣαβγδεζηθκλμνξπρσςτφχψωΩ]/;
const CJK = /[\u4e00-\u9fff]/;
/** 丢弃内部标记后可能留下空括号，一并收掉。 */
const EMPTY_BRACKETS = /[（(]\s*[）)]/g;
/** 括号组（不含嵌套）；研究用括号承载内部交接说明与术语定义。 */
const BRACKET_GROUP = /[（(]([^（）\n]{1,240})[）)]/g;
/** 每组里的反引号标识符。 */
const BACKTICK_IN_GROUP = /`([^`\n]+)`/g;
/** 裸标识符（没有加反引号）的替换式：由受控词表拼出，长词优先。 */
const BARE_TERM = new RegExp(`(?<![A-Za-z0-9_])(${PROSE_TOKEN_CANDIDATES.join('|')})(?![A-Za-z0-9_])`, 'g');
/**
 * 正文里没加反引号的内部键值标记（例：`robust=True`）。
 * 值必须以字母开头，因此 `p=0.057`、`k=1..14` 这类统计记号不会被误删。
 */
const BARE_FLAG = /(?<![A-Za-z0-9_])[A-Za-z_][A-Za-z_0-9]*=[A-Za-z_][A-Za-z_0-9]*(?![A-Za-z0-9_])/g;

/** 研究写成「`标识符`（中文定义）」时，直接留下中文定义（V5 §76）。 */
const TERM_WITH_GLOSS = /`([^`\n]+)`（([^（）\n]{1,140})）/g;

function applyProseEnums(text: string): string {
  let out = text;
  for (const [pattern, label] of PROSE_ENUM_REPLACEMENTS) out = out.replace(pattern, label);
  return out;
}

function unwrapGlosses(text: string): string {
  return text.replace(TERM_WITH_GLOSS, (whole, token: string, gloss: string) =>
    (GLOSS_UNWRAP.has(token.trim()) ? gloss : whole));
}

/** 内部交接标记：路径 / URL / 键值对 / 无编号可用的文件名 / 以下划线开头的片段。 */
function isInternalToken(token: string, refs?: Map<string, string>): boolean {
  if (FILE_LIKE.test(token)) return !(refs?.has(token) ?? false);
  return PATH_LIKE.test(token) || FLAG_LIKE.test(token) || token.startsWith('_');
}

/**
 * 裸标识符（没有加反引号的英文工程名）→ 中文。
 * 只替换受控词表里的词，且用词边界卡住下划线，所以 `weather_t`、`price_lag1`
 * 这类公式记号不会被拆开；整段像公式的（有数学符号且没有中文）直接跳过。
 */
function translateBare(text: string): string {
  const withoutFlags = text.replace(BARE_FLAG, '');
  if (MATH_SYMBOL.test(withoutFlags) && !CJK.test(withoutFlags)) return withoutFlags;
  return withoutFlags.replace(BARE_TERM, (whole, token: string) => proseTerm(token) ?? whole);
}

/**
 * 处理括号组（V5 §38/§76）。
 *
 * 研究正文的括号有两种用途，必须分开处理：
 *   · 「（表 `x.csv` 的 `_loo` 对照见 `data/….parquet`）」这类是**内部交接说明**，
 *     读者不需要它；只删掉内部标记会留下半句话（「的 对照见 」），所以整组一起去掉；
 *   · 「（生长季累计降水，mm）」这类是**术语定义**，要留下。
 * 判据很简单：组里出现了内部标记就整组去掉，否则原样保留。
 */
function dropInternalParentheticals(text: string, refs?: Map<string, string>): string {
  return text.replace(BRACKET_GROUP, (whole, inner: string) => {
    const tokens = [...inner.matchAll(BACKTICK_IN_GROUP)].map((match) => match[1].trim());
    if (tokens.some((token) => isInternalToken(token, refs))) return '';
    return whole;
  });
}

/**
 * 一个反引号标识符该变成什么（V5 §76）：
 *   · 文件名 → 已渲染资产的编号（`表 2` / `图 1`），对不上就不渲染；
 *   · 内部路径 / URL / 键值对 → 不渲染；
 *   · 有受控中文名的列名或取值 → 中文名；
 *   · 公式与统计记号 → 原样保留（`<code>`）；
 *   · 其余不认识的英文工程名 → 不渲染，绝不让它进界面。
 */
function inlineCode(inner: string, refs?: Map<string, string>): ReactNode {
  if (FILE_LIKE.test(inner)) return refs?.get(inner) ?? null;
  if (isInternalToken(inner, refs)) return null;
  const term = proseTerm(inner);
  if (term) return <span className="md-term">{term}</span>;
  if (NOTATION.test(inner)) return <code>{inner}</code>;
  if (import.meta.env.DEV) console.info(`正文里未登记的英文标识符（需补 COLUMN_META / PROSE_TERMS）：${inner}`);
  return null;
}

/**
 * 行内语法：只认 `**加粗**` 与 `` `代码` ``，其余原样。
 *
 * 预处理只做一次；加粗内部再递归一次，因为研究会写成
 * `**主结局 \`log_yield\`**：…` —— 反引号被包在粗体里，
 * 不递归的话那层标识符就绕过了全部规则。
 *
 * 数据文件名（V5 §38 红线）在两种写法下都不许进界面：
 *   - 能对应到已渲染资产 → 换成编号（`表 2` / `图 1`），引用仍然可读；
 *   - 对应不上 → 直接不渲染，绝不把文件名露给用户。
 */
export function renderInline(rawText: string, keyPrefix = 'i', refs?: Map<string, string>): ReactNode[] {
  const prepared = dropInternalParentheticals(unwrapGlosses(applyProseEnums(rawText)), refs);
  return renderPrepared(prepared, keyPrefix, refs);
}

function renderPrepared(text: string, keyPrefix: string, refs?: Map<string, string>): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter((part) => part !== '');
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={key}>{renderPrepared(part.slice(2, -2), `${key}s`, refs)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <Fragment key={key}>{inlineCode(part.slice(1, -1), refs)}</Fragment>;
    }
    const plain = translateBare(part).replace(EMPTY_BRACKETS, '');
    const matches = plain.match(FILE_IN_TEXT) ?? [];
    if (matches.length === 0) return <span key={key}>{plain}</span>;
    const segments = plain.split(FILE_IN_TEXT);
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
