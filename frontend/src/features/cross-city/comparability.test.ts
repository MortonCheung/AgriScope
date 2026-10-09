import { describe, expect, it } from 'vitest';
import {
  COMPARABILITY_LABEL,
  CROSS_CITY_METRICS,
  findMetric,
  pairComparability,
} from './comparability';

/**
 * 跨城比较可比较性契约（§25 / §25.1）。
 *
 * 守三件事：
 *   1. 指标切换项**只来自研究侧真实导出的表与列**（不编造列、不放价格水平比较）；
 *   2. 可比性三档判定可机械验证（同频率 → 可直接比较；频率不同 → 不可直接比较）；
 *   3. 领先/滞后类只能是"探索性"。
 */

/** cross_city 载荷里真实存在的表 → 真实列名（取自 /api/research/cross_city/tables/*）。 */
const REAL_COLUMNS: Record<string, string[]> = {
  'cross_city_production_concentration.csv': ['city', 'HHI', 'CR4', 'n_crops', 'years', 'top3'],
  'cross_city_seasonal_sync.csv': ['crop', 'city_a', 'city_b', 'seasonal_corr', 'n_months', 'freq_a', 'freq_b', 'freq_pair'],
  'cross_city_seasonal_sync_by_crop.csv': ['crop', 'mean_corr', 'n_pairs'],
  'cross_city_resilience.csv': ['city', 'n_event_clusters', 'median_post_z', 'placebo_p', 'n_official_disaster'],
  'cross_city_cross_city_lead_lag.csv': ['crop', 'city_a', 'city_b', 'best_lag_weeks', 'corr_at_best', 'n_weeks'],
};

describe('跨城指标切换项只取自真实表与列', () => {
  it('每个指标的表都是真实导出的 cross_city 表', () => {
    for (const metric of CROSS_CITY_METRICS) {
      expect(Object.keys(REAL_COLUMNS)).toContain(metric.table);
    }
  });

  it('每个指标的取值列都真实存在于它声明的表里', () => {
    for (const metric of CROSS_CITY_METRICS) {
      expect(REAL_COLUMNS[metric.table]).toContain(metric.valueColumn);
    }
  });

  it('不含任何价格水平比较（§25.1 硬红线）', () => {
    for (const metric of CROSS_CITY_METRICS) {
      expect(`${metric.table} ${metric.valueColumn}`).not.toMatch(/price|价格/i);
    }
  });
});

describe('可比较性三档', () => {
  it('三档都有中文标签', () => {
    expect(COMPARABILITY_LABEL.direct).toBe('可直接比较');
    expect(COMPARABILITY_LABEL.exploratory).toBe('探索性比较');
    expect(COMPARABILITY_LABEL['not-comparable']).toBe('不可直接比较');
  });

  it('城际配对按频率判定：同频率可直接比较，频率不同不可直接比较', () => {
    expect(pairComparability('same')).toBe('direct');
    expect(pairComparability('mixed')).toBe('not-comparable');
    expect(pairComparability(undefined)).toBe('not-comparable');
  });

  it('领先/滞后只允许探索性', () => {
    expect(findMetric('lead-lag').comparability).toBe('exploratory');
  });

  it('生产结构指标可直接比较', () => {
    expect(findMetric('hhi').comparability).toBe('direct');
    expect(findMetric('cr4').comparability).toBe('direct');
  });

  it('未知 id 回落到第一个指标', () => {
    expect(findMetric('nope').id).toBe(CROSS_CITY_METRICS[0].id);
  });
});