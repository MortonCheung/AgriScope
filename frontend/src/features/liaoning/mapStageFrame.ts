import type { CityFocusFrame } from './cameraViews';

type Rect = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>;

/** Convert the shared CSS window to R3F's actual Canvas coordinates. */
export function mapStageFrame(canvas: Rect, window: Rect | undefined, size: { width: number; height: number }): CityFocusFrame {
  const { width, height } = size;
  if (!window || window.width <= 0 || window.height <= 0 || canvas.width <= 0 || canvas.height <= 0) {
    return { width, height, left: 16, right: Math.max(17, width - 16), top: 16, bottom: Math.max(17, height - 24) };
  }
  const scaleX = width / canvas.width, scaleY = height / canvas.height;
  return {
    width, height,
    left: (window.left - canvas.left) * scaleX,
    right: (window.right - canvas.left) * scaleX,
    top: (window.top - canvas.top) * scaleY,
    bottom: (window.bottom - canvas.top) * scaleY,
  };
}
