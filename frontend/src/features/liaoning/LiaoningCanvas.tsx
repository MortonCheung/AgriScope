import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { CameraControls, CameraControlsImpl, ContactShadows, Html, PerspectiveCamera } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import WebGL from 'three/addons/capabilities/WebGL.js';
import { STUDY_CITY_IDS } from '../../domain/geography/cities';
import { CityMapLabel } from './CityMapLabel';
import { CityMapNavigation } from './CityMapNavigation';
import type { CityWorldBounds } from './liaoningGeometry';
import { CitySolidMesh, SOLID_DEPTH } from './CitySolidMesh';
import { PaperGround } from './PaperGround';
import { useLiaoningModel } from './useLiaoningModel';
import { useAnimationFrames } from './useAnimationFrames';
import { QUALITY_CONFIG, resolveAutoQualityTier, resolveDpr, readRuntimeQualitySignals } from '../../performance/qualityPolicy';
import { SCENE_TOKENS } from '../../design/sceneTokens';
import { MOTION_DURATION } from '../../design/motion';
import { PROVINCE_ROOT_ROTATION, CAMERA_FOV_DEG, cityView, openingView, provinceCityView, provinceStageView, startOpeningTimeline, responsiveProvinceRadius, type CameraPose, type CityFocusFrame } from './cameraViews';
import { mapStageFrame } from './mapStageFrame';
import { DROP_DELAY_BASE, DROP_DELAY_SPAN } from '../opening/assemblyMetrics';
import { SketchPaper } from '../opening/SketchPaper';
import { shouldMountSketchPaper } from '../opening/sketchMetrics';
import { useOpeningStore, type OpeningPhase } from '../opening/openingPhase';
import { useSpatialStageStore } from '../spatial/spatialStageStore';
import './map-stage-layout.css';

export interface LiaoningCanvasProps {
  mode: 'opening' | 'province' | 'city';
  active?: boolean;
  /** Ambient task backgrounds retain the camera and scene without city controls. */
  interactive?: boolean;
  focusCityId: string | null;
  hoveredCityId: string | null;
  onHoverCity: (cityId: string | null) => void;
  onSelectCity: (cityId: string) => void;
  onBackgroundClick?: () => void;
  reducedMotion: boolean;
}

type Emphasis = 'base' | 'study' | 'focus' | 'dim';

/** 单条可取消时间线同时驱动地块与相机；模型不绕 Y 轴旋转。 */
function AssemblyDriver({ active, reducedMotion, assemblyRef, controlsRef, endPose, onProgress }: {
  active: boolean;
  reducedMotion: boolean;
  assemblyRef: RefObject<number>;
  controlsRef: RefObject<CameraControlsImpl | null>;
  endPose: CameraPose;
  onProgress: (progress: number) => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const finish = useOpeningStore((state) => state.finish);
  const poseRef = useRef(endPose);
  useLayoutEffect(() => { poseRef.current = endPose; }, [endPose]);

  useEffect(() => {
    if (!active) return;
    const controls = controlsRef.current;
    const settle = () => {
      assemblyRef.current = 1;
      onProgress(1);
      const pose = poseRef.current;
      void controls?.setLookAt(...pose.position, ...pose.target, false);
      invalidate();
    };
    if (reducedMotion) {
      settle();
      finish();
      return;
    }
    let lastReported = 0;
    const stop = startOpeningTimeline((progress) => {
      assemblyRef.current = progress;
      const pose = openingView(poseRef.current, progress);
      void controls?.setLookAt(...pose.position, ...pose.target, false);
      invalidate();
      if (progress - lastReported > 0.025 || progress === 1) {
        lastReported = progress;
        onProgress(progress);
      }
    }, finish);
    // Skip settles the actual controller synchronously, before the route can change.
    const unsubscribe = useOpeningStore.subscribe((state) => {
      if (state.phase === 'assembling') return;
      stop();
      if (state.phase === 'ready') settle();
    });
    return () => { stop(); unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, assemblyRef, controlsRef, finish, invalidate, reducedMotion]);

  return null;
}

function CameraRig({ mode, active, phase, focusCityId, reducedMotion, targetPoint, focusBounds, endPose, focusFrame, geometryRadius, provinceRadius, controlsRef }: {
  mode: LiaoningCanvasProps['mode'];
  active: boolean;
  phase: OpeningPhase;
  focusCityId: string | null;
  reducedMotion: boolean;
  targetPoint: THREE.Vector3;
  focusBounds: CityWorldBounds | null;
  endPose: CameraPose;
  focusFrame: CityFocusFrame;
  geometryRadius: number;
  provinceRadius: number;
  controlsRef: RefObject<CameraControlsImpl | null>;
}) {
  /** 相机是否正在移动：为真时逐帧请求渲染，否则静止画布上的 setLookAt 不会开始也不会结束。 */
  const moveSequence = useRef(0);
  const invalidate = useThree((store) => store.invalidate);
  const dollying = useSpatialStageStore((state) => state.cameraMoving);
  const setCameraMoving = useSpatialStageStore((state) => state.setCameraMoving);
  useAnimationFrames(dollying && active, MOTION_DURATION.camera * 3);
  useEffect(() => () => { moveSequence.current += 1; setCameraMoving(false); }, [setCameraMoving]);

  useEffect(() => {
    if (!active) { moveSequence.current += 1; setCameraMoving(false); return; }
    const instance = controlsRef.current;
    if (!instance) return;
    const radius = Math.max(12, provinceRadius);
    const move = (pose: { position: readonly [number, number, number]; target: readonly [number, number, number] }, animate = !reducedMotion) => {
      setCameraMoving(animate);
      const ticket = ++moveSequence.current;
      invalidate();
      void instance.setLookAt(...pose.position, ...pose.target, animate).then(() => {
        if (ticket === moveSequence.current) setCameraMoving(false);
      });
    };

    if (mode === 'opening') {
      if (phase === 'sketch') { move(openingView(endPose, 0), false); return; }
      // assembling 期间相机由 AssemblyDriver 逐帧写；这里只在完成态补一次收尾。
      if (phase === 'ready') move(endPose, false);
      return;
    }

    if (mode === 'city') {
      move(cityView({ x: targetPoint.x, z: targetPoint.z }, radius));
      return;
    }
    if (mode === 'province' && focusCityId && focusBounds) {
      move(provinceCityView(focusBounds, geometryRadius, focusFrame));
      return;
    }
    move(endPose);
  }, [active, controlsRef, endPose, focusBounds, focusCityId, focusFrame, geometryRadius, invalidate, mode, phase, provinceRadius, reducedMotion, setCameraMoving, targetPoint]);

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      enabled={active && mode !== 'opening'}
      minDistance={14}
      maxDistance={provinceRadius * 9}
      minPolarAngle={0.12}
      maxPolarAngle={Math.PI / 2.25}
      smoothTime={reducedMotion ? 0 : 0.18}
      draggingSmoothTime={MOTION_DURATION.fast}
      dollySpeed={0.7}
    />
  );
}

function SceneContents({ mode, active = true, focusCityId, hoveredCityId, onHoverCity, onSelectCity, reducedMotion }: LiaoningCanvasProps) {
  const state = useLiaoningModel();
  const viewport = useThree((store) => store.size);
  const gl = useThree((store) => store.gl);
  const aspect = viewport.width / Math.max(1, viewport.height);
  const measureFrame = () => mapStageFrame(gl.domElement.getBoundingClientRect(), gl.domElement.closest('.spatial-shell__canvas')?.querySelector('.liaoning-map-frame')?.getBoundingClientRect(), viewport);
  const [focusFrame, setFocusFrame] = useState<CityFocusFrame>(measureFrame);
  useLayoutEffect(() => {
    const stage = gl.domElement.closest('.spatial-shell__canvas')?.querySelector('.liaoning-map-frame');
    const measure = () => {
      const frame = mapStageFrame(gl.domElement.getBoundingClientRect(), stage?.getBoundingClientRect(), viewport);
      setFocusFrame(previous => Object.keys(frame).every(key => previous[key as keyof CityFocusFrame] === frame[key as keyof CityFocusFrame]) ? previous : frame);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (stage) observer?.observe(stage);
    observer?.observe(gl.domElement);
    return () => observer?.disconnect();
  }, [gl, viewport.height, viewport.width]);
  const studyIds = useMemo(() => new Set<string>(STUDY_CITY_IDS), []);
  useEffect(() => {
    gl.domElement.style.cursor = active && mode === 'province' && hoveredCityId && studyIds.has(hoveredCityId) ? 'pointer' : '';
    return () => { gl.domElement.style.cursor = ''; };
  }, [active, gl, hoveredCityId, mode, studyIds]);
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

  /**
   * 城市选择仅来自省域 URL；hover 不覆盖锁定选择。
   */
  const selectedCityId = mode === 'province' ? focusCityId : null;

  /**
   * 省域路由下点击城市：更新 /liaoning?city= 的显式选择，
   * **不立即跳页** —— 右侧摘要给出「进入决策 / 查看研究」两个显式入口。
   * 未开放研究的行政区不承担选择或导航。
   */
  const handleSelectCity = (cityId: string) => {
    if (mode !== 'opening' && studyIds.has(cityId)) onSelectCity(cityId);
  };

  const focusPoint = useMemo(() => {
    if (!model) return new THREE.Vector3();
    const city = model.cities.find((entry) => entry.id === focusCityId);
    if (!city) return new THREE.Vector3(0, 0, 0);
    return new THREE.Vector3(city.centroid.x, 0, -city.centroid.y);
  }, [model, focusCityId]);
  const focusBounds = model?.cities.find(city => city.id === focusCityId)?.bounds ?? null;
  const endPose = useMemo(() => model ? provinceStageView(model.bounds, model.radius, focusFrame) : null, [model, focusFrame]);

  /**
   * 下落顺序与高度（§29/§30/§59）：按"到沈阳重心距离"确定性排序，不用 Math.random()；
   * 起始高度按省域与城市比例决定，少量错峰后在 0.92 全部落定。
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

  /**
   * 回到草稿态时把图纸进度清零（§11/§15）：否则再次进入 `/` 时，
   * 网格会带着上一次"已组装完"的进度直接消失，看不到完整草稿。
   * 幂等：已是 0 时 setState 会被 React 丢弃，不会额外重渲染。
   */
  useEffect(() => {
    if (mode !== 'opening' || phase !== 'sketch') return;
    assemblyRef.current = 0;
    setPaperProgress(0);
  }, [mode, phase]);

  if (!model || !endPose) return null;
  const fitRadius = responsiveProvinceRadius(model.radius,aspect);

  const emphasisFor = (cityId: string, hasResearch: boolean): Emphasis => {
    if (hoveredCityId) return hoveredCityId === cityId ? 'focus' : 'dim';
    if (selectedCityId) return selectedCityId === cityId ? 'focus' : 'base';
    if (hasResearch) return 'study';
    return studyIds.has(cityId) ? 'study' : 'base';
  };

  return (
    <>
      <CameraRig
        mode={mode}
        active={active}
        phase={phase}
        focusCityId={focusCityId}
        reducedMotion={reducedMotion}
        targetPoint={focusPoint}
        focusBounds={focusBounds}
        endPose={endPose}
        focusFrame={focusFrame}
        geometryRadius={model.radius}
        provinceRadius={fitRadius}
        controlsRef={controlsRef}
      />
      <PaperGround radius={model.radius} />
      {/*
        草稿纸：暖灰方格 + 手稿边界，**只在 Opening 路由挂载**（§14/§15）——
        正式省域页根本不渲染它，而不是把 opacity 调到 0。
        随组装进度在 0.15→0.82 之间淡出，0.82 之后只剩正在落定的 3D 辽宁。
      */}
      {shouldMountSketchPaper(mode) && (
        <SketchPaper
          radius={model.radius}
          endPose={endPose}
          provinceRings={model.provinceRings}
          outlineRings={model.provinceOutlineRings}
          phase={phase}
          progress={paperProgress}
        />
      )}
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
        endPose={endPose}
        onProgress={setPaperProgress}
      />
      {/*
        省域根节点（本轮 §24）：**全程不绕 Y 轴旋转** —— 转的是相机，不是模型。
        固定姿态保证屏幕中的地块与可点击表面保持一致。
      */}
      <group rotation-y={PROVINCE_ROOT_ROTATION} name="province-root">
        {/* 固定沙盘姿态；选择仅改变相机与地块强调。 */}
        <group>
          {dropPlan.map(({ city, delay, dropHeight }) => (
            <CitySolidMesh
              key={city.id}
              city={city}
              emphasis={emphasisFor(city.id, city.hasResearch)}
              selected={mode === 'province' && selectedCityId === city.id}
              hovered={hoveredCityId === city.id}
              onHover={onHoverCity}
              onSelect={handleSelectCity}
              reducedMotion={reducedMotion}
              phase={phase}
              assemblyRef={assemblyRef}
              dropDelay={delay}
              dropHeight={dropHeight}
            />
          ))}
        </group>
      </group>
      {/* 草稿阶段不出现任何城市 Label / 按钮 / 研究状态（§25） */}
      {active && mode !== 'opening' && model.cities.map((city) => {
        const highlighted = hoveredCityId === city.id || (mode === 'province' && selectedCityId === city.id);
        if (!studyIds.has(city.id)) return null;
        return (
          <Html
            key={`label-${city.id}`}
            position={[city.centroid.x, SOLID_DEPTH + (hoveredCityId === city.id ? 1.4 : 0.9), -city.centroid.y]}
            center
            zIndexRange={[3, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <CityMapLabel cityId={city.id} name={city.shortName} highlighted={highlighted} hasResearch={city.hasResearch}/>
          </Html>
        );
      })}
    </>
  );
}

class MapBoundary extends Component<{children:ReactNode;onUnavailable:()=>void},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(){this.props.onUnavailable();}
  render(){return this.state.failed?null:this.props.children;}
}

/** 省域 3D 沙盘画布。整站共享一个 Canvas，路由只切换相机与可见性。 */
export function LiaoningCanvas(props: LiaoningCanvasProps) {
  const pointerOrigin = useRef<{ x: number; y: number } | null>(null);
  const modelState=useLiaoningModel();
  const [webglAvailable] = useState(() => WebGL.isWebGL2Available());
  const [contextLost,setContextLost]=useState(false);
  const [rendererUnavailable, setRendererUnavailable] = useState(false);
  const markUnavailable = useCallback(() => setRendererUnavailable(true), []);
  const contextCleanup=useRef<(() => void)|null>(null);
  useEffect(()=>()=>contextCleanup.current?.(),[]);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const quality = props.reducedMotion ? 'performance' : resolveAutoQualityTier(readRuntimeQualitySignals());
  const dpr = resolveDpr(viewport.width, viewport.height, window.devicePixelRatio || 1, QUALITY_CONFIG[quality]);

  return (
    <>
    {props.active !== false && props.interactive !== false && props.mode !== 'opening' && <CityMapNavigation onSelectCity={props.onSelectCity} onHoverCity={props.onHoverCity}
      selectedCityId={props.focusCityId} fallback={!webglAvailable || modelState.status === 'error' || contextLost || rendererUnavailable}/>}
    {webglAvailable && modelState.status !== 'error' &&
    <MapBoundary onUnavailable={markUnavailable}>
    <div className="liaoning-map-frame" aria-hidden="true" inert />
    <Canvas
      fallback={null}
      dpr={dpr}
      frameloop="demand"
      gl={{ antialias: quality === 'quality', alpha: true, powerPreference: 'high-performance', stencil: false }}
      onPointerDownCapture={event => { pointerOrigin.current = event.button === 0 ? { x: event.clientX, y: event.clientY } : null; }}
      onPointerMissed={event => {
        props.onHoverCity(null);
        const origin = pointerOrigin.current;
        if (event.type === 'click' && event.button === 0 && origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) <= 5) props.onBackgroundClick?.();
        pointerOrigin.current = null;
      }}
      onCreated={({ gl }) => {
        contextCleanup.current?.();
        const lost=(event:Event)=>{event.preventDefault();setContextLost(true);};const restored=()=>setContextLost(false);
        gl.domElement.addEventListener('webglcontextlost',lost);
        gl.domElement.addEventListener('webglcontextrestored',restored);
        contextCleanup.current=()=>{gl.domElement.removeEventListener('webglcontextlost',lost);gl.domElement.removeEventListener('webglcontextrestored',restored);};
        gl.domElement.setAttribute('role', 'img');
        gl.domElement.setAttribute('aria-label', '辽宁省农业气候研究空间 · 三维行政区域沙盘');
      }}
    >
      <color attach="background" args={[SCENE_TOKENS.paper]} />
      <PerspectiveCamera makeDefault fov={CAMERA_FOV_DEG} near={1} far={1200} position={[0, 70, 110]} />
      <hemisphereLight args={[SCENE_TOKENS.lightKey, SCENE_TOKENS.lightFill, 1.05]} />
      <directionalLight position={[-40, 70, 40]} intensity={0.85} />
      <directionalLight position={[30, 40, -50]} intensity={0.25} />
      <SceneContents {...props} active={props.active !== false && !contextLost} />
    </Canvas>
    </MapBoundary>}
    </>
  );
}
