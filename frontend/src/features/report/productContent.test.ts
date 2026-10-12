import { describe, expect, it } from 'vitest';
import { productSections, productText } from './productContent';

describe('published content presentation', () => {
  it('keeps scientific limitations while filtering development sections without mutating published text', () => {
    const sections = [
      { number: '1', title: '研究结果', content: '观测价格为 3.8 元/kg。\n\n未观察到显著效应。' },
      { number: '2', title: '研究局限', content: '缺失数据。' },
      { number: '3', title: '技术架构与部署', content: '文件与服务说明。' },
      { number: '4', title: '结论', content: '生产结构存在差异。' },
    ];
    const before = JSON.stringify(sections);
    const visible = productSections(sections);
    expect(visible.map(section => section.title)).toEqual(['研究结果', '研究局限', '结论']);
    expect(visible[0].content).toBe(sections[0].content);
    expect(JSON.stringify(sections)).toBe(before);
  });

  it('keeps nested scientific qualifications and removes only development paragraphs', () => {
    const source = '实测数据。\n\n## 研究局限\n\n受限说明。\n\n### 附加说明\n\n更多受限说明。\n\n## 结论\n\n未观察到显著变化。\n\n前端不改写研究侧数据。';
    expect(productText(source)).toBe('实测数据。\n\n## 研究局限\n\n受限说明。\n\n### 附加说明\n\n更多受限说明。\n\n## 结论\n\n未观察到显著变化。');
  });
  it('retains boundary, future research and runtime words when they describe scientific content', () => {
    const source = '## 适用边界\n\n相关不代表因果，95% 区间仍覆盖零。\n\n## 未来工作\n\n模型 runtime 随样本变化，需要后续验证。';
    expect(productText(source)).toBe(source);
    expect(productSections([{title:'方法限制',content:source}])[0].content).toBe(source);
  });
});
