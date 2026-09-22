import { describe, expect, it } from 'vitest';
import { QUALITY_CONFIG, resolveAutoQualityTier, resolveDpr } from './qualityPolicy';

describe('quality policy', () => {
  it('caps 4K rendering by the pixel budget', () => {
    expect(resolveDpr(3840, 2160, 2, QUALITY_CONFIG.balanced)).toBeLessThan(0.7);
  });
  it('never exceeds a tier cap', () => {
    expect(resolveDpr(1366, 768, 2, QUALITY_CONFIG.performance)).toBeLessThanOrEqual(1);
  });

  it('uses balanced mode for capable Windows devices', () => {
    expect(resolveAutoQualityTier({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      platform: 'Win32',
      hardwareConcurrency: 12,
      deviceMemory: 16,
      reducedMotion: false,
      hidden: false,
    })).toBe('balanced');
  });

  it('uses performance mode when Windows hardware information is missing', () => {
    expect(resolveAutoQualityTier({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      platform: 'Win32',
      reducedMotion: false,
      hidden: false,
    })).toBe('performance');
  });

  it('uses performance mode for low-end, hidden, or reduced-motion environments', () => {
    const base = {
      userAgent: 'Mozilla/5.0',
      platform: 'Linux x86_64',
      hardwareConcurrency: 4,
      deviceMemory: 4,
      reducedMotion: false,
      hidden: false,
    };
    expect(resolveAutoQualityTier(base)).toBe('performance');
    expect(resolveAutoQualityTier({ ...base, hardwareConcurrency: 12, deviceMemory: 16, hidden: true })).toBe('performance');
    expect(resolveAutoQualityTier({ ...base, hardwareConcurrency: 12, deviceMemory: 16, reducedMotion: true })).toBe('performance');
  });

  it('only enables quality mode for clearly capable non-Windows devices', () => {
    expect(resolveAutoQualityTier({
      userAgent: 'Mozilla/5.0 (Macintosh)',
      platform: 'MacIntel',
      hardwareConcurrency: 10,
      deviceMemory: 8,
      reducedMotion: false,
      hidden: false,
    })).toBe('quality');
  });
});
