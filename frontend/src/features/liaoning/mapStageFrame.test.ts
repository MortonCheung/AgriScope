import { describe, expect, it } from 'vitest';
import { mapStageFrame } from './mapStageFrame';
const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height });

describe('Opening 与主页共用 CSS 几何窗口', () => {
  it.each([[1440, 900, 0], [768, 440.32, 62], [390, 362.92, 62]])('两路由在同 Canvas 读取同一取景矩形 (%s × %s)', (width, height, top) => {
    const canvas = rect(0, top, width, height);
    const anchor = rect(16, top + 16, width - 32, height - 40);
    const opening = mapStageFrame(canvas, anchor, { width, height });
    const province = mapStageFrame(canvas, anchor, { width, height });
    expect(opening).toEqual(province);
    expect(opening.top).toBe(16);
    expect(opening.bottom).toBeCloseTo(height - 24, 10);
  });
  it('按实际 Canvas 坐标换算，不把 Header 位移或 CSS 缩放混入 FOV', () => {
    expect(mapStageFrame(rect(100, 80, 720, 450), rect(200, 120, 500, 370), { width: 1440, height: 900 })).toEqual({
      width: 1440, height: 900, left: 200, right: 1200, top: 80, bottom: 820,
    });
  });
  it('未布局时保持有限的可见边界', () => {
    const frame = mapStageFrame(rect(0, 0, 0, 0), undefined, { width: 390, height: 363 });
    expect(frame).toEqual({ width: 390, height: 363, left: 16, right: 374, top: 16, bottom: 339 });
  });
});
