import { describe, expect, it } from 'vitest';
import {
  CITY_STATE_LABEL,
  deriveCityDataState,
  hasWarningSignal,
  notableWarningCrops,
  strongestSignal,
} from './cityMarketState';
import type { DailyCrop } from '../../domain/daily/types';

/**
 * 辽宁农业态势的地图六态（规范 §8）里，四种静态态必须完全由真实证据推导。
 * 这里锁定推导优先级，避免以后有人为了"好看"把某个城市硬编码成某个状态。
 */

function crop(over: Partial<DailyCrop> & { crop: string }): DailyCrop {
  return {
    dataDate: null,
    pricePerKg: null,
    changePreviousObservation: null,
    change7d: null,
    change30d: null,
    historicalPercentile: null,
    hri: null,
    marketRisk: null,
    signal: null,
    confidence: null,
    warnings: [],
    sourceId: null,
    freshness: 'DELAYED',
    sourceFreshness: 'DELAYED',
    modelStatus: null,
    finalStatus: null,
    ...over,
  };
}

describe('deriveCityDataState', () => {
  it('能力接口明确 supported=false → market-data-unavailable（优先于其它证据）', () => {
    expect(deriveCityDataState({ supported: false, hasDailySeries: true, dailyHasWarning: true }))
      .toBe('market-data-unavailable');
  });

  it('日度快照存在 WATCH/HIGH 信号 → warning', () => {
    expect(deriveCityDataState({ supported: true, hasDailySeries: true, dailyHasWarning: true })).toBe('warning');
  });

  it('有决策级数据但没有日度序列 → partial-data', () => {
    expect(deriveCityDataState({ supported: true, hasDailySeries: false, dailyHasWarning: false })).toBe('partial-data');
  });

  it('证据齐备且无异常 → normal', () => {
    expect(deriveCityDataState({ supported: true, hasDailySeries: true, dailyHasWarning: false })).toBe('normal');
  });

  it('能力尚未确认（supported=null）时保持中性 normal，不猜状态', () => {
    expect(deriveCityDataState({ supported: null, hasDailySeries: false, dailyHasWarning: false })).toBe('normal');
  });
});

describe('信号读取', () => {
  it('只有 WATCH/HIGH/VERY_HIGH 算 warning，NORMAL/UNKNOWN 不算', () => {
    const crops = [crop({ crop: 'a', signal: 'NORMAL' }), crop({ crop: 'b', signal: 'UNKNOWN' })];
    expect(hasWarningSignal(crops)).toBe(false);
    expect(hasWarningSignal([...crops, crop({ crop: 'c', signal: 'WATCH' })])).toBe(true);
    expect(hasWarningSignal([crop({ crop: 'd', signal: 'VERY_HIGH' })])).toBe(true);
  });

  it('strongestSignal 取最重的一档', () => {
    const crops = [
      crop({ crop: 'a', signal: 'WATCH' }),
      crop({ crop: 'b', signal: 'NORMAL' }),
      crop({ crop: 'c', signal: 'HIGH' }),
    ];
    expect(strongestSignal(crops)).toBe('HIGH');
  });

  it('notableWarningCrops 按 marketRisk 从高到低排序，且只保留异常信号', () => {
    const crops = [
      crop({ crop: 'a', signal: 'WATCH', marketRisk: 40 }),
      crop({ crop: 'b', signal: 'NORMAL', marketRisk: 99 }),
      crop({ crop: 'c', signal: 'HIGH', marketRisk: 80 }),
    ];
    expect(notableWarningCrops(crops).map((item) => item.crop)).toEqual(['c', 'a']);
  });
});

describe('状态文案', () => {
  it('四态都有对外文字（颜色之外的第二重表达）', () => {
    expect(Object.keys(CITY_STATE_LABEL).sort()).toEqual(
      ['market-data-unavailable', 'normal', 'partial-data', 'warning'].sort(),
    );
  });
});