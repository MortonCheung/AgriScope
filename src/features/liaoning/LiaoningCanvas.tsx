import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { CameraControls, CameraControlsImpl, ContactShadows, Html, PerspectiveCamera } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { STUDY_CITY_IDS } from '../../domain/geography/cities';
import { CitySolidMesh, DROP_SPAN, SOLID_DEPTH } from './CitySolidMesh';
import { PaperGround } from './PaperGround';
import { useLiaoningModel } from './useLiaoningModel';
import { useAnimationFrames } from './useAnimationFrames';
import { QUALITY_CONFIG, resolveAutoQualityTier, resolveDpr, readRuntimeQualitySignals } from '../../performance/qualityPolicy';
import { SCENE_TOKENS } from '../../design/sceneTokens';
import { MOTION_DURATION } from '../../design/motion';
import { PROVINCE_ROOT_ROTATION, cityView, easeInOutCubic, orbitView, provinceView, sketchView } from './cameraViews';
import { SketchPaper } from '../opening/SketchPaper';
import { useOpeningStore, type OpeningPhase } from '../opening/openingPhase';

export interface LiaoningCanvasProps {
  mode: 'opening' | 'province' | 'city';
  focusCityId: string | null;
  hoveredCityId: string | null;
  onHoverCity: (cityId: string | null) => void;
  onSelectCity: (cityId: string) => void;
  reducedMotion: boolean;
}

type Emphasis = 'base' | 'study' | 'focus' | 'dim';

/**
 * 组装总时长（V5 §59：3.2–4.0 秒）。
 * 这一条时间轴同时驱动行政区下落与相机环绕，不是两段动画接在一起。
 */
const ASSEMBLY_MS = 3600;
/** 第一批行政区开始下落的时间点（§59：0.10）。 */
const DROP_DELAY_BASE = 0.1;
/** 错峰窗口：最后一批在 0.65 开始，配合 DROP_SPAN=0.25 时 0.90 全部落定（§59）。 */
const DROP_DELAY_SPAN = 0.55;

/** 视差强度（V4 §二十一）：省域 0.7°。 */
const PARALLAX_DEG = { province: 0.7 } as const;
const PARALLAX_LERP = 0.08;
const PARALLAX_EPSILON = 0.0002;

/**
 * 极轻的鼠标视差（V4 §二十/§64）。
 *
 * 不依赖任何固定时长：pointermove → target → invalidate()；
 * useFrame 向 target 收敛，未收敛继续 invalidate()，收敛即停。
 * 只在正式省域生效；组装期间关闭，避免与相机环绕抢控制权。
 */
function ParallaxGroup({ enabled, children }: { enabled: boolean; children: ReactNode }) {
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
    const limit = enabled ? THREE.MathUtils.degToRad(PARALLAX_DEG.province) : 0;
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
 * 组装驱动（V5 §58/§59/§60/§61）。
 *
 * 一条 0→1 的时间轴，**每帧**同时做两件事：
 *   1. 写 assemblyRef —— 14 块行政区据此下落；
 *   2. 按 orbitView 写相机 —— 方位变化 118° 后精确落到省域位姿（不是绕一整圈，§24）。
 * 因为 progress 本身已经 easing，每帧调用 setLookAt(..., false)，
 * 不能再套 smooth=true，否则每帧再平滑一次会产生滞后（§61）。
 */
function AssemblyDriver({ active, reducedMotion, assemblyRef, controlsRef, radius, onProgress }: {
  active: boolean;
  reducedMotion: boolean;
  assemblyRef: RefObject<number>;
  controlsRef: RefObject<CameraControlsImpl | null>;
  radius: number;
  onProgress: (progress: number) => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const finish = useOpeningStore((state) => state.finish);

  useEffect(() => {
    if (!active) return;
    const controls = controlsRef.current;
    if (reducedMotion) {
      assemblyRef.current = 1;
      onProgress(1);
      const pose = provinceView(radius);
      void controls?.setLookAt(...pose.position, ...pose.target, false);
      invalidate();
      finish();
      return;
    }
    const start = performance.now();
    let frame = 0;
    let lastReported = 0;
    const step = () => {
      const progress = Math.min(1, (performance.now() - start) / ASSEMBLY_MS);
      assemblyRef.current = progress;
      const pose = orbitView(radius, easeInOutCubic(progress));
      void controls?.setLookAt(...pose.position, ...pose.target, false);
      invalidate();
      if (progress - lastReported > 0.04 || progress === 1) {
        lastReported = progress;
        onProgress(progress);
      }
      if (progress < 1) frame = requestAnimationFrame(step);
      else finish();
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, assemblyRef, controlsRef, finish, invalidate, radius, reducedMotion]);

  return null;
}

function CameraRig({ mode, phase, focusCityId, reducedMotion, targetPoint, provinceRadius, controlsRef }: {
  mode: LiaoningCanvasProps['mode'];
  phase: OpeningPhase;
  focusCityId: string | null;
  reducedMotion: boolean;
  targetPoint: THREE.Vector3;
  provinceRadius: number;
  controlsRef: RefObject<CameraControlsImpl | null>;
}) {
  /** 相机是否正在移动：为真时逐帧请求渲染，否则静止画布上的 setLookAt 不会开始也不会结束。 */
  const [dollying, setDollying] = useState(false);
  useAnimationFrames(dollying, MOTION_DURATION.camera * 3);

  useEffect(() => {
    const instance = controlsRef.current;
    if (!instance) return;
    const smooth = !reducedMotion;
    const radius = Math.max(12, provinceRadius);
    const move = (pose: { position: readonly [number, number, number]; target: readonly [number, number, number] }) => {
      if (smooth) setDollying(true);
      void instance.setLookAt(...pose.position, ...pose.target, smooth);
      if (!smooth) setDollying(false);
    };

    if (mode === 'opening') {
      if (phase === 'sketch') { move(sketchView(radius)); return; }
      // assembling 期间相机由 AssemblyDriver 逐帧写；这里只在完成态补一次收尾。
      if (phase === 'ready') move(provinceView(radius));
      return;
    }

    if (mode === 'city' || focusCityId) {
      move(cityView({ x: targetPoint.x, z: targetPoint.z }, radius));
      return;
    }
    move(provinceView(radius));
  }, [controlsRef, focusCityId, mode, phase, provinceRadius, reducedMotion, targetPoint]);

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      minDistance={14}
      maxDistance={provinceRadius * 5}
      minPolarAngle={0.12}
      maxPolarAngle={Math.PI / 2.25}
      smoothTime={reducedMotion ? 0 : MOTION_DURATION.fast}
      draggingSmoothTime={MOTION_DURATION.fast}
      dollySpeed={0.7}
      onRest={() => setDollying(false)}
    />
  );
}

function SceneContents({ mode, focusCityId, hoveredCityId, onHoverCity, onSelectCity, reducedMotion }: LiaoningCanvasProps) {
  const state = useLiaoningModel();
  const studyIds = useMemo(() => new Set<string>(STUDY_CITY_IDS), []);
  const model = state.status === 'ready' ? state.model : null;
  const openingPhase = useOpeningStore((store) => store.phase);
  /** 组装进度：驱动组件写、行政区每帧读，中间不经过 React state。 */
  const assemblyRef = useRef(0);
  /** 相机控制器提到这一层，让镜头与行政区共用同一条时间轴（§58）。 */
  const controlsRef = useRef<CameraControlsImpl | null>(null);
  /** 草图渐退需要 React 重渲染，因此单独维持一个低频进度（§63）。 */
  const [paperProgress, setPaperProgress] = useState(0);

  /** Opening 阶段只在本路由生效：直接深链 /liaoning 时必须给完整沙盘。 */
  const phase: OpeningPhase = mode === 'opening' ? openingPhase : 'ready';

  const focusPoint = useMemo(() => {
    if (!model) return new THREE.Vector3();
    const city = model.cities.find((entry) => entry.id === focusCityId);
    if (!city) return new THREE.Vector3(0, 0, 0);
    return new THREE.Vector3(city.centroid.x, 0, -city.centroid.y);
  }, [model, focusCityId]);

  /**
   * 下落顺序与高度（§29/§30/§59）：按"到沈阳重心距离"确定性排序，不用 Math.random()；
   * 起始高度按省域与城市比例决定，并在 0.10–0.65 之间错峰，0.90 全部落定。
   */
  const dropPlan = useMemo(() => {
    if (!model) return [];
    const origin = model.cities.find((city) => city.id === 'shenyang')?.centroid ?? model.centroid;
    const ordered = model.cities
      .map((city) => ({ city, distance: city.centroid.distanceTo(origin) }))
      .sort((a, b) => a.distance - b.distance);
    return ordered.map((entry, index) => ({
      ...entry,
      delay: DROP_DELAY_BASE + (ordered.length > 1 ? index / (ordered.length - 1) : 0) * DROP_DELAY_SPAN,
      dropHeight: model.radius * 0.5 + entry.city.radius * 1.3,
    }));
  }, [model]);

  useEffect(() => {
    if (phase !== 'sketch' && mode === 'opening' && paperProgress === 0) setPaperProgress(0);
  }, [mode, paperProgress, phase]);

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
        phase={phase}
        focusCityId={focusCityId}
        reducedMotion={reducedMotion}
        targetPoint={focusPoint}
        provinceRadius={model.radius}
        controlsRef={controlsRef}
      />
      <PaperGround radius={model.radius} />
      {/* 草稿纸：暖灰方格 + 手稿边界；随组装进度渐退（§55/§56/§63） */}
      <SketchPaper
        radius={model.radius}
        provinceRings={model.provinceRings}
        outlineRings={model.provinceOutlineRings}
        phase={phase}
        progress={paperProgress}
      />
      {/*
        接触阴影：frames={1} 只在挂载首帧烘焙一次，因此必须等区块落定后再挂载，
        否则草稿阶段还没有实体，会烘出一块"没有对象的阴影"。
        Canvas 必须是 alpha:true，否则那块阴影平面会变成实心方块（V3 §64）。
      */}
      {phase === 'ready' && (
        <ContactShadows
          frames={1}
          position={[0, -0.02, 0]}
          scale={Math.max(200, model.radius * 6)}
          far={8}
          blur={2.5}
          opacity={0.16}
          resolution={512}
        />
      )}
      <AssemblyDriver
        active={mode === 'opening' && phase === 'assembling'}
        reducedMotion={reducedMotion}
        assemblyRef={assemblyRef}
        controlsRef={controlsRef}
        radius={model.radius}
        onProgress={setPaperProgress}
      />
      {/*
        省域根节点（本轮 §24）：**全程不绕 Y 轴旋转** —— 转的是相机，不是模型。
        唯一的旋转是落定之后由指针驱动的 ±0.7° 轻微倾斜（ParallaxGroup，且组装期间关闭），
        那属于"纸放在桌上的手感"，不是模型自转。
      */}
      <group rotation-y={PROVINCE_ROOT_ROTATION} name="province-root">
        {/* 视差只服务正式省域（§64）：组装期间关闭 */}
        <ParallaxGroup enabled={!reducedMotion && mode === 'province'}>
          {dropPlan.map(({ city, delay, dropHeight }) => (
            <CitySolidMesh
              key={city.id}
              city={city}
              emphasis={emphasisFor(city.id, city.hasResearch)}
              hovered={hoveredCityId === city.id}
              onHover={onHoverCity}
              onSelect={onSelectCity}
              reducedMotion={reducedMotion}
              phase={phase}
              assemblyRef={assemblyRef}
              dropDelay={delay}
              dropHeight={dropHeight}
            />
          ))}
        </ParallaxGroup>
      </group>
      {/* 草稿阶段不出现任何城市 Label / 按钮 / 研究状态（§25） */}
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
