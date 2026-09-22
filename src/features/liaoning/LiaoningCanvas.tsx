import { useEffect, useMemo, useRef, useState } from 'react';
import { CameraControls, CameraControlsImpl, Html, PerspectiveCamera } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { STUDY_CITY_IDS } from '../../domain/geography/cities';
import { CitySolidMesh, SOLID_DEPTH } from './CitySolidMesh';
import { useLiaoningModel } from './useLiaoningModel';
import { QUALITY_CONFIG, resolveAutoQualityTier, resolveDpr, readRuntimeQualitySignals } from '../../performance/qualityPolicy';
import { SCENE_TOKENS } from '../../design/sceneTokens';

export interface LiaoningCanvasProps {
  mode: 'opening' | 'province' | 'city';
  focusCityId: string | null;
  hoveredCityId: string | null;
  dollyToken: number;
  onHoverCity: (cityId: string | null) => void;
  onSelectCity: (cityId: string) => void;
  reducedMotion: boolean;
}

type Emphasis = 'base' | 'study' | 'focus' | 'dim';

function CameraRig({ mode, focusCityId, dollyToken, reducedMotion, targetPoint, provinceRadius }: {
  mode: LiaoningCanvasProps['mode'];
  focusCityId: string | null;
  dollyToken: number;
  reducedMotion: boolean;
  targetPoint: THREE.Vector3;
  provinceRadius: number;
}) {
  const controls = useRef<CameraControlsImpl>(null);
  useEffect(() => {
    const instance = controls.current;
    if (!instance) return;
    const smooth = !reducedMotion;
    const radius = Math.max(12, provinceRadius);
    if (mode === 'opening') {
      void instance.setLookAt(radius * 0.1, radius * 0.86, radius * 1.78, 0, 2, 0, smooth);
      return;
    }
    if (mode === 'city') {
      void instance.setLookAt(targetPoint.x + radius * 0.24, radius * 0.5, targetPoint.z + radius * 0.5, targetPoint.x, 1.6, targetPoint.z, smooth);
      return;
    }
    void instance.setLookAt(radius * 0.04, radius * 1.08, radius * 1.36, 0, 2, 0, smooth);
  }, [mode, focusCityId, dollyToken, reducedMotion, targetPoint, provinceRadius]);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={14}
      maxDistance={provinceRadius * 4}
      minPolarAngle={0.12}
      maxPolarAngle={Math.PI / 2.25}
      smoothTime={reducedMotion ? 0 : 0.28}
      draggingSmoothTime={0.08}
      dollySpeed={0.7}
    />
  );
}

function SceneContents({ mode, focusCityId, hoveredCityId, dollyToken, onHoverCity, onSelectCity, reducedMotion }: LiaoningCanvasProps) {
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
