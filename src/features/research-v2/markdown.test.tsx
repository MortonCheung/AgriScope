import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { parseMarkdownBlocks, renderInline } from './markdown';

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

  it('括号包住的、能对上号的文件名保留括号', () => {
    const refs = new Map([['A01_monthly.csv', '表 2']]);
    const html = inline('（`A01_monthly.csv`）', refs);
    expect(html).toContain('（');
    expect(html).toContain('表 2');
    expect(html).toContain('）');
  });

  it('普通代码片段仍然保留', () => {
    const html = inline('字段 `is_significant` 为真。');
    expect(html).toContain('<code>is_significant</code>');
  });

  it('加粗仍然生效', () => {
    const html = inline('这是**重要**结论。');
    expect(html).toContain('<strong>重要</strong>');
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
