import { describe, expect, it } from 'vitest';
import { beijingDay, formatBeijingClock, formatMarketTimestamp, isMarketDay, latestMarketTimestamp, marketFreshness, millisecondsToBeijingMidnight } from './marketTime';

describe('市场时间只格式化真实证据，浏览器时钟固定北京时区', () => {
  it('月日时分秒严格两位，UTC转换为北京而不是主机时区', () => {
    expect(formatBeijingClock(Date.parse('2026-01-02T01:03:04Z'))).toBe('01-02 09:03:04');
    expect(formatBeijingClock(Date.parse('2026-10-13T16:00:00Z'))).toBe('10-14 00:00:00');
    expect(beijingDay(Date.parse('2026-12-31T16:00:00Z'))).toBe('2027-01-01');
  });
  it('采集与发布精确时间转北京时间，V2日期保留日期精度', () => {
    expect(formatMarketTimestamp('2026-10-14T01:30:45Z')).toBe('10-14 09:30');
    expect(formatMarketTimestamp('2026-10-14T09:30:45+08:00')).toBe('10-14 09:30');
    expect(formatMarketTimestamp('2026-10-13')).toBe('10-13');
    expect(formatMarketTimestamp(null)).toBeNull();
    expect(formatMarketTimestamp(undefined)).toBeNull();
  });
  it('拒绝虚假日期、不带时区的时间及不合法时分秒', () => {
    expect(isMarketDay('2024-02-29')).toBe(true);
    for (const input of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-10-14T09:30:00', '2026-10-14T24:00:00Z', '2026-10-14T12:60:00Z', '2026-10-14T12:30:60Z', '2026-10-14T12:30:00+24:00', 'not-a-date']) {
      expect(formatMarketTimestamp(input)).toBeNull();
    }
    expect(() => formatBeijingClock(Number.NaN)).toThrow(RangeError);
  });
  it('按实际瞬时比较不同UTC偏移，忽略坏时间', () => {
    expect(latestMarketTimestamp(['2026-10-14T09:00:00+08:00', '2026-10-14T02:00:00Z', '2026-10-14T01:30:00Z', 'invalid'])).toBe('2026-10-14T02:00:00Z');
    expect(latestMarketTimestamp(['2026-10-12', '2026-10-13'])).toBe('2026-10-13');
    expect(latestMarketTimestamp([])).toBeNull();
  });
  it('新鲜度以北京日历日差分层，不按距离页面打开多久计算', () => {
    const now = Date.parse('2026-10-13T16:00:01Z');
    for (const [day, ageDays, state, label] of [
      ['2026-10-14', 0, 'today', '今日观测'], ['2026-10-13', 1, 'recent', '近期观测'],
      ['2026-10-12', 2, 'recent', '近期观测'], ['2026-10-11', 3, 'historical', '历史观测'],
      ['2026-10-07', 7, 'historical', '历史观测'], ['2026-10-06', 8, 'old', '数据较旧'],
    ] as const) expect(marketFreshness(day, now)).toEqual({ ageDays, state, label });
    expect(marketFreshness('2026-10-15', now)).toEqual({ ageDays: -1, state: 'future', label: '观测日期待核验' });
    expect(marketFreshness(null, now)).toEqual({ ageDays: null, state: 'missing', label: '暂无本地观测' });
    expect(marketFreshness('2026-02-30', now).state).toBe('missing');
  });
  it('只在北京零点计划日界更新，无每秒重新计算行情', () => {
    expect(millisecondsToBeijingMidnight(Date.parse('2026-10-13T15:59:59.500Z'))).toBe(500);
    expect(millisecondsToBeijingMidnight(Date.parse('2026-10-13T16:00:00Z'))).toBe(86_400_000);
    expect(marketFreshness('2026-10-13', Date.parse('2026-10-13T15:59:59Z')).state).toBe('today');
    expect(marketFreshness('2026-10-13', Date.parse('2026-10-13T16:00:00Z')).state).toBe('recent');
  });
});
