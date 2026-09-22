import { describe, expect, it } from 'vitest';
import { adaptArticle, adaptCityIndex } from './adapters';
import type { RawArticle, RawCityIndex } from './adapters';

const raw: RawCityIndex = {
  city: '沈阳',
  title: '测试研究',
  headline: '沈阳市测试研究',
  window: '2021-01-01 ~ 2026-09-14',
  panel: '10 品种 × 10 日',
  crops: ['土豆', '青椒'],
  priceUnit: '元/500g',
  volumeUnit: 'unknown',
  evidenceLevels: { A: '直接观测' },
  statusValues: { null_result: '阴性结果' },
  topics: [
    {
      id: 'G1', layer: '基础两两关系', category: '时间 × 市场', title: '时间与市场', question: '问题', why: '为什么',
      data: '数据', method: '方法', summary: '摘要', conclusion: '结论', evidenceLevel: 'Level A', status: 'supported',
      frontendText: '一句话', keyNumbers: { 季节强度: 0.491 }, limitations: ['限制一'],
      primaryFigure: '/research/shenyang/figures/F08.png',
      figures: ['/research/shenyang/figures/F08.png', '/research/shenyang/figures/F08.png'],
      tables: ['/research/shenyang/tables/stl_strength.csv'],
      articleId: 'G1',
    },
    {
      id: 'C2', layer: '复杂关系', category: '阈值', title: '阈值研究', question: '问题', why: null,
      data: null, method: null, summary: '摘要', conclusion: '结论', evidenceLevel: 'Level B', status: 'null_result',
      frontendText: null, keyNumbers: {}, limitations: [],
      primaryFigure: null, figures: [], tables: [], articleId: 'C2',
    },
  ],
  summaryBlocks: [
    { id: 'S1', title: '市场基础规律', covers: ['G1'], coversResolved: ['G1'], text: 'S1 摘要' },
    { id: 'S2', title: '气象风险', covers: ['C2'], coversResolved: ['C2'], text: 'S2 摘要' },
  ],
  cityConclusion: { title: '城市结论', risk_profile: '弱传导', definition: '定义', qas: [{ q: '问', a: '答' }], caveats: ['限定'] },
  methodologyNotes: ['规则'],
  redLines: ['不写吨'],
  counters: { crops: 2, topics: 2, studies: 2 },
};

describe('adaptCityIndex', () => {
  const index = adaptCityIndex(raw, 'shenyang');

  it('把证据等级与状态解析成受控枚举', () => {
    const g1 = index.points.find((point) => point.id === 'G1');
    const c2 = index.points.find((point) => point.id === 'C2');
    expect(g1?.evidenceLevel).toBe('A');
    expect(g1?.status).toBe('supported');
    expect(c2?.evidenceLevel).toBe('B');
    expect(c2?.status).toBe('null_result');
  });

  it('由 summary_blocks 的 covers 反推研究点所属专题', () => {
    expect(index.points.find((point) => point.id === 'G1')?.topicId).toBe('S1');
    expect(index.points.find((point) => point.id === 'C2')?.topicId).toBe('S2');
    expect(index.topics.map((topic) => topic.pointIds)).toEqual([['G1'], ['C2']]);
    expect(index.topics[0].points[0].id).toBe('G1');
  });

  it('对重复引用的图去重，并保留 key_numbers 原始顺序', () => {
    const g1 = index.points.find((point) => point.id === 'G1');
    expect(g1?.figures).toHaveLength(1);
    expect(g1?.keyNumbers).toEqual([{ label: '季节强度', value: '0.491' }]);
  });

  it('阴性结果保留为正式结论，不被过滤', () => {
    expect(index.points.some((point) => point.status === 'null_result')).toBe(true);
  });

  it('汇总图表清单是去重后的并集', () => {
    expect(index.figures).toEqual(['/research/shenyang/figures/F08.png']);
    expect(index.tables).toEqual(['/research/shenyang/tables/stl_strength.csv']);
  });
});

describe('adaptArticle', () => {
  const article: RawArticle = {
    id: 'G1',
    title: '标题',
    blocks: [
      { heading: '研究问题', lines: ['问题正文'] },
      { heading: '前端一句话', lines: ['一句话正文'] },
      { heading: null, lines: ['无标题正文'] },
    ],
  };

  it('不把内部字段名当 heading 渲染，但正文照旧保留（V4 §四十）', () => {
    const adapted = adaptArticle(article);
    expect(adapted.blocks.map((block) => block.heading)).toEqual(['研究问题', null, null]);
    expect(adapted.blocks[1].lines).toEqual(['一句话正文']);
  });

  it('不修改原标题与块顺序', () => {
    const adapted = adaptArticle(article);
    expect(adapted.title).toBe('标题');
    expect(adapted.blocks).toHaveLength(3);
  });
});
