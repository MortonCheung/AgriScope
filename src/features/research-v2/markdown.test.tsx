import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { parseMarkdownBlocks, renderInline, stripListPrefix } from './markdown';

/**
 * V5 §38 红线：数据文件名（.csv / .md / .png …）绝不允许出现在可见文本里。
 * 这里是这条红线的单元级守卫 —— 与其在每个页面上反复目视，不如让它在 CI 里报错。
 */
function inline(text: string, refs?: Map<string, string>): string {
  return renderToString(<>{renderInline(text, 't', refs)}</>);
}

/** 只比较"读者真正看到的文字"：去掉标签与 React 的文本分隔注释。 */
function visible(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '');
}

/**
 * 去掉被保留的公式与统计记号（`<code>`）之后再比较。
 * V5 §76 允许公式与标准名称原样存在，但**必须处在中文语境**，
 * 所以这里只追究那些作为普通文字出现在句子里的英文工程名。
 */
function prose(html: string): string {
  return visible(html.replace(/<code>[\s\S]*?<\/code>/g, ''));
}

describe('renderInline 不泄漏数据文件名', () => {
  it('反引号包住的文件名在无编号可用时整个消失', () => {
    const html = inline('综合基于证据登记表（`evidence/claim_evidence.csv`），不采用逐篇拼接。');
    expect(html).not.toContain('.csv');
    expect(html).toContain('综合基于证据登记表');
    expect(html).toContain('，不采用逐篇拼接。');
  });

  it('文件名被丢弃后不留下空括号', () => {
    const html = inline('依据（`A01_monthly.csv`）统计。');
    expect(html).not.toContain('（）');
    expect(html).not.toContain('()');
    expect(visible(html)).toBe('依据统计。');
  });

  it('没有反引号的文件名同样不会漏出去', () => {
    const html = inline('见 A03_lag_profile.csv 与 A03_lag_profile.png。');
    expect(html).not.toContain('.csv');
    expect(html).not.toContain('.png');
    expect(visible(html)).toBe('见  与 。');
  });

  it('能对应到已渲染资产时换成图 / 表编号', () => {
    const refs = new Map([['A01_monthly.csv', '表 2'], ['A01_seasonal_amplitude.png', '图 1']]);
    const html = inline('见 `A01_monthly.csv` 与 `A01_seasonal_amplitude.png`。', refs);
    expect(html).not.toContain('.csv');
    expect(html).not.toContain('.png');
    expect(html).toContain('表 2');
    expect(html).toContain('图 1');
  });

  it('前面已经写了「表 / 图」时不重复名词', () => {
    // 研究原句是「（表 `A03_lag_windows.csv`）」，直接替换会得到「（表 表 2）」。
    const refs = new Map([['A03_lag_windows.csv', '表 2']]);
    expect(prose(inline('显著 11 项（表 `A03_lag_windows.csv`）。', refs))).toBe('显著 11 项（表 2）。');
    // 对不上资产时，连那个名词和括号一起不渲染，不留半句。
    expect(prose(inline('见（表 `A03_missing.csv`）结束。'))).toBe('见结束。');
  });

  it('括号包住的、能对上号的文件名保留括号', () => {
    const refs = new Map([['A01_monthly.csv', '表 2']]);
    const html = inline('（`A01_monthly.csv`）', refs);
    expect(html).toContain('（');
    expect(html).toContain('表 2');
    expect(html).toContain('）');
  });

  it('没有中文名的代码片段不再原样保留', () => {
    // §76 收紧后：反引号里的英文工程名要么换成中文，要么不渲染。
    const html = inline('字段 `is_significant` 为真。');
    expect(html).not.toContain('is_significant');
    expect(visible(html)).toBe('字段  为真。');
  });

  it('加粗仍然生效', () => {
    const html = inline('这是**重要**结论。');
    expect(html).toContain('<strong>');
    expect(visible(html)).toBe('这是重要结论。');
  });
});

describe('parseMarkdownBlocks 只认研究正文真实用到的语法', () => {
  it('忽略引用块，因此内部路径说明不会进界面', () => {
    const blocks = parseMarkdownBlocks('正文一。\n\n> 内部说明：见 workspace/outputs/a.csv\n\n正文二。');
    expect(blocks.map((block) => block.kind)).toEqual(['paragraph', 'paragraph']);
  });

  it('解析小标题、列表与表格', () => {
    const blocks = parseMarkdownBlocks('### 小节\n\n- 甲\n- 乙\n\n| 列一 | 列二 |\n| --- | --- |\n| 1 | 2 |');
    expect(blocks[0]).toEqual({ kind: 'heading', level: 3, text: '小节' });
    expect(blocks[1]).toEqual({ kind: 'list', items: ['甲', '乙'] });
    expect(blocks[2]).toEqual({ kind: 'table', header: ['列一', '列二'], rows: [['1', '2']] });
  });
});

describe('renderInline 不泄漏英文工程字段（V5 §76）', () => {
  it('有受控中文名的列名 / 取值换成中文', () => {
    expect(prose(inline('核心暴露 `growing_season_precip` 与 `temp_max`。')))
      .toBe('核心暴露 生长季降水 与 日最高气温。');
  });

  it('研究写成「标识符（中文定义）」时直接留下中文定义', () => {
    expect(prose(inline('`growing_season_temp_mean`（生长季 5–9 月平均气温，℃）、其余。')))
      .toBe('生长季 5–9 月平均气温，℃、其余。');
  });

  it('括号里不是定义而是品种清单时，绝不展开', () => {
    // A03 真有这种写法：`precip_7d`（韭菜、黄瓜）指"受影响品种"，不是变量定义。
    expect(prose(inline('见 `precip_7d`（韭菜、黄瓜）。')))
      .toBe('见 7 日累积降水（韭菜、黄瓜）。');
  });

  it('内部路径、URL 与键值标记不渲染，且不留空括号', () => {
    const html = inline('对照见 `data/v2_market_daily.parquet` 与 `https://www.example.com/`（`is_core=False`）。');
    expect(prose(html)).toBe('对照见  与 。');
    expect(prose(html)).not.toContain('（）');
  });

  it('公式与统计记号原样保留', () => {
    const html = inline('模型为 `y_t = α + φ·y_(t-1) + β·weather_t + ε_t`。');
    expect(html).toContain('<code>');
    expect(prose(html)).not.toContain('α');
  });

  it('没有中文名的英文工程名不会漏出去', () => {
    expect(prose(inline('未知标识符 `some_internal_flag` 不应出现。'))).toBe('未知标识符  不应出现。');
  });

  it('研究自己的证据状态词表换成中文', () => {
    expect(prose(inline('逐条记录其状态（supported / partly_supported / not_supported / descriptive_only）。')))
      .toBe('逐条记录其状态（支持 / 部分支持 / 未获支持 / 仅描述）。');
  });
});

/**
 * 语料级回归：把**真实载荷里每一段正文**都渲染一遍，逐条检查界面可见文字。
 * 单点用例只能证明规则本身对；这条才能证明它对研究真正写出来的文本都成立。
 *
 * 载荷用 `import.meta.glob` 以原始字符串取入：这样测试文件不依赖 Node 内置模块，
 * 也就不需要为了一个测试往 tsconfig 里塞 Node 类型。
 */
describe('真实研究正文渲染后不泄漏工程字段', () => {
  const payloads = import.meta.glob('../../../public/research/shenyang/articles/*.json', {
    eager: true,
    query: '?raw',
    import: 'default',
  }) as Record<string, string>;
  const articles = Object.keys(payloads).sort();

  /** 出现即视为泄漏：数据文件名、内部路径、键值标记、英文工程字段。 */
  const FORBIDDEN = [
    /\.(csv|md|png|json|txt|parquet)\b/i,
    /workspace\//,
    /outputs\//,
    /results\//,
    /\bdata\/[A-Za-z0-9_.-]+/,
    /https?:\/\//,
    /\b[A-Za-z_][A-Za-z_0-9]*=[A-Za-z_][A-Za-z_0-9]*\b/,
    /\bdescriptive_only\b/,
    /\bpartly_supported\b/,
    /\bnot_supported\b/,
    /\b(log_yield|heavy_rain_days|et0_sum|vpd_mean|growing_season_[a-z_]+|max_1d_precip|hot_days|price_z|volume_z|z_rel|sown_area|precip_w[0-9]+)\b/,
    /(表|图)\s*\1/,
    /\bPOOLED\b/,
  ];

  it(`共 ${articles.length} 篇，逐段检查`, () => {
    expect(articles.length).toBe(9);
    const leaks: string[] = [];
    for (const path of articles) {
      const name = path.split('/').pop() ?? path;
      const article = JSON.parse(payloads[path]);
      const fields: Array<[string, string]> = [
        ['frontend_summary', article.frontend_summary ?? ''],
        ['abstract', article.abstract ?? ''],
        ['conclusion', article.conclusion ?? ''],
        ['data_scope', article.data_scope?.summary ?? ''],
        ...(article.methods ?? []).map((m: { summary?: string }, i: number) => [`methods[${i}]`, m.summary ?? ''] as [string, string]),
        ...(article.limitations ?? []).map((l: string, i: number) => [`limitations[${i}]`, l] as [string, string]),
        ...(article.sections ?? []).map((s: { number: number; content: string }) => [`section${s.number}`, s.content] as [string, string]),
      ];
      for (const [field, source] of fields) {
        const html = renderToString(<>{parseMarkdownBlocks(source).map((block, index) => {
          if (block.kind === 'heading') return <h3 key={index}>{renderInline(block.text, `h${index}`)}</h3>;
          if (block.kind === 'list') return <ul key={index}>{block.items.map((item, i) => <li key={i}>{renderInline(item, `l${index}-${i}`)}</li>)}</ul>;
          if (block.kind === 'table') return <table key={index}><tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{renderInline(cell, `t${index}-${r}-${c}`)}</td>)}</tr>)}</tbody></table>;
          return <p key={index}>{renderInline(block.text, `p${index}`)}</p>;
        })}</>);
        const shown = prose(html);
        for (const pattern of FORBIDDEN) {
          const hit = pattern.exec(shown);
          if (hit) leaks.push(`${name} ${field}：${hit[0]}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  /**
   * 研究点的引文同样直接进界面（交互模块的「研究侧原句」），
   * 也必须走同一套行内规则；这一段专门守住引文这条路径。
   */
  const catalogs = import.meta.glob('../../domain/research/catalog/*.json', {
    eager: true,
    query: '?raw',
    import: 'default',
  }) as Record<string, string>;

  it(`研究点引文（${Object.keys(catalogs).length} 个目录）逐条检查`, () => {
    const leaks: string[] = [];
    let checked = 0;
    for (const path of Object.keys(catalogs)) {
      const catalog = JSON.parse(catalogs[path]);
      for (const topic of catalog.topics ?? []) {
        for (const point of topic.points ?? []) {
          for (const citation of point.citations ?? []) {
            checked += 1;
            const html = renderToString(<p>{renderInline(citation.quote, 'c')}</p>);
            const shown = prose(html);
            for (const pattern of FORBIDDEN) {
              const hit = pattern.exec(shown);
              if (hit) leaks.push(`${point.id} §${citation.section}：${hit[0]}`);
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(leaks).toEqual([]);
  });
});

describe('展示层的列表前缀清理（§52/§53）', () => {
  it('去掉研究自带的列表前缀，不改其它内容', () => {
    expect(stripListPrefix('1. 成交量单位未知。')).toBe('成交量单位未知。');
    expect(stripListPrefix('1) 成交量单位未知。')).toBe('成交量单位未知。');
    expect(stripListPrefix('2、成交量单位未知。')).toBe('成交量单位未知。');
    expect(stripListPrefix('- 成交量单位未知。')).toBe('成交量单位未知。');
    expect(stripListPrefix('成交量单位未知。')).toBe('成交量单位未知。');
    // 没有前缀分隔符的数字（年份、负数）不能被误伤。
    expect(stripListPrefix('2024 年')).toBe('2024 年');
    expect(stripListPrefix('-5 毫米')).toBe('-5 毫米');
  });

  it('加粗句子经过 strip + renderInline 后不再有裸 **（§59-27）', () => {
    const html = inline(stripListPrefix('1. **成交量单位未知**：只作相对口径。'));
    expect(visible(html)).not.toContain('**');
    expect(html).toContain('<strong>');
    expect(html).toContain('成交量单位未知');
    expect(visible(html).startsWith('成交量单位未知')).toBe(true);
  });
});
