import realGeoJson from '../../../public/geo/liaoning.json';
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { buildLiaoningSolidModel, type GeoCollection } from './liaoningGeometry';
import {
  CAMERA_FOV_DEG, ENTRY_AZIMUTH_ORBIT_DEGREES, OPENING_DURATION_MS, OPENING_TIMELINE, PROVINCE_ROOT_ROTATION,
  azimuthDegrees, maxGroundHalfSpan, openingStageForProgress, orbitSpanDegrees, orbitView,
  provinceCityView, provinceStageView, provinceView, responsiveProvinceRadius, sketchView, startOpeningTimeline, type OpeningTimelineClock, type CityFocusFrame,
} from './cameraViews';

const RADIUS = 100;
const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((value, index) => value - b[index]));

function fakeClock() {
  let time = 0;
  let nextHandle = 0;
  const pending = new Map<number, FrameRequestCallback>();
  const clock: OpeningTimelineClock = {
    now: () => time,
    requestFrame: (callback) => { const handle = ++nextHandle; pending.set(handle, callback); return handle; },
    cancelFrame: (handle) => { pending.delete(handle); },
  };
  return {
    clock, pending,
    advance: (milliseconds: number) => {
      time += milliseconds;
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((callback) => callback(time));
    },
  };
}

describe('完整一周的曲线导演镜头', () => {
  it('精确共用草稿起点与正式省域终点，越界进度也安全', () => {
    expect(orbitView(RADIUS, 0)).toEqual(sketchView(RADIUS));
    expect(orbitView(RADIUS, 1)).toEqual(provinceView(RADIUS));
    expect(orbitView(RADIUS, -2)).toEqual(sketchView(RADIUS));
    expect(orbitView(RADIUS, 5)).toEqual(provinceView(RADIUS));
    expect(orbitView(RADIUS, Number.NaN)).toEqual(sketchView(RADIUS));
  });

  it('累计方位实际走过 360°，首尾角相同不能误判成没有环绕', () => {
    expect(ENTRY_AZIMUTH_ORBIT_DEGREES).toBe(360);
    expect(orbitSpanDegrees(RADIUS)).toBeCloseTo(360, 7);
    expect(azimuthDegrees(orbitView(RADIUS, 0))).toBeCloseTo(azimuthDegrees(orbitView(RADIUS, 1)), 7);
    let previous = azimuthDegrees(orbitView(RADIUS, 0));
    let unwrapped = 0;
    for (let index = 1; index <= 720; index++) {
      const current = azimuthDegrees(orbitView(RADIUS, index / 720));
      const delta = ((current - previous + 540) % 360) - 180;
      expect(delta).toBeGreaterThanOrEqual(-1e-7);
      unwrapped += delta;
      previous = current;
    }
    expect(unwrapped).toBeCloseTo(360, 7);
  });

  it('每个阶段边界保持位置与独立 target 连续；曲线不穿地块', () => {
    for (const segment of OPENING_TIMELINE.slice(1)) {
      const before = orbitView(RADIUS, segment.start - 1e-6);
      const after = orbitView(RADIUS, segment.start + 1e-6);
      expect(distance(before.position, after.position)).toBeLessThan(RADIUS * 1e-4);
      expect(distance(before.target, after.target)).toBeLessThan(RADIUS * 1e-4);
    }
    for (let index = 0; index <= 720; index++) {
      const pose = orbitView(RADIUS, index / 720);
      expect(pose.position[1]).toBeGreaterThan(RADIUS * 2.7);
      expect(pose.target[0]).toBe(0);
      expect(pose.target[2]).toBe(0);
    }
    expect(orbitView(RADIUS, 0.88).position[1]).toBeLessThan(provinceView(RADIUS).position[1]);
  });

  it('固定 60Hz 下无单帧远距离跳跃，半径变化保持相同归一化构图', () => {
    let previous = orbitView(RADIUS, 0);
    for (let frame = 1; frame <= OPENING_DURATION_MS / (1000 / 60); frame++) {
      const current = orbitView(RADIUS, frame / (OPENING_DURATION_MS / (1000 / 60)));
      expect(distance(previous.position, current.position)).toBeLessThan(RADIUS * 0.16);
      previous = current;
    }
    for (const radius of [12, 28.781682, 60]) {
      for (const progress of [0, 0.18, 0.5, 0.88, 1]) {
        const pose = orbitView(radius, progress);
        const normalized = orbitView(1, progress);
        pose.position.forEach((value, index) => expect(value / radius).toBeCloseTo(normalized.position[index], 10));
        pose.target.forEach((value, index) => expect(value / radius).toBeCloseTo(normalized.target[index], 10));
      }
    }
  });

  it('弧长采样避免控制点疏密导致环绕速度突跳', () => {
    const inverseSmoothstep = (value: number) => {
      let low = 0, high = 1;
      for (let iteration = 0; iteration < 40; iteration++) {
        const midpoint = (low + high) / 2;
        if (midpoint * midpoint * (3 - 2 * midpoint) < value) low = midpoint;
        else high = midpoint;
      }
      return (low + high) / 2;
    };
    const lengths = [];
    let previous = orbitView(RADIUS, 0.18);
    for (let index = 1; index <= 160; index++) {
      const pose = orbitView(RADIUS, 0.18 + inverseSmoothstep(index / 160) * 0.7);
      lengths.push(distance(previous.position, pose.position));
      previous = pose;
    }
    expect(Math.max(...lengths) / Math.min(...lengths)).toBeLessThan(1.01);
  });

  it('草稿高俯视、四段时间线和正式机位均符合空间任务', () => {
    const pose = sketchView(RADIUS);
    expect(Math.atan2(pose.position[1], Math.hypot(pose.position[0], pose.position[2])) * 180 / Math.PI).toBeGreaterThan(75);
    expect(openingStageForProgress(0).stage).toBe('draft');
    expect(openingStageForProgress(0.08).stage).toBe('assembly');
    expect(openingStageForProgress(0.5).stage).toBe('orbit');
    expect(openingStageForProgress(1).stage).toBe('settle');
    expect(PROVINCE_ROOT_ROTATION).toBe(0);
    expect(Object.keys(orbitView(RADIUS, 0.42)).sort()).toEqual(['position', 'target']);
  });
});

describe('省域地面覆盖', () => {
  it('网格可见阶段仍覆盖超宽屏地面', () => {
    expect(maxGroundHalfSpan(21 / 9, 0.6)).toBeLessThan(6);
    expect(maxGroundHalfSpan(21 / 9)).toBeGreaterThan(maxGroundHalfSpan(4 / 3));
  });
});

describe('单条相机时间线的资源生命周期', () => {
  it('延迟 RAF 只完成一次，并最终提交线性进度 1', () => {
    const frameClock = fakeClock();
    const onProgress = vi.fn(), onComplete = vi.fn();
    const stop = startOpeningTimeline(onProgress, onComplete, frameClock.clock);
    frameClock.advance(OPENING_DURATION_MS / 2);
    expect(onProgress).toHaveBeenLastCalledWith(0.5);
    frameClock.advance(OPENING_DURATION_MS * 2);
    expect(onProgress).toHaveBeenLastCalledWith(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    stop();
    frameClock.advance(OPENING_DURATION_MS);
    expect(frameClock.pending.size).toBe(0);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('中断/跳过取消待执行帧，已被浏览器取出的旧回调也不能推进', () => {
    const frameClock = fakeClock();
    const onProgress = vi.fn(), onComplete = vi.fn();
    const stop = startOpeningTimeline(onProgress, onComplete, frameClock.clock);
    const staleCallback = [...frameClock.pending.values()][0];
    stop();
    stop();
    staleCallback(OPENING_DURATION_MS);
    frameClock.advance(OPENING_DURATION_MS * 3);
    expect(frameClock.pending.size).toBe(0);
    expect(onProgress).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('StrictMode setup → cleanup → setup 保留一条有效时间线', () => {
    const frameClock = fakeClock();
    const onComplete = vi.fn();
    const firstStop = startOpeningTimeline(vi.fn(), onComplete, frameClock.clock);
    firstStop();
    startOpeningTimeline(vi.fn(), onComplete, frameClock.clock);
    expect(frameClock.pending.size).toBe(1);
    frameClock.advance(OPENING_DURATION_MS);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(frameClock.pending.size).toBe(0);
  });
});


// 使用渲染层的真实简化几何，避免只证明理想圆形或包围盒比例。
const realGeo = realGeoJson as GeoCollection;
const actualModel = buildLiaoningSolidModel(realGeo);

describe('真实城市 bbox 和纸条安全区的取景', () => {
  const frames: CityFocusFrame[] = [
    { width: 1920, height: 1080, left: 380, right: 1540, top: 128, bottom: 1012 },
    { width: 1440, height: 900, left: 316, right: 1124, top: 122, bottom: 830 },
    { width: 1024, height: 768, left: 270, right: 759, top: 118, bottom: 702 },
    { width: 768, height: 440.32, left: 16, right: 752, top: 16, bottom: 416.32 },
    { width: 390, height: 362.92, left: 16, right: 374, top: 16, bottom: 338.92 },
  ];
  const cameras = new WeakMap<object, PerspectiveCamera>();
  function project(pose: ReturnType<typeof provinceView>, frame: CityFocusFrame, point: Vector3) {
    let camera = cameras.get(pose);
    if (!camera) {
      camera = new PerspectiveCamera(CAMERA_FOV_DEG, frame.width / frame.height, 1, 1200);
      camera.position.set(...pose.position); camera.lookAt(...pose.target); camera.updateMatrixWorld();
      cameras.set(pose, camera);
    }
    const p = point.clone().project(camera);
    return { x: (p.x + 1) * frame.width / 2, y: (1 - p.y) * frame.height / 2, z: p.z };
  }
  it.each(frames)('默认完整辽宁位于真实可见区域（$width × $height）', frame => {
    const pose = provinceStageView(actualModel.bounds, actualModel.radius, frame);
    for (const ring of actualModel.provinceRings) for (const p of ring) for (const y of [0, 1.8]) {
      const projected = project(pose, frame, new Vector3(p.x, y, -p.y));
      expect(projected.x).toBeGreaterThan(frame.left);
      expect(projected.x).toBeLessThan(frame.right);
      expect(projected.y).toBeGreaterThan(frame.top);
      expect(projected.y).toBeLessThan(frame.bottom);
      expect(projected.z).toBeGreaterThan(-1);
      expect(projected.z).toBeLessThan(1);
    }
  });
  it.each(frames)('六城显著推近，地块及选中抬升均不被纸条截住（$width × $height）', frame => {
    const province = provinceStageView(actualModel.bounds, actualModel.radius, frame);
    for (const city of actualModel.cities.filter(c => c.hasResearch)) {
      const pose = provinceCityView(city.bounds, actualModel.radius, frame);
      expect(distance(pose.position, pose.target)).toBeLessThan(distance(province.position, province.target) * 0.85);
      const center = project(pose, frame, new Vector3((city.bounds.minX + city.bounds.maxX) / 2, 1.4, (city.bounds.minZ + city.bounds.maxZ) / 2));
      expect(center.x).toBeCloseTo((frame.left + frame.right) / 2, 5);
      expect(center.y).toBeCloseTo((frame.top + frame.bottom) / 2, 5);
      for (const ring of city.rings) for (const p of ring) for (const y of [0, 2.664]) {
        const projected = project(pose, frame, new Vector3(p.x, y, -p.y));
        expect(projected.x).toBeGreaterThan(frame.left);
        expect(projected.x).toBeLessThan(frame.right);
        expect(projected.y).toBeGreaterThan(frame.top);
        expect(projected.y).toBeLessThan(frame.bottom);
        expect(projected.z).toBeGreaterThan(-1);
        expect(projected.z).toBeLessThan(1);
      }
    }
  });
  it('改变纸条宽度会后撤取景，连续换城保持相同方位而非翻转', () => {
    const city = actualModel.cities.find(c => c.id === 'chaoyang')!;
    const wide = frames[1], narrow = { ...wide, left: 480, right: 960 };
    const a = provinceCityView(city.bounds, actualModel.radius, wide), b = provinceCityView(city.bounds, actualModel.radius, narrow);
    expect(distance(b.position, b.target)).toBeGreaterThan(distance(a.position, a.target));
    for (const other of actualModel.cities.filter(c => c.hasResearch)) {
      const p = provinceCityView(other.bounds, actualModel.radius, wide);
      expect(Math.atan2(p.position[2] - p.target[2], p.position[0] - p.target[0])).toBeCloseTo(Math.atan2(a.position[2] - a.target[2], a.position[0] - a.target[0]), 8);
    }
  });
});

describe('移动端响应式省域取景：真实 GeoJSON 几何验收', () => {
  it.each([
    ['全屏 Opening 的保守检查', 390, 844],
    ['紧凑省域舞台的检查', 390, 363],
    ['正式共用手机舞台', 390, 362.92],
    ['正式共用平板舞台', 768, 440.32],
  ] as const)('%s（%d × %d）：完整轨迹不截地块', (_name, width, height) => {
    const aspect = width / height;
    const fittedRadius = responsiveProvinceRadius(actualModel.radius, aspect);
    const camera = new PerspectiveCamera(CAMERA_FOV_DEG, aspect, 1, 1200);
    const projected = new Vector3();
    let minimumMargin = 1;
    let minimumDepth = 1, maximumDepth = -1;
    for (let frame = 0; frame <= 180; frame++) {
      const pose = orbitView(fittedRadius, frame / 180);
      camera.position.set(...pose.position);
      camera.lookAt(...pose.target);
      camera.updateMatrixWorld();
      for (const ring of actualModel.provinceRings) {
        for (const point of ring) {
          for (const y of [0, 1.8]) {
            projected.set(point.x, y, -point.y).project(camera);
            minimumMargin = Math.min(minimumMargin, 1 - Math.max(Math.abs(projected.x), Math.abs(projected.y)));
            minimumDepth = Math.min(minimumDepth, projected.z);
            maximumDepth = Math.max(maximumDepth, projected.z);
          }
        }
      }
    }
    expect(minimumMargin).toBeGreaterThan(0.04);
    expect(minimumDepth).toBeGreaterThan(-1);
    expect(maximumDepth).toBeLessThan(1);
    expect(orbitView(fittedRadius, 1)).toEqual(provinceView(fittedRadius));
  });

  it('同一个真实 Canvas 舞台为 Opening 末帧和省域首帧提供相同 fit', () => {
    for (const [width, height] of [[390, 362.92], [768, 440.32]]) {
      const openingFit = responsiveProvinceRadius(actualModel.radius, width / height);
      const provinceFit = responsiveProvinceRadius(actualModel.radius, width / height);
      expect(openingFit).toBe(provinceFit);
      expect(orbitView(openingFit, 1)).toEqual(provinceView(provinceFit));
    }
  });

  it('只缩窄屏幕时后撤相机，宽屏不改变正式半径；未布局的比例不产生 NaN', () => {
    expect(responsiveProvinceRadius(actualModel.radius, 390 / 844)).toBeGreaterThan(actualModel.radius);
    expect(responsiveProvinceRadius(actualModel.radius, 390 / 363)).toBe(actualModel.radius);
    expect(responsiveProvinceRadius(actualModel.radius, 16 / 9)).toBe(actualModel.radius);
    expect(responsiveProvinceRadius(actualModel.radius, Number.NaN)).toBe(actualModel.radius);
    expect(() => responsiveProvinceRadius(0, 1)).toThrow(RangeError);
  });
});
