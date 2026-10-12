// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyPlanningDraft, readPlanningSession, validPlanningSaleDate, writePlanningSession, type PlanningSession } from './planning';
const session: PlanningSession = { activeCrop: '玉米', customCrop: '', drafts: { 玉米: { ...emptyPlanningDraft(), areaMu: '10', yieldKgPerMu: '500', costPerMu: '1000', pricePerKg: '4', salePercent: '80' } }, calculatedDrafts: {}, baseline: null, climateMetric: 'precipitation_mm', budgetCny: '20000', target: 'conservative', saleDate: '2026-11-20', priceOverrides: ['玉米'] };
beforeEach(() => sessionStorage.clear());
describe('product input session migration', () => {
  it('restores budget, goal, sale date and explicitly entered prices by city', () => {
    writePlanningSession('tieling', session);
    expect(readPlanningSession('tieling')).toMatchObject(session);
    expect(readPlanningSession('dalian')).toMatchObject({ activeCrop: '', budgetCny: '', target: 'balanced', saleDate: '', priceOverrides: [] });
  });
  it('treats previously stored prices as user prices while migrating new optional fields', () => {
    const previous = { ...session }; delete previous.budgetCny; delete previous.target; delete previous.saleDate; delete previous.priceOverrides;
    writePlanningSession('tieling', previous);
    expect(readPlanningSession('tieling')).toMatchObject({ drafts: session.drafts, budgetCny: '', target: 'balanced', saleDate: '', priceOverrides: ['玉米'] });
  });
  it('sanitizes malformed added fields without discarding valid editable draft values', () => {
    sessionStorage.setItem('agriscope:v4:planning:tieling', JSON.stringify({ ...session, budgetCny: 9000, target: 'unknown', saleDate: '2026-99-99', priceOverrides: ['玉米', 1, '__proto__'] }));
    expect(readPlanningSession('tieling')).toMatchObject({ drafts: session.drafts, budgetCny: '', target: 'balanced', saleDate: '', priceOverrides: ['玉米'] });
  });
  it('validates real calendar dates, including leap years', () => {
    expect(validPlanningSaleDate('2028-02-29')).toBe(true);
    expect(validPlanningSaleDate('2026-02-29')).toBe(false);
    expect(validPlanningSaleDate('2026-02-30')).toBe(false);
    expect(validPlanningSaleDate('2026-99-99')).toBe(false);
    expect(validPlanningSaleDate('')).toBe(false);
  });
});
