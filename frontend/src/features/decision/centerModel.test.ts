import { describe, expect, it } from 'vitest';
import {
  buildRiskProfile, compareConclusion, confidenceBand, evidenceStatus, forecastDirection, historyAnchors,
  judgmentSentence, longCertainty, marketState, riskBandFromScore, uncertaintyBand, COMPARE_LABELS,
} from './centerModel';

describe('decision center rules (§10–§14)', () => {
  it('maps real thresholds to enumerated states without inventing values', () => {
    expect(marketState(0.9)).toBe('high');
    expect(marketState(0.1)).toBe('low');
    expect(marketState(0.5)).toBe('mid');
    expect(marketState(null)).toBe('unknown');
    expect(forecastDirection(5.716, 3.8)).toBe('up');
    expect(forecastDirection(3.0, 3.8)).toBe('down');
    expect(forecastDirection(3.85, 3.8)).toBe('flat');
    expect(forecastDirection(5, null)).toBe('unknown');
    expect(riskBandFromScore(29.9)).toBe('low');
    expect(riskBandFromScore(50.7)).toBe('medium');
    expect(riskBandFromScore(66.1)).toBe('high');
    expect(riskBandFromScore(null)).toBe('unknown');
    expect(confidenceBand(90)).toBe('high');
    expect(confidenceBand(68)).toBe('medium');
    expect(confidenceBand(40)).toBe('low');
    expect(uncertaintyBand(1.145)).toBe('extreme');
    expect(uncertaintyBand(0.2)).toBe('low');
    expect(longCertainty('EXPLORATORY_SCENARIO_ONLY')).toBe('exploratory');
    expect(longCertainty('SCENARIO_ONLY')).toBe('scenario_only');
  });

  it('only calls a range calibrated when the backend says prediction_interval', () => {
    expect(evidenceStatus('prediction_interval', null)).toBe('calibrated');
    expect(evidenceStatus('scenario_range', 'scenario_range_widened')).toBe('scenario_only');
    expect(evidenceStatus(null, 'retrospective_only_no_untouched')).toBe('retrospective_only');
    expect(evidenceStatus(null, null)).toBe('unavailable');
  });

  it('assembles the judgment sentence from fields, and keeps missing values honest', () => {
    const sentence = judgmentSentence({
      cityName: '沈阳', crop: '黄瓜', horizon: 30, state: 'mid', percentile: 0.4676, direction: 'up',
      mid: 5.716, low: 2.984, high: 9.529, unit: '元/kg', risk: 'medium', hri: 'medium', confidence: 'medium', evidence: 'scenario_only',
    });
    expect(sentence).toContain('沈阳 · 黄瓜');
    expect(sentence).toContain('近 6 年中枢');
    expect(sentence).toContain('分位 47%');
    expect(sentence).toContain('30 天模型方向向上');
    expect(sentence).toContain('中心值 5.72 元/kg（区间 2.98–9.53）');
    expect(sentence).toContain('市场风险中等');
    expect(sentence).toContain('结论可信度中等');
    expect(sentence).toContain('仅情景区间（未校准）');
    const empty = judgmentSentence({
      cityName: '大连', crop: '黄瓜', horizon: 7, state: 'unknown', percentile: null, direction: 'unknown',
      mid: null, low: null, high: null, unit: '元/kg', risk: 'unknown', hri: 'unknown', confidence: 'unknown', evidence: 'unavailable',
    });
    expect(empty).toContain('分位 —');
    expect(empty).toContain('中心值 — 元/kg（区间待确认）');
    expect(empty).not.toMatch(/\d{1,3}\.\d/);
  });

  it('never emits a forbidden crop recommendation or a score', () => {
    const labels = new Set<string>(COMPARE_LABELS);
    expect([...labels]).toEqual(['更值得关注', '可关注', '谨慎', '暂无明显优势', '数据不足']);
    const cases = [
      compareConclusion({ hasData: false, direction: 'up', risk: 'low', hri: 'low', confidence: 'high', longCertainty: 'scenario_only' }),
      compareConclusion({ hasData: true, direction: 'up', risk: 'high', hri: 'low', confidence: 'high', longCertainty: 'scenario_only' }),
      compareConclusion({ hasData: true, direction: 'up', risk: 'low', hri: 'low', confidence: 'high', longCertainty: 'scenario_only' }),
      compareConclusion({ hasData: true, direction: 'flat', risk: 'medium', hri: 'low', confidence: 'medium', longCertainty: 'scenario_only' }),
      compareConclusion({ hasData: true, direction: 'down', risk: 'low', hri: 'low', confidence: 'low', longCertainty: 'scenario_only' }),
    ];
    expect(cases).toEqual(['数据不足', '谨慎', '更值得关注', '可关注', '暂无明显优势']);
    for (const label of cases) expect(labels.has(label)).toBe(true);
  });

  it('builds five risk bars that each cite a real field and a research link', () => {
    const items = buildRiskProfile({
      marketRisk: 50.7, priceRelWidth: 1.145, climateExposure: 41.7, hri: 42, confidence: 69.9,
      priceLow: 2.984, priceHigh: 9.529, unit: '元/kg',
    });
    expect(items.map((item) => item.id)).toEqual(['volatility', 'price_uncertainty', 'weather', 'concentration', 'data']);
    expect(items.every((item) => item.sources.length > 0 && item.researchId.startsWith('A'))).toBe(true);
    expect(items[0]).toMatchObject({ score: 50.7, band: 'medium', researchId: 'A1.7' });
    expect(items[1]).toMatchObject({ score: null, band: 'extreme', researchId: 'A1.3' });
    expect(items[3]).toMatchObject({ score: 42, band: 'medium', researchId: 'A7.4' });
    const missing = buildRiskProfile({ marketRisk: null, priceRelWidth: null, climateExposure: null, hri: null, confidence: null, priceLow: null, priceHigh: null, unit: '元/kg' });
    expect(missing.every((item) => item.width === 0 || item.band === 'unknown')).toBe(true);
  });

  it('derives history anchors only from published relative changes (null stays missing)', () => {
    const anchors = historyAnchors(2.2, [{ daysAgo: 7, relative: -0.026549 }, { daysAgo: 30, relative: null }]);
    expect(anchors).toHaveLength(2);
    expect(anchors[0].daysAgo).toBe(7);
    expect(anchors[0].price).toBeCloseTo(2.2 / (1 - 0.026549), 6);
    expect(anchors[1]).toEqual({ daysAgo: 0, price: 2.2 });
    expect(historyAnchors(null, [])).toEqual([]);
    expect(historyAnchors(2.2, [{ daysAgo: 1, relative: -1 }])).toEqual([{ daysAgo: 0, price: 2.2 }]);
  });
});