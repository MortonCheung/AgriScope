import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { CameraControls, CameraControlsImpl, ContactShadows, Html, PerspectiveCamera } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { STUDY_CITY_IDS } from '../../domain/geography/cities';
import { CitySolidMesh, SOLID_DEPTH } from './CitySolidMesh';
import { PaperGround } from './PaperGround';
import { useLiaoningModel } from './useLiaoningModel';
import { useAnimationFrames } from './useAnimationFrames';
import { QUALITY_CONFIG, resolveAutoQualityTier, resolveDpr, readRuntimeQualitySignals } from '../../performance/qualityPolicy';
import { SCENE_TOKENS } from '../../design/sceneTokens';
import { MOTION_DURATION } from '../../design/motion';
import { hasSeenOpening } from '../opening/openingSession';

export interface LiaoningCanvasProps {
  mode: 'opening' | 'province' | 'city';
  focusCityId: string | null;
  hoveredCityId: string | null;
  dollyToken: number;
  onHoverCity: (cityId: string | null) => void;
  onSelectCity: (cityId: string) => void;
  /**
   * 相机一次移动结束（含省域推近城市）后回调。
   * 路由切换由这个真实事件驱动，而不是固定等待时长。
   */
  onCameraRest?: () => void;
  reducedMotion: boolean;
}

type Emphasis = 'base' | 'study' | 'focus' | 'dim';

/** 城市视角终点：省域推近与城市路由共用同一组数值，保证切换路由时相机不跳。 */
function cityView(targetPoint: THREE.Vector3, radius: number) {
  return {
    position: [targetPoint.x + radius * 0.24, radius * 0.5, targetPoint.z + radius * 0.5] as const,
    target: [targetPoint.x, 1.6, targetPoint.z] as const,
  };
}

/** 视差强度（V4 §二十一）：Opening 更明显，正式省域沙盘更轻；城市 Reader 关闭。 */
const PARALLAX_DEG = { opening: 1.5, province: 0.7 } as const;
const PARALLAX_LERP = 0.08;
const PARALLAX_EPSILON = 0.0002;

/**
 * 极轻的鼠标视差（V4 §二十）。
 *
 * 旧实现把 useAnimationFrames(moving, MOTION_DURATION.slow) 当作生命周期：
 * 帧窗口只有 0.44s，窗口结束后即使指针还在持续移动也不会再开新窗口，
 * 于是表现为"一开始会倾斜，约半秒后就不再响应"。
 *
 * 新实现不依赖任何固定时长：
 *   pointermove → 更新 target → 立即 invalidate()
 *   useFrame    → 向 target 收敛 → 未收敛继续 invalidate() → 收敛即停
 * 关闭时（进入城市 Reader）同样收敛回 0，不会把倾斜留在地图上。
 */
function ParallaxGroup({ strength, enabled, children }: {
  strength: keyof typeof PARALLAX_DEG;
  enabled: boolean;
  children: ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    if (!enabled) return;
    const onMove = (event: PointerEvent) => {
      pointer.current = {
        x: (event.clientX / window.innerWidth) * 2 - 1,
        y: (event.clientY / window.innerHeight) * 2 - 1,
      };
      invalidate();
    };
    const onLeave = () => { pointer.current = { x: 0, y: 0 }; invalidate(); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
    };
  }, [enabled, invalidate]);

  useFrame(() => {
    const instance = group.current;
    if (!instance) return;
    const limit = enabled ? THREE.MathUtils.degToRad(PARALLAX_DEG[strength]) : 0;
    const targetZ = enabled ? -pointer.current.x * limit : 0;
    const targetX = enabled ? pointer.current.y * limit : 0;
    const deltaZ = targetZ - instance.rotation.z;
    const deltaX = targetX - instance.rotation.x;
    if (Math.abs(deltaZ) < PARALLAX_EPSILON && Math.abs(deltaX) < PARALLAX_EPSILON) {
      instance.rotation.set(targetX, 0, targetZ);
      return;
    }
    instance.rotation.z += deltaZ * PARALLAX_LERP;
    instance.rotation.x += deltaX * PARALLAX_LERP;
    invalidate();
  });

  return <group ref={group}>{children}</group>;
}

/**
 * Opening 揭示时间轴（V2 §61）：把 0–1 的进度写进一个引用，每帧由各城市自己读取，
 * 因此整段编排不触发任何 React 渲染。
 * 只在首次进入时完整播放；session 内再次回到首页、或 reduced motion 时直接给最终状态（§63/§64）。
 */
function OpeningRevealDriver({ mode, reducedMotion, progressRef }: {
  mode: LiaoningCanvasProps['mode'];
  reducedMotion: boolean;
  progressRef: RefObject<number>;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const [seen] = useState(() => hasSeenOpening());

  useEffect(() => {
    const playing = mode === 'opening' && !reducedMotion && !seen;
    if (!playing) {
      progressRef.current = 1;
      invalidate();
      return;
    }
    const total = MOTION_DURATION.opening * 1000;
    const start = performance.now();
    let frame = 0;
    const step = () => {
      const progress = Math.min(1, (performance.now() - start) / total);
      progressRef.current = progress;
      invalidate();
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [invalidate, mode, progressRef, reducedMotion, seen]);

  return null;
}

function CameraRig({ mode, focusCityId, dollyToken, reducedMotion, onCameraRest, targetPoint, provinceRadius }: {
  mode: LiaoningCanvasProps['mode'];
  focusCityId: string | null;
  dollyToken: number;
  reducedMotion: boolean;
  onCameraRest?: () => void;
  targetPoint: THREE.Vector3;
  provinceRadius: number;
}) {
  const controls = useRef<CameraControlsImpl>(null);
  /**
   * 相机是否正在移动。
   * 为真时逐帧请求渲染：否则画布静止时下达的 setLookAt 不会开始，也不会结束。
   */
  const [dollying, setDollying] = useState(false);
  useAnimationFrames(dollying, MOTION_DURATION.camera * 3);

  useEffect(() => {
    const instance = controls.current;
    if (!instance) return;
    const smooth = !reducedMotion;
    const radius = Math.max(12, provinceRadius);
    if (mode === 'opening') {
      if (smooth) setDollying(true);
      void instance.setLookAt(radius * 0.1, radius * 0.86, radius * 1.78, 0, 2, 0, smooth);
      if (!smooth) setDollying(false);
      return;
    }
    // 城市模式，或省域模式下已经选定了目标城市：都真正推近到该城市。
    if (mode === 'city' || focusCityId) {
      const view = cityView(targetPoint, radius);
      if (smooth) setDollying(true);
      void instance.setLookAt(
        view.position[0], view.position[1], view.position[2],
        view.target[0], view.target[1], view.target[2],
        smooth,
      );
      if (!smooth) setDollying(false);
      return;
    }
    if (smooth) setDollying(true);
    void instance.setLookAt(radius * 0.04, radius * 1.08, radius * 1.36, 0, 2, 0, smooth);
    if (!smooth) setDollying(false);
  }, [mode, focusCityId, dollyToken, reducedMotion, targetPoint, provinceRadius]);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={14}
      maxDistance={provinceRadius * 4}
      minPolarAngle={0.12}
      maxPolarAngle={Math.PI / 2.25}
      smoothTime={reducedMotion ? 0 : MOTION_DURATION.fast}
      draggingSmoothTime={MOTION_DURATION.fast}
      dollySpeed={0.7}
      onRest={() => {
        setDollying(false);
        onCameraRest?.();
      }}
    />
  );
}

function SceneContents({ mode, focusCityId, hoveredCityId, dollyToken, onHoverCity, onSelectCity, onCameraRest, reducedMotion }: LiaoningCanvasProps) {
  const state = useLiaoningModel();
  const studyIds = useMemo(() => new Set<string>(STUDY_CITY_IDS), []);
  const model = state.status === 'ready' ? state.model : null;
  /** Opening 揭示进度由驱动组件写、由每座城市读，中间不经过 React state。 */
  const revealRef = useRef(1);

  const focusPoint = useMemo(() => {
    if (!model) return new THREE.Vector3();
    const city = model.cities.find((entry) => entry.id === focusCityId);
    if (!city) return new THREE.Vector3(0, 0, 0);
    return new THREE.Vector3(city.centroid.x, 0, -city.centroid.y);
  }, [model, focusCityId]);

  if (!model) return null;

  const emphasisFor = (cityId: string, hasResearch: boolean): Emphasis => {
    if (hoveredCityId) return hoveredCityId === cityId ? 'focus' : 'dim';
    if (hasResearch) return 'study';
    return studyIds.has(cityId) ? 'study' : 'base';
  };

  return (
    <>
      <CameraRig
        mode={mode}
        focusCityId={focusCityId}
        dollyToken={dollyToken}
        reducedMotion={reducedMotion}
        onCameraRest={onCameraRest}
        targetPoint={focusPoint}
        provinceRadius={model.radius}
      />
      {/* 承载平面在最底层：辽宁实体 → 接触阴影 → 纸面（V3 §41） */}
      <PaperGround radius={model.radius} />
      {/*
        接触阴影：目标是"让辽宁像真的从纸面浮起来"，不是真实光影（V2 §53/§54）。
        frames={1} 只烘焙一次，因此没有逐帧成本；若日后发现它变贵，删掉即可。
        注意：drei 烘焙时会临时把 scene.background 置空后写进自己的 render target，
        因此 Canvas 必须是 alpha:true，否则 render target 会被不透明清屏，
        这块阴影平面会变成一块实心方块、在纸面上留下一条方形边缘（V3 §64 明令禁止）。
      */}
      <ContactShadows
        frames={1}
        position={[0, -0.02, 0]}
        scale={Math.max(200, model.radius * 6)}
        far={8}
        blur={2.5}
        opacity={0.16}
        resolution={512}
      />
      <OpeningRevealDriver mode={mode} reducedMotion={reducedMotion} progressRef={revealRef} />
      {/* 视差只服务 Opening 与正式省域沙盘；城市 Reader 会收敛回 0（V4 §二十一） */}
      <ParallaxGroup strength={mode === 'opening' ? 'opening' : 'province'} enabled={mode === 'opening' || mode === 'province'}>
        {model.cities.map((city, index) => (
          <CitySolidMesh
            key={city.id}
            city={city}
            emphasis={emphasisFor(city.id, city.hasResearch)}
            hovered={hoveredCityId === city.id}
            onHover={onHoverCity}
            onSelect={onSelectCity}
            reducedMotion={reducedMotion}
            revealRef={revealRef}
            revealDelay={index * 0.02}
          />
        ))}
      </ParallaxGroup>
      {mode !== 'opening' && model.cities.map((city) => {
        const active = hoveredCityId === city.id || focusCityId === city.id;
        if (!city.hasResearch && !studyIds.has(city.id) && !active) return null;
        return (
          <Html
            key={`label-${city.id}`}
            position={[city.centroid.x, SOLID_DEPTH + (hoveredCityId === city.id ? 1.4 : 0.9), -city.centroid.y]}
            center
            zIndexRange={[3, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <span className={`liaoning-label${active ? ' is-active' : ''}${city.hasResearch ? ' is-research' : ''}`}>
              {city.shortName}
              {city.hasResearch && <em>研究</em>}
            </span>
          </Html>
        );
      })}
    </>
  );
}

/** 省域 3D 沙盘画布。整站共享一个 Canvas，路由只切换相机与可见性。 */
export function LiaoningCanvas(props: LiaoningCanvasProps) {
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const quality = props.reducedMotion ? 'performance' : resolveAutoQualityTier(readRuntimeQualitySignals());
  const dpr = resolveDpr(viewport.width, viewport.height, window.devicePixelRatio || 1, QUALITY_CONFIG[quality]);

  return (
    <Canvas
      dpr={dpr}
      frameloop="demand"
      gl={{ antialias: quality === 'quality', alpha: true, powerPreference: 'high-performance', stencil: false }}
      onPointerMissed={() => props.onHoverCity(null)}
      onCreated={({ gl }) => {
        gl.domElement.setAttribute('role', 'img');
        gl.domElement.setAttribute('aria-label', '辽宁省农业气候研究空间 · 三维行政区域沙盘');
      }}
    >
      <color attach="background" args={[SCENE_TOKENS.paper]} />
      <PerspectiveCamera makeDefault fov={38} near={1} far={1200} position={[0, 70, 110]} />
      <hemisphereLight args={[SCENE_TOKENS.lightKey, SCENE_TOKENS.lightFill, 1.05]} />
      <directionalLight position={[-40, 70, 40]} intensity={0.85} />
      <directionalLight position={[30, 40, -50]} intensity={0.25} />
      <SceneContents {...props} />
    </Canvas>
  );
}
