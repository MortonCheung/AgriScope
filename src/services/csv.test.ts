import { describe, expect, it } from 'vitest';
import { parseCsv, numeric } from './csv';

describe('parseCsv', () => {
  it('解析表头与行，并去除空白', () => {
    const { columns, rows } = parseCsv('crop, month,seasonal_index\n土豆, 1,1.0\n青椒,2, 1.87\n');
    expect(columns).toEqual(['crop', 'month', 'seasonal_index']);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ crop: '土豆', month: '1', seasonal_index: '1.0' });
    expect(rows[1].seasonal_index).toBe('1.87');
  });

  it('支持引号包裹的字段与内嵌逗号', () => {
    const { rows } = parseCsv('label,value\n"降水, 3日累计",0.104\n');
    expect(rows[0].label).toBe('降水, 3日累计');
  });

  it('兼容 CRLF 与结尾换行', () => {
    const { columns, rows } = parseCsv('a,b\r\n1,2\r\n');
    expect(columns).toEqual(['a', 'b']);
    expect(rows).toEqual([{ a: '1', b: '2' }]);
  });

  it('空文件返回空结构', () => {
    expect(parseCsv('')).toEqual({ columns: [], rows: [] });
  });
});

describe('numeric', () => {
  it('只在可解析时返回数字', () => {
    expect(numeric('1.5')).toBe(1.5);
    expect(numeric('-0.4683')).toBeCloseTo(-0.4683);
    expect(numeric('')).toBeNull();
    expect(numeric('  ')).toBeNull();
    expect(numeric('n/a')).toBeNull();
    expect(numeric(undefined)).toBeNull();
  });
});
