import { describe, expect, it } from 'vitest';
import { calculatePlanning, emptyPlanningDraft, planningSensitivity, validatePlanningDraft } from './planning';
const inputs = { areaMu: 10, yieldKgPerMu: 500, costPerMu: 1000, pricePerKg: 4, saleFraction: .8 };
describe('user-condition planning', () => {
  it('leaves empty inputs empty and requires every user condition', () => {
    expect(validatePlanningDraft(emptyPlanningDraft(), '').inputs).toBeNull();
    expect(Object.keys(validatePlanningDraft(emptyPlanningDraft(), '').errors)).toHaveLength(6);
  });
  it('calculates sale-adjusted revenue, cost, profit and both break-even values', () => {
    expect(calculatePlanning(inputs)).toEqual({ productionKg: 5000, soldKg: 4000, revenueCny: 16000, costCny: 10000, profitCny: 6000, breakEvenPrice: 2.5, breakEvenYield: 312.5 });
  });
  it('varies one condition at a time without modifying the base', () => {
    const lines = planningSensitivity(inputs)!;
    expect(lines[0].points.map(p => p.profitCny)).toEqual([2800, 4400, 6000, 7600, 9200]);
    expect(lines[2].points.map(p => p.profitCny)).toEqual([8000, 7000, 6000, 5000, 4000]);
    expect(inputs.pricePerKg).toBe(4);
  });
  it('handles zero price, zero yield and zero sales without Infinity', () => {
    expect(calculatePlanning({ ...inputs, pricePerKg: 0 })?.breakEvenYield).toBeNull();
    expect(calculatePlanning({ ...inputs, yieldKgPerMu: 0 })?.breakEvenPrice).toBeNull();
    const result = calculatePlanning({ ...inputs, saleFraction: 0 })!;
    expect(result).toMatchObject({ revenueCny: 0, profitCny: -10000, breakEvenPrice: null, breakEvenYield: null });
    expect(calculatePlanning({ ...inputs, costPerMu: 0 })?.breakEvenPrice).toBe(0);
  });
  it('rejects negatives, nonfinite inputs, sales above 100%, zero area and overflow', () => {
    const draft = { areaMu: '0', yieldKgPerMu: '-1', costPerMu: 'Infinity', pricePerKg: 'NaN', salePercent: '101' };
    expect(Object.keys(validatePlanningDraft(draft, '玉米').errors)).toHaveLength(5);
    expect(calculatePlanning({ ...inputs, areaMu: Number.MAX_VALUE })).toBeNull();
    expect(calculatePlanning({ ...inputs, saleFraction: 1.1 })).toBeNull();
    expect(planningSensitivity({ ...inputs, costPerMu: Number.MAX_VALUE })).toBeNull();
  });
});
