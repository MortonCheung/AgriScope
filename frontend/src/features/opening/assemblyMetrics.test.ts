import { describe, expect, it } from 'vitest';
import { assemblyHeight, assemblyProgress, DROP_DELAY_BASE, DROP_DELAY_SPAN, OPENING_SETTLE_PROGRESS } from './assemblyMetrics';

describe('地块与镜头共享线性进度', () => {
  const finalDelay = DROP_DELAY_BASE + DROP_DELAY_SPAN;
  it('第一块立刻开始，最后一组约在 0.92 落定', () => {
    expect(assemblyProgress(0, DROP_DELAY_BASE)).toBe(0);
    expect(assemblyProgress(0.03, DROP_DELAY_BASE)).toBeGreaterThan(0);
    expect(assemblyProgress(0.9, finalDelay)).toBeLessThan(1);
    expect(assemblyProgress(OPENING_SETTLE_PROGRESS, finalDelay)).toBeCloseTo(1, 12);
    expect(assemblyHeight(1, finalDelay, 40)).toBe(0);
  });
  it('0.45 时不再提前完成组装，所有地块保持在纸面上方', () => {
    expect(assemblyProgress(0.45, finalDelay)).toBeLessThan(0.5);
    expect(assemblyHeight(0.45, finalDelay, 40)).toBeGreaterThan(10);
    for (const delay of [DROP_DELAY_BASE, finalDelay]) {
      let previous = 40;
      for (let step = 0; step <= 200; step++) {
        const height = assemblyHeight(step / 200, delay, 40);
        expect(height).toBeGreaterThanOrEqual(0);
        expect(height).toBeLessThanOrEqual(previous);
        previous = height;
      }
    }
  });
});
