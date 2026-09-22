import { SCENE_TOKENS } from '../../design/sceneTokens';

/**
 * 纸面承载平面（V3 §41 / §42 / §64）。
 *
 * 层次是：辽宁实体 → ContactShadows → PaperGround，用来表达"实体落在一张桌面上"。
 *
 * - 平面必须足够大（省域半径的 10 倍且不小于 2000），任何相机角度都看不到方形地板边缘（§64）；
 * - roughness = 1、metalness = 0：哑光纸浆感，不反光；
 * - 颜色与 Canvas background 接近但不完全相同，靠接触阴影形成非常轻的纸面/桌面层次（§41）；
 * - 不加纸纹、不做旧、不发黄（§42）——目标是当代研究出版物，不是复古纸。
 */
export function PaperGround({ radius }: { radius: number }) {
  // 必须远超任何相机角度下可见的地面范围（省域视角约需 ±400），否则会露出方形地板边缘（§64）。
  const size = Math.max(2000, radius * 10);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color={SCENE_TOKENS.ground} roughness={1} metalness={0} />
    </mesh>
  );
}
