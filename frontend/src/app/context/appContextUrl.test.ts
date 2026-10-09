import { describe, expect, it } from 'vitest';
import {
  isKnownAsOf, isKnownCrop, readContextFromSearch, writeContextToSearch,
} from './appContext';

describe('四要素 URL 编解码（Frontend V3 §9）', () => {
  it('只接受已知城市，未知城市被忽略', () => {
    expect(readContextFromSearch('?city=shenyang').cityId).toBe('shenyang');
    expect(readContextFromSearch('?city=atlantis').cityId).toBeUndefined();
    expect(readContextFromSearch('?city=Shenyang').cityId).toBeUndefined();
  });

  it('horizon 只接受 7/14/30，其它值被忽略', () => {
    expect(readContextFromSearch('?horizon=30').horizon).toBe(30);
    expect(readContextFromSearch('?horizon=99').horizon).toBeUndefined();
    expect(readContextFromSearch('?horizon=abc').horizon).toBeUndefined();
  });

  it('作物名限制在安全字符集内，空串与脚本片段被拒绝', () => {
    expect(isKnownCrop('黄瓜')).toBe(true);
    expect(isKnownCrop('西红柿')).toBe(true);
    expect(isKnownCrop('')).toBe(false);
    expect(isKnownCrop('<script>')).toBe(false);
    expect(isKnownCrop('a'.repeat(13))).toBe(false);
    expect(readContextFromSearch('?crop=%3Cscript%3E').crop).toBeUndefined();
  });

  it('参考日期必须是真实存在的 YYYY-MM-DD', () => {
    expect(isKnownAsOf('2026-09-14')).toBe(true);
    expect(isKnownAsOf('2026-02-30')).toBe(false);
    expect(isKnownAsOf('2026-9-14')).toBe(false);
    expect(isKnownAsOf('today')).toBe(false);
    expect(readContextFromSearch('?as_of=2026-02-30').asOf).toBeUndefined();
  });

  it('写回时保留其它 query，并移除未选择的要素（不写空串）', () => {
    const search = writeContextToSearch('?view=input&city=chaoyang&crop=黄瓜', {
      cityId: 'tieling', crop: null, horizon: 7, asOf: null,
    });
    const params = new URLSearchParams(search);
    expect(params.get('view')).toBe('input');
    expect(params.get('city')).toBe('tieling');
    expect(params.get('horizon')).toBe('7');
    expect(params.has('crop')).toBe(false);
    expect(params.has('as_of')).toBe(false);
  });

  it('编码后可无损还原（刷新 / 后退 / 分享链接都能复原）', () => {
    const search = writeContextToSearch('', { cityId: 'chaoyang', crop: '黄瓜', horizon: 14, asOf: '2026-09-14' });
    expect(readContextFromSearch(search)).toEqual({
      cityId: 'chaoyang', crop: '黄瓜', horizon: 14, asOf: '2026-09-14',
    });
  });

  it('幂等：同一上下文重复写回结果稳定（不会造成 URL 抖动）', () => {
    const once = writeContextToSearch('?view=result', { cityId: 'dalian', crop: null, horizon: 30, asOf: null });
    const twice = writeContextToSearch(`?${once}`, { cityId: 'dalian', crop: null, horizon: 30, asOf: null });
    expect(twice).toBe(once);
    expect(readContextFromSearch(`?${twice}`)).toEqual(readContextFromSearch(`?${once}`));
  });
});