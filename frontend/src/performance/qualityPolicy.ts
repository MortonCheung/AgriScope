import type { QualityConfig, ResolvedQualityTier, RuntimeQualitySignals } from './types';

export const QUALITY_CONFIG: Record<ResolvedQualityTier, QualityConfig> = {
  quality: { tier: 'quality', maxRenderPixels: 3_600_000, minDpr: 0.65, maxDpr: 1.5, curveSegments: 18, maxLabels: 12, bloom: true, idleFps: 30, activePulseCount: 16 },
  balanced: { tier: 'balanced', maxRenderPixels: 2_400_000, minDpr: 0.55, maxDpr: 1.25, curveSegments: 10, maxLabels: 8, bloom: true, idleFps: 24, activePulseCount: 9 },
  performance: { tier: 'performance', maxRenderPixels: 1_300_000, minDpr: 0.5, maxDpr: 1, curveSegments: 6, maxLabels: 5, bloom: false, idleFps: 18, activePulseCount: 5 },
};

export function resolveDpr(width: number, height: number, deviceDpr: number, config: QualityConfig) {
  const budgetDpr = Math.sqrt(config.maxRenderPixels / Math.max(1, width * height));
  return Math.min(deviceDpr, config.maxDpr, Math.max(config.minDpr, budgetDpr));
}

/**
 * 自动档只在设备明确足够强时启用高画质；Windows、移动设备以及低内存/低核心数设备
 * 使用更保守的档位。页面隐藏时临时降为性能档，恢复可见后会重新按硬件解析。
 */
export function resolveAutoQualityTier(signals: RuntimeQualitySignals): ResolvedQualityTier {
  if (signals.hidden || signals.reducedMotion) return 'performance';

  const platform = `${signals.platform} ${signals.userAgent}`;
  const isWindows = /Windows|Win32|Win64/i.test(platform);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(platform);
  const lowMemory = signals.deviceMemory !== undefined && signals.deviceMemory <= 4;
  const lowCpu = signals.hardwareConcurrency !== undefined && signals.hardwareConcurrency <= 4;

  if (isMobile || lowMemory || lowCpu) return 'performance';
  if (isWindows) {
    const clearlyCapable = (signals.hardwareConcurrency ?? 0) >= 10 && (signals.deviceMemory ?? 0) >= 8;
    return clearlyCapable ? 'balanced' : 'performance';
  }

  const highMemory = signals.deviceMemory !== undefined && signals.deviceMemory >= 8;
  const highCpu = signals.hardwareConcurrency !== undefined && signals.hardwareConcurrency >= 8;
  return highMemory && highCpu ? 'quality' : 'balanced';
}

export function readRuntimeQualitySignals(): RuntimeQualitySignals {
  const runtimeNavigator = navigator as Navigator & { deviceMemory?: number };
  return {
    userAgent: runtimeNavigator.userAgent,
    platform: runtimeNavigator.platform,
    hardwareConcurrency: runtimeNavigator.hardwareConcurrency,
    deviceMemory: runtimeNavigator.deviceMemory,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    hidden: document.visibilityState === 'hidden',
  };
}
