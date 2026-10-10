import { maxGroundHalfSpan, type CameraPose } from '../liaoning/cameraViews';

/** Opening paper metrics, shared by the renderer and projection checks. */

/** 方格纹理画布边长（px）。 */
export const GRID_TEXTURE_SIZE = 2048;
/** 画布上的网格划分：次要格 96 格，主要格每 8 格一条。 */
export const GRID_CELLS = 96;
export const MAJOR_EVERY = 8;

export const MINOR_COLOR = '#b9b1a6';
export const MAJOR_COLOR = '#a49a8d';
export const DRAFT_COLOR = '#8f8577';
export const OUTLINE_COLOR = '#6f6659';

/** 材质总透明度；画布内部的 alpha 比例保证 minor < major。 */
export const GRID_OPACITY = 0.34;
export const MINOR_ALPHA = 0.33;
export const MAJOR_ALPHA = 0.62;

/** 屏幕像素线宽：市界 1.1、外轮廓 2.2（层级分明且都看得见）。 */
export const DRAFT_LINE_WIDTH = 1.1;
export const OUTLINE_LINE_WIDTH = 2.2;
export const DRAFT_OPACITY = 0.5;
export const OUTLINE_OPACITY = 0.62;

/** Minimum paper half-width; the actual camera's visible ground can enlarge it. */
export const PLANE_HALF_SPAN = 8;
/** Minor grid density per province radius. */
export const CELLS_PER_RADIUS = 36;

/** The paper covers the entire shared trajectory while the grid is visible. */
export function sketchHalfSpan(radius: number, aspect: number, endPose: CameraPose): number {
  return Math.max(radius * PLANE_HALF_SPAN, maxGroundHalfSpan(endPose, aspect, GRID_FADE_END) * 1.05);
}

/** Increasing paper coverage preserves the world-space cell size. */
export function gridRepeatForHalfSpan(half: number, radius: number): number {
  return 2 * half * CELLS_PER_RADIUS / (radius * GRID_CELLS);
}

/** The draft fades while solids approach their final positions. */
export const FADE_START = 0.15;
export const GRID_FADE_END = 0.6;
export const DRAFT_FADE_END = 0.82;

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/** 进度淡出：progress ≤ start 全显，≥ end 全隐，中间用 smoothstep 平滑收束。 */
function fadeOut(progress: number, start: number, end: number): number {
  if (progress <= start) return 1;
  if (progress >= end) return 0;
  const t = (progress - start) / (end - start);
  return 1 - t * t * (3 - 2 * t);
}

/** 网格淡化系数（1 = 全显，0 = 全隐）。 */
export function gridFadeAt(progress: number): number {
  return fadeOut(clamp01(progress), FADE_START, GRID_FADE_END);
}

/** 手稿/外轮廓淡化系数（1 = 全显，0 = 全隐）。 */
export function draftFadeAt(progress: number): number {
  return fadeOut(clamp01(progress), FADE_START, DRAFT_FADE_END);
}

/** 网格实际不透明度（含材质总透明度）；progress ≥ 0.65 起恒为 0。 */
export function gridOpacityAt(progress: number): number {
  return GRID_OPACITY * gridFadeAt(progress);
}

/** 手稿线实际不透明度；progress ≥ 0.82 起恒为 0。 */
export function draftLineOpacityAt(progress: number): number {
  return DRAFT_OPACITY * draftFadeAt(progress);
}

/** 外轮廓线实际不透明度；progress ≥ 0.82 起恒为 0。 */
export function outlineOpacityAt(progress: number): number {
  return OUTLINE_OPACITY * draftFadeAt(progress);
}

/** 只有 Opening 路由才挂载草稿纸（§14/§15）：/liaoning 正式场景根本不渲染它。 */
export function shouldMountSketchPaper(mode: 'opening' | 'province' | 'city'): boolean {
  return mode === 'opening';
}
