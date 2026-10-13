// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import { StrictMode } from 'react';
import type { CameraControlsImpl } from '@react-three/drei';
import { CameraRig } from './LiaoningCanvas';
import { useSpatialStageStore } from '../spatial/spatialStageStore';
import { provinceView } from './cameraViews';

const invalidate = vi.hoisted(() => vi.fn());
vi.mock('@react-three/fiber', () => ({ Canvas: () => null, useFrame: vi.fn(), useThree: (select: (state: unknown) => unknown) => select({ invalidate }) }));
vi.mock('@react-three/drei', () => ({ CameraControls: () => null, CameraControlsImpl: {}, ContactShadows: () => null, Html: () => null, PerspectiveCamera: () => null }));
vi.mock('./useAnimationFrames', () => ({ useAnimationFrames: vi.fn() }));
afterEach(() => { cleanup(); useSpatialStageStore.getState().reset(); vi.clearAllMocks(); });
function rig() {
  let finish!: () => void;
  const moving = new Promise<void>(resolve => { finish = resolve; });
  const setLookAt = vi.fn((..._args: unknown[]) => moving);
  const controlsRef = { current: { setLookAt } as unknown as CameraControlsImpl };
  const props = { mode: 'city' as const, active: true, phase: 'ready' as const, focusCityId: 'shenyang', reducedMotion: false,
    targetPoint: new THREE.Vector3(5, 0, 8), focusBounds: null, endPose: provinceView(30),
    focusFrame: { width: 1366, height: 900, left: 350, right: 1000, top: 80, bottom: 900 }, geometryRadius: 30, provinceRadius: 30, controlsRef };
  return { props, setLookAt, finish };
}
describe('相机目标稳定性', () => {
  it('StrictMode重演挂载后未完成的相机仍保持渲染，完成回调由当前请求拥有', async () => {
    const { props, setLookAt, finish } = rig(); render(<StrictMode><CameraRig {...props}/></StrictMode>);
    expect(setLookAt).toHaveBeenCalledTimes(2);
    expect(useSpatialStageStore.getState().cameraMoving).toBe(true);
    await act(async () => { finish(); });
    expect(useSpatialStageStore.getState().cameraMoving).toBe(false);
  });
  it('相同城市和数值相机目标不因对象、页面或布局引用更新而重新推近，也不取消未完成运动', async () => {
    const { props, setLookAt, finish } = rig(); const view = render(<CameraRig {...props}/>);
    for (let count = 0; count < 20; count++) view.rerender(<CameraRig {...props} targetPoint={props.targetPoint.clone()} endPose={provinceView(30)} focusFrame={{...props.focusFrame}}/>);
    expect(setLookAt).toHaveBeenCalledOnce(); expect(useSpatialStageStore.getState().cameraMoving).toBe(true);
    await act(async () => { finish(); }); expect(useSpatialStageStore.getState().cameraMoving).toBe(false);
  });
  it('真实城市和省域切换各移动一次，开启减少动画可立即收敛同一目标', () => {
    const { props, setLookAt } = rig(); const view = render(<CameraRig {...props}/>);
    view.rerender(<CameraRig {...props} focusCityId="dalian" targetPoint={new THREE.Vector3(-9, 0, 20)}/>);
    expect(setLookAt).toHaveBeenCalledTimes(2);
    view.rerender(<CameraRig {...props} mode="province" focusCityId={null}/>);
    expect(setLookAt).toHaveBeenCalledTimes(3); expect(setLookAt.mock.calls[2].at(-1)).toBe(true);
    view.rerender(<CameraRig {...props} mode="province" focusCityId={null} reducedMotion/>);
    expect(setLookAt).toHaveBeenCalledTimes(4); expect(setLookAt.mock.calls[3].at(-1)).toBe(false);
    expect(useSpatialStageStore.getState().cameraMoving).toBe(false);
  });
  it('控件重建或重新激活时仍恢复实际姿态', () => {
    const { props, setLookAt } = rig(); const view = render(<CameraRig {...props}/>);
    view.rerender(<CameraRig {...props} active={false}/>); view.rerender(<CameraRig {...props}/>);
    expect(setLookAt).toHaveBeenCalledTimes(2);
    const replacement = vi.fn(() => Promise.resolve());
    view.rerender(<CameraRig {...props} controlsRef={{current:{setLookAt: replacement} as unknown as CameraControlsImpl}}/>);
    expect(replacement).toHaveBeenCalledOnce();
  });
});
