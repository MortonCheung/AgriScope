// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cropIdentity, resolveSourceCrop } from './cropIdentity';
import { migratePlanningCrops, readPlanningSession, writePlanningSession, type PlanningSession } from './planning';
import { productCropOptions, productPriceFor } from './productDecision';
afterEach(() => sessionStorage.clear());
const potato = { areaMu: '9', yieldKgPerMu: '100', costPerMu: '20', pricePerKg: '', salePercent: '80' };
const legacy = { areaMu: '3', yieldKgPerMu: '900', costPerMu: '500', pricePerKg: '7', salePercent: '100' };
const session: PlanningSession = { activeCrop: '马铃薯', customCrop: '', drafts: { 土豆: potato, 马铃薯: legacy }, calculatedDrafts: { 马铃薯: legacy }, baseline: {crop:'马铃薯',draft:legacy}, climateMetric: 'precipitation_mm', priceOverrides: ['土豆', '马铃薯'] };
describe('crop identity across UI, data and saved conditions', () => {
  it('deduplicates options while resolving the actual source ID', () => {
    expect(cropIdentity('马铃薯')).toBe('土豆');
    expect(productCropOptions(['马铃薯','土豆']).filter(crop => crop === '土豆')).toHaveLength(1);
    expect(productCropOptions()).not.toContain('马铃薯');
    expect(resolveSourceCrop('马铃薯',['黄瓜','土豆'])).toBe('土豆');
    expect(resolveSourceCrop('土豆',['黄瓜','马铃薯'])).toBe('马铃薯');
    expect(productPriceFor('shenyang','马铃薯')).toEqual(productPriceFor('shenyang','土豆'));
  });
  it('selects a whole active draft and keeps both original drafts for recovery', () => {
    const migrated = migratePlanningCrops(session);
    expect(migrated.activeCrop).toBe('土豆');
    expect(migrated.drafts['土豆']).toEqual(legacy);
    expect(migrated.cropAliasBackup?.['土豆'].draft).toEqual(potato);
    expect(migrated.cropAliasBackup?.['马铃薯'].draft).toEqual(legacy);
    expect(migrated.baseline).toEqual({crop:'土豆',draft:legacy});
    writePlanningSession('shenyang', migrated);
    expect(readPlanningSession('shenyang').drafts['土豆']).toEqual(legacy);
    expect(readPlanningSession('dalian').drafts).toEqual({});
  });
  it('honors the requested existing alias including explicit price clearing', () => {
    writePlanningSession('shenyang', session);
    const migrated = readPlanningSession('shenyang','土豆');
    expect(migrated.drafts['土豆']).toEqual(potato);
    expect(migrated.priceOverrides).toContain('土豆');
    expect(migrated.calculatedDrafts['土豆']).toBeUndefined();
    expect(migrated.cropAliasBackup?.['马铃薯'].draft).toEqual(legacy);
  });
});
