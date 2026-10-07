import { describe, expect, it } from 'vitest';
import {
  buildDisplayFilter,
  defaultSelectorValues,
  filterRows,
  uniqueValuesInSourceOrder,
} from './selectors';

/**
 * selector 契约（本轮 §33/§34/§36）。
 *
 * 这几条都是 correctness：默认值必须**确定性**（源顺序去重取第一个），
 * display filter 必须 = 静态 filter + selector 值，且加上 selector 后分类轴唯一。
 */

const rows = [
  { crop: '番茄', month: '1', outcome: 'price' },
  { crop: '番茄', month: '2', outcome: 'price' },
  { crop: '土豆', month: '1', outcome: 'price' },
  { crop: '土豆', month: '2', outcome: 'price' },
  { crop: '土豆', month: '1', outcome: 'volume' },
];

describe('uniqueValuesInSourceOrder', () => {
  it('按数据源原始行顺序去重（不是字典序）', () => {
    expect(uniqueValuesInSourceOrder(rows, 'crop')).toEqual(['番茄', '土豆']);
    expect(uniqueValuesInSourceOrder(rows, 'month')).toEqual(['1', '2']);
  });

  it('空值不参与', () => {
    expect(uniqueValuesInSourceOrder([{ k: '' }, { k: 'a' }, { k: '' }], 'k')).toEqual(['a']);
  });
});

describe('defaultSelectorValues（§34）', () => {
  it('每列取源顺序第一个', () => {
    expect(defaultSelectorValues(rows, ['crop', 'month'])).toEqual({ crop: '番茄', month: '1' });
  });

  it('无 selectors 时返回空对象', () => {
    expect(defaultSelectorValues(rows, [])).toEqual({});
  });
});

describe('buildDisplayFilter（§33）', () => {
  it('selector 值覆盖/补充静态 filter', () => {
    expect(buildDisplayFilter({ filter: { outcome: ['price'] }, selectors: ['crop'] }, { crop: '土豆' }))
      .toEqual({ outcome: ['price'], crop: ['土豆'] });
  });

  it('未选中的 selector 不写入（回落由调用方负责）', () => {
    expect(buildDisplayFilter({ filter: {}, selectors: ['crop', 'month'] }, { crop: '土豆' }))
      .toEqual({ crop: ['土豆'] });
  });
});

describe('selector 消除分类轴歧义', () => {
  it('没有 selector 时 month 重复（一个 month 对应多个 crop）', () => {
    const display = filterRows(rows, buildDisplayFilter({ filter: { outcome: ['price'] }, selectors: [] }, {}));
    const months = display.map((row) => row.month);
    expect(new Set(months).size).toBeLessThan(months.length);
  });

  it('应用默认 selector 后 month 唯一（§36）', () => {
    const selectors = ['crop'];
    const staticRows = filterRows(rows, { outcome: ['price'] });
    const selected = defaultSelectorValues(staticRows, selectors);
    const display = filterRows(rows, buildDisplayFilter({ filter: { outcome: ['price'] }, selectors }, selected));
    const months = display.map((row) => row.month);
    expect(new Set(months).size).toBe(months.length);
  });
});
