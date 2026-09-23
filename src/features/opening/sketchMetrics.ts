/**
 * Opening 草稿纸的**纯数值策略**（本轮 §12–§15）。
 *
 * 刻意不依赖 three / @react-three，方便在 jsdom 里直接单测：
 *   · 平面覆盖范围（§13）——平面要大到目标屏幕比例下都看不到边界；
 *   · 淡出时序（§15）——0.82 之后网格与手稿完全不透明为 0（§59-5）；
 *   · 挂载门（§14/§15）——只有 Opening 路由才挂载草稿纸（§59-4）。
 */

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

/**
 * 平面半宽（× 省域半径）。
 *
 * 取 8 倍：草稿纸只在 progress < GRID_FADE_END（0.65）期间可见，而这段里最"露边"的
 * 是接近 0.65 的掠射机位 —— 画面顶边射线几乎水平，地面交点可到 ~6.3r（16:10）乃至
 * ~7.3r（21:9）。8r 对目标屏幕比例（1512×982、1440×900、16:9、16:10）与更宽的
 * 21:9 都有余量。是否够大由 `maxGroundHalfSpan(aspect, GRID_FADE_END)` 与单测共同证明（§13/§59-6）。
 */
export const PLANE_HALF_SPAN = 8;
/** 每 1 个省域半径排多少个次要格（决定格子的世界尺寸，与原稿一致）。 */
export const CELLS_PER_RADIUS = 36;
/**
 * 纹理重复次数 = 平面世界尺寸 / 单个 tile 世界尺寸
 *             = (2·PLANE_HALF_SPAN·r) / (GRID_CELLS / CELLS_PER_RADIUS · r)
 *             = 2·PLANE_HALF_SPAN·CELLS_PER_RADIUS / GRID_CELLS
 * 与 r 无关，因此平面放大时格子不会被一起拉成巨格（§13）。
 */
export const GRID_REPEAT = (2 * PLANE_HALF_SPAN * CELLS_PER_RADIUS) / GRID_CELLS;

/**
 * 淡出区间（组装进度 0→1，§15）。
 *
 * 网格必须在 0.60 前完全消失：相机在组装后段会从俯视切向近似水平，
 * 当"画面顶边射线"逼近地平线时，地面可见范围会迅速发散（p≈0.71 是极点）。
 * 只要网格在掠射前已隐没，有限的平面就不会露出边界（§13）。
 * 0.60 仍满足"约 0.65 网格基本消失"，并给覆盖率留出安全余量。
 */
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
