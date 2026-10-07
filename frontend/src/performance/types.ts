export type QualityPreference = 'auto' | 'quality' | 'balanced' | 'performance';
export type ResolvedQualityTier = Exclude<QualityPreference, 'auto'>;

export interface QualityConfig {
  tier: ResolvedQualityTier;
  maxRenderPixels: number;
  minDpr: number;
  maxDpr: number;
  curveSegments: number;
  maxLabels: number;
  bloom: boolean;
  idleFps: number;
  activePulseCount: number;
}

export interface RuntimeQualitySignals {
  userAgent: string;
  platform: string;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  reducedMotion: boolean;
  hidden: boolean;
}
