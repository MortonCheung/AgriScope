import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';

/**
 * demand 帧循环下的动画帧请求。
 *
 * `frameloop="demand"` 只在被请求时渲染。相机转场与抬起插值都属于"由命令/属性驱动"的连续动画：
 * 如果画布此刻完全静止，就没有任何帧，`controls.update(delta)` 与 `useFrame` 都不会被调用，
 * 动画既不推进也不报错——表现为"第一次有动画，之后像突然换了个颜色"。
 *
 * 因此这里在动画期间逐帧请求渲染；到点即停，不会把 WebGL 变成常驻 60FPS。
 * `restartKey` 变化时重新开一次窗口，保证连续多次交互每次都拿到完整动画。
 */
export function useAnimationFrames(active: boolean, maxSeconds: number, restartKey?: unknown) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (!active) return;
    const deadline = performance.now() + maxSeconds * 1000;
    let frame = 0;
    const tick = () => {
      invalidate();
      if (performance.now() > deadline) return;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, invalidate, maxSeconds, restartKey]);
}
