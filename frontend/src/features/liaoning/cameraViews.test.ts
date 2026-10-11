import realGeoJson from '../../../public/geo/liaoning.json';
import { Euler, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { buildLiaoningSolidModel, type GeoCollection } from './liaoningGeometry';
import {
  CAMERA_FOV_DEG, OPENING_DURATION_MS, PROVINCE_ROOT_ROTATION,
  openingView, provinceCityView, provinceStageView, provinceView, responsiveProvinceRadius, startOpeningTimeline,
  type OpeningTimelineClock, type CityFocusFrame,
} from './cameraViews';
import { assemblyHeight, assemblyProgress, assemblyTilt, DROP_DELAY_BASE, DROP_DELAY_SPAN, OPENING_SETTLE_PROGRESS } from '../opening/assemblyMetrics';

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

describe('单条同步推近镜头', () => {
  const endPose = provinceView(RADIUS);
  it('2 秒内推近，在最后地块落定时精确共用省域终点', () => {
    expect(OPENING_DURATION_MS).toBeGreaterThanOrEqual(1500);
    expect(OPENING_DURATION_MS).toBeLessThanOrEqual(2000);
    expect(openingView(endPose, 1)).toBe(endPose);
    expect(openingView(endPose, OPENING_SETTLE_PROGRESS)).toBe(endPose);
    expect(openingView(endPose, 5)).toBe(endPose);
    expect(openingView(endPose, -2)).toEqual(openingView(endPose, 0));
    expect(openingView(endPose, Number.NaN)).toEqual(openingView(endPose, 0));
    expect(PROVINCE_ROOT_ROTATION).toBe(0);
  });
  it('高角度远景沿同一方位连续推近，直到约 0.92；之后镜头静止', () => {
    const first = openingView(endPose, 0);
    const elevation = (pose: typeof endPose) => Math.atan2(pose.position[1] - pose.target[1], Math.hypot(pose.position[0] - pose.target[0], pose.position[2] - pose.target[2]));
    expect(elevation(first) * 180 / Math.PI).toBeGreaterThan(75);
    expect(distance(first.position, first.target)).toBeGreaterThan(distance(endPose.position, endPose.target) * 1.8);
    let previousDistance = Infinity, previousElevation = Infinity;
    const theta = Math.atan2(first.position[2] - first.target[2], first.position[0] - first.target[0]);
    for (let step = 0; step <= 200; step++) {
      const pose = openingView(endPose, step / 200);
      const currentDistance = distance(pose.position, pose.target);
      expect(currentDistance).toBeLessThanOrEqual(previousDistance + 1e-8);
      expect(elevation(pose)).toBeLessThanOrEqual(previousElevation + 1e-8);
      expect(Math.atan2(pose.position[2] - pose.target[2], pose.position[0] - pose.target[0])).toBeCloseTo(theta, 10);
      expect(pose.position[1]).toBeGreaterThan(RADIUS * 3);
      previousDistance = currentDistance;
      previousElevation = elevation(pose);
    }
    expect(openingView(endPose, 0.9)).not.toEqual(endPose);
    for (const p of [0.92, 0.95, 1]) expect(openingView(endPose, p)).toBe(endPose);
  });
  it('60Hz 下连续，末帧无额外跳跃；camera target 不绑定模型原点', () => {
    const offsetPose = { position: [60, 310, 400] as const, target: [52, 3.5, 80] as const };
    let previous = openingView(offsetPose, 0);
    const frames = Math.ceil(OPENING_DURATION_MS / (1000 / 60));
    for (let frame = 1; frame <= frames; frame++) {
      const current = openingView(offsetPose, frame / frames);
      expect(distance(previous.position, current.position)).toBeLessThan(distance(offsetPose.position, offsetPose.target) * .08);
      expect(distance(previous.target, current.target)).toBeLessThan(0.08);
      expect(current.target[0]).toBe(52);
      expect(current.target[2]).toBe(80);
      previous = current;
    }
    const before = openingView(offsetPose, OPENING_SETTLE_PROGRESS - 1e-6);
    expect(distance(before.position, offsetPose.position)).toBeLessThan(1e-8);
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

describe('同步 Opening：实际十四城几何投影', () => {
  it.each([
    [1440, 900, 316, 1124, 122, 830],
    [1024, 768, 270, 759, 118, 702],
    [390, 362.92, 16, 374, 16, 338.92],
    [768, 440.32, 16, 752, 16, 416.32],
  ])('%s × %s：下降过程不截断地块，终点等于真实纸条取景', (width, height, left, right, top, bottom) => {
    const frame = { width, height, left, right, top, bottom };
    const endPose = provinceStageView(actualModel.bounds, actualModel.radius, frame);
    const camera = new PerspectiveCamera(CAMERA_FOV_DEG, width / height, 1, 1200);
    const projected = new Vector3();
    const origin = actualModel.cities.find(city => city.id === 'shenyang')!.centroid;
    const cities = [...actualModel.cities].sort((a, b) => a.centroid.distanceTo(origin) - b.centroid.distanceTo(origin));
    let minimumMargin = 1;
    let minimumDepth = 1, maximumDepth = -1;
    const rotation = new Euler();
    for (let tick = 0; tick <= 180; tick++) {
      const progress = tick / 180;
      const pose = openingView(endPose, progress);
      camera.position.set(...pose.position); camera.lookAt(...pose.target); camera.updateMatrixWorld();
      cities.forEach((city, index) => {
        const delay = DROP_DELAY_BASE + index / (cities.length - 1) * DROP_DELAY_SPAN;
        if (assemblyProgress(progress, delay) === 0) return;
        const height = assemblyHeight(progress, delay, actualModel.radius * 0.5 + city.radius * 1.3);
        const tilt = assemblyTilt(progress, delay);
        rotation.set(tilt, 0, -tilt);
        for (const ring of city.rings) for (const p of ring) for (const y of [0, 1.8]) {
          projected.set(p.x, y, -p.y).applyEuler(rotation);
          projected.y += height;
          projected.project(camera);
          minimumMargin = Math.min(minimumMargin, 1 - Math.max(Math.abs(projected.x), Math.abs(projected.y)));
          minimumDepth = Math.min(minimumDepth, projected.z);
          maximumDepth = Math.max(maximumDepth, projected.z);
        }
      });
    }
    expect(minimumMargin).toBeGreaterThan(0.04);
    expect(minimumDepth).toBeGreaterThan(-1);
    expect(maximumDepth).toBeLessThan(1);
    expect(openingView(endPose, 1)).toBe(endPose);
  });

  it('研究工作台的旧半径适配仍对未知 aspect 有安全边界', () => {
    expect(responsiveProvinceRadius(actualModel.radius, 390 / 844)).toBeGreaterThan(actualModel.radius);
    expect(responsiveProvinceRadius(actualModel.radius, 16 / 9)).toBe(actualModel.radius);
    expect(responsiveProvinceRadius(actualModel.radius, Number.NaN)).toBe(actualModel.radius);
    expect(() => responsiveProvinceRadius(0, 1)).toThrow(RangeError);
  });
});
