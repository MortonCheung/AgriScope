import { useEffect, useMemo, useRef, useState } from 'react';
import { CameraControls, CameraControlsImpl, Html, PerspectiveCamera } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { STUDY_CITY_IDS } from '../../domain/geography/cities';
import { CitySolidMesh, SOLID_DEPTH } from './CitySolidMesh';
import { useLiaoningModel } from './useLiaoningModel';
import { useAnimationFrames } from './useAnimationFrames';
import { QUALITY_CONFIG, resolveAutoQualityTier, resolveDpr, readRuntimeQualitySignals } from '../../performance/qualityPolicy';
import { SCENE_TOKENS } from '../../design/sceneTokens';
import { MOTION_DURATION } from '../../design/motion';

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
      <group>
        {model.cities.map((city) => (
          <CitySolidMesh
            key={city.id}
            city={city}
            emphasis={emphasisFor(city.id, city.hasResearch)}
            hovered={hoveredCityId === city.id}
            onHover={onHoverCity}
            onSelect={onSelectCity}
            reducedMotion={reducedMotion}
          />
        ))}
      </group>
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
      gl={{ antialias: quality === 'quality', alpha: false, powerPreference: 'high-performance', stencil: false }}
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
