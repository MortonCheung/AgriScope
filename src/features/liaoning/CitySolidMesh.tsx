import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ringsToShapes, type CitySolid } from './liaoningGeometry';

export const SOLID_DEPTH = 1.8;

interface CitySolidMeshProps {
  city: CitySolid;
  emphasis: 'base' | 'study' | 'focus' | 'dim';
  hovered: boolean;
  onHover: (cityId: string | null) => void;
  onSelect: (cityId: string) => void;
  reducedMotion: boolean;
}

const FILL: Record<CitySolidMeshProps['emphasis'], THREE.Color> = {
  base: new THREE.Color('#e3ded4'),
  study: new THREE.Color('#d5cec1'),
  focus: new THREE.Color('#c3b9a8'),
  dim: new THREE.Color('#efece5'),
};

/** 单块城市实体：挤出几何 + 极细分隔线。Hover 只轻微抬升与加深，不爆亮。 */
export function CitySolidMesh({ city, emphasis, hovered, onHover, onSelect, reducedMotion }: CitySolidMeshProps) {
  const group = useRef<THREE.Group>(null);
  const geometry = useMemo(() => {
    const shapes = ringsToShapes(city.rings);
    const extruded = new THREE.ExtrudeGeometry(shapes, { depth: SOLID_DEPTH, bevelEnabled: false, curveSegments: 1 });
    extruded.rotateX(-Math.PI / 2);
    extruded.computeVertexNormals();
    return extruded;
  }, [city.rings]);

  const edges = useMemo(() => {
    const list: THREE.EdgesGeometry[] = [];
    for (const shape of ringsToShapes(city.rings)) {
      const outline = new THREE.EdgesGeometry(new THREE.ShapeGeometry(shape, 1), 28);
      outline.rotateX(-Math.PI / 2);
      list.push(outline);
    }
    return list;
  }, [city.rings]);

  const target = hovered ? SOLID_DEPTH * 0.5 : 0;
  useFrame(() => {
    if (!group.current) return;
    if (reducedMotion) { group.current.position.y = target; return; }
    group.current.position.y += (target - group.current.position.y) * 0.14;
  });

  const fill = hovered ? FILL.focus : FILL[emphasis];

  return (
    <group ref={group}>
      <mesh
        geometry={geometry}
        onPointerOver={(event) => { event.stopPropagation(); onHover(city.id); }}
        onPointerOut={() => onHover(null)}
        onClick={(event) => { event.stopPropagation(); onSelect(city.id); }}
      >
        <meshStandardMaterial color={fill} roughness={0.92} metalness={0} flatShading={false} />
      </mesh>
      {edges.map((outline, index) => (
        <lineSegments key={index} geometry={outline}>
          <lineBasicMaterial color={hovered ? '#1a1917' : 'rgb(26 25 23 / 0.34)'} transparent opacity={hovered ? 0.9 : 1} />
        </lineSegments>
      ))}
    </group>
  );
}
