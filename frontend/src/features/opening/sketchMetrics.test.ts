import { describe, expect, it } from 'vitest';
import { maxGroundHalfSpan, provinceView } from '../liaoning/cameraViews';
import {
  CELLS_PER_RADIUS,
  GRID_CELLS,
  GRID_FADE_END,
  gridRepeatForHalfSpan,
  sketchHalfSpan,
  PLANE_HALF_SPAN,
  draftFadeAt,
  draftLineOpacityAt,
  gridFadeAt,
  gridOpacityAt,
  outlineOpacityAt,
  shouldMountSketchPaper,
} from './sketchMetrics';

/**
 * 草稿纸数值策略（本轮 §12–§15 / §59 的 4–6 条）。
 *
 * 这些是 correctness 断言，不是视觉偏好：网格必须铺到视野外（§13）、
 * 0.82 之后必须完全消失（§15）、正式省域页根本不挂载（§14）。
 */

describe('草稿纸只在 Opening 挂载（§14/§15/§59-4）', () => {
  it('只有 opening 为真，province / city 都为空', () => {
    expect(shouldMountSketchPaper('opening')).toBe(true);
    expect(shouldMountSketchPaper('province')).toBe(false);
    expect(shouldMountSketchPaper('city')).toBe(false);
  });
});

describe('草稿退出时序（§15/§59-5）', () => {
  it('起点：网格与手稿完全可见', () => {
    expect(gridFadeAt(0)).toBe(1);
    expect(draftFadeAt(0)).toBe(1);
    expect(gridOpacityAt(0)).toBeGreaterThan(0);
    expect(draftLineOpacityAt(0)).toBeGreaterThan(0);
    expect(outlineOpacityAt(0)).toBeGreaterThan(0);
  });

  it('0.15 之前保持完整（先让用户看清草稿）', () => {
    expect(gridFadeAt(0.15)).toBe(1);
    expect(draftFadeAt(0.15)).toBe(1);
  });

  it('网格在 GRID_FADE_END（0.60）完全消失，此后恒为 0', () => {
    expect(gridOpacityAt(GRID_FADE_END)).toBe(0);
    expect(gridOpacityAt(0.65)).toBe(0);
    expect(gridOpacityAt(0.9)).toBe(0);
    expect(gridOpacityAt(1)).toBe(0);
  });

  it('手稿与外轮廓在 0.82 完全消失，progress ≥ 0.9 全为 0', () => {
    expect(draftLineOpacityAt(0.82)).toBe(0);
    expect(outlineOpacityAt(0.82)).toBe(0);
    expect(draftLineOpacityAt(0.9)).toBe(0);
    expect(outlineOpacityAt(0.9)).toBe(0);
  });

  it('淡化过程单调不增（不会突然闪回）', () => {
    for (let progress = 0; progress < 1; progress += 0.05) {
      expect(gridFadeAt(progress + 0.05)).toBeLessThanOrEqual(gridFadeAt(progress) + 1e-9);
      expect(draftFadeAt(progress + 0.05)).toBeLessThanOrEqual(draftFadeAt(progress) + 1e-9);
    }
  });
});

describe('平面覆盖所有目标屏幕比例（§13/§59-6）', () => {
  const ASPECTS: Record<string, number> = {
    '1512×982': 1512 / 982,
    '1440×900': 1440 / 900,
    '16:9': 16 / 9,
    '16:10': 16 / 10,
    // 更极端的宽屏也留足余量，避免"换台显示器就露边"。
    '21:9': 21 / 9,
  };

  it.each(Object.entries(ASPECTS))('%s：平面半宽足以覆盖画面内所有地面', (_label, aspect) => {
    // 只要求覆盖网格仍然可见的那段进度（0 → GRID_FADE_END）；此后网格已不可见。
    const endPose = provinceView(28.8);
    const half = sketchHalfSpan(28.8, aspect, endPose);
    expect(half).toBeGreaterThanOrEqual(28.8 * PLANE_HALF_SPAN);
    expect(maxGroundHalfSpan(endPose, aspect, GRID_FADE_END)).toBeLessThan(half);
  });
});

describe('格子世界尺寸恒定（§13）', () => {
  it.each([8, 12, 24])('扩大到 %s 个半径仍保持每格世界尺寸', halfRadius => {
    const radius = 28.8, half = radius * halfRadius;
    const repeat = gridRepeatForHalfSpan(half, radius);
    expect(2 * half / (repeat * GRID_CELLS)).toBeCloseTo(radius / CELLS_PER_RADIUS, 12);
  });
  it('实际相机后撤时自动扩大纸面，不露出固定 8r 边缘', () => {
    const pose = { position: [0, 180, 180] as const, target: [0, 0, 0] as const };
    const half = sketchHalfSpan(10, 21 / 9, pose);
    expect(half).toBeGreaterThan(10 * PLANE_HALF_SPAN);
    expect(half).toBeGreaterThan(maxGroundHalfSpan(pose, 21 / 9, GRID_FADE_END));
  });
});
